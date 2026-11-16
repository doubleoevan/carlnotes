// exercises the production Journal transaction with migrated Postgres and pgvector
import { afterAll, beforeAll, expect, test } from "bun:test"
import { TOPIC_MEMORY_ACTIVE_LIMIT } from "@carlnotes/contracts/topicMemories"
import { db } from "@carlnotes/db"
import { EMBED_DIMENSIONS, EMBED_MODEL_NAME, findings, resources, scans } from "@carlnotes/db/schema/scans"
import { teamMembers, teams } from "@carlnotes/db/schema/teams"
import { topicMemories, topicMemoryDecisions } from "@carlnotes/db/schema/topicMemories"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import {
	loadMemberTopicMemoriesPage,
	loadRankedTopicMemories,
	loadTopicMemoriesPage,
	saveTopicMemoryFeedback,
} from "@carlnotes/db/topicMemories"
import { eq, sql } from "drizzle-orm"
import type { EmbeddedTopicMemoryWrite } from "./applyTopicMemoryWrite"
import { loadTopicMemoryFindings, loadTopicMemoryNeighbors } from "./topicMemoryEvidence"
import { toTopicMemoryPromptText } from "./topicMemoryPrompt"
import { saveTopicMemoryUpdates } from "./topicMemoryWrites"

const signal = new AbortController().signal

beforeAll(async () => {
	// fail before any write if the configured database is not disposable
	const {
		rows: [fixture],
	} = await db.execute<{ database: string; pgvector: string | null }>(sql`
		select current_database() as database,
			(select extversion from pg_extension where extname = 'vector') as pgvector
	`)
	if (!fixture?.database.startsWith("journal_test_") || !fixture.pgvector) {
		throw new Error("Use a migrated disposable journal_test_* Postgres database with pgvector")
	}
	console.log(`Postgres database ${fixture.database}, pgvector ${fixture.pgvector}`)
})

afterAll(async () => {
	await db.$client.end()
})

test("Journal writes add, merge, flag, block, reactivate and record decision-time cosine", async () => {
	await withTopic(async ({ topicId }) => {
		const scanIds = []
		for (let index = 1; index <= 7; index++) {
			scanIds.push(await insertBrew(topicId, index))
		}
		// a fresh candidate is added, then paraphrasing merges into its id
		const [firstBrew, secondBrew, thirdBrew, fourthBrew, fifthBrew, sixthBrew, seventhBrew] = scanIds as [
			Brew,
			Brew,
			Brew,
			Brew,
			Brew,
			Brew,
			Brew,
		]
		await writeTakeaway(firstBrew, "Brew at 90 degrees.", vector(1))
		const [first] = await loadMemories(topicId)
		expect(first?.status).toBe("active")
		if (!first) {
			throw new Error("The first brew did not add a takeaway")
		}
		await writeTakeaway(secondBrew, "Set the kettle to 90 degrees.", vector(1))
		expect(await loadMemories(topicId)).toMatchObject([
			{ id: first.id, findingIds: [firstBrew.findingId, secondBrew.findingId] },
		])

		// an outdated match reactivates, and the middling vector is flagged
		await db.update(topicMemories).set({ status: "outdated" }).where(eq(topicMemories.id, first.id))
		await writeTakeaway(thirdBrew, "Use water heated to 90 degrees.", vector(1))
		expect(await loadMemories(topicId)).toMatchObject([
			{ id: first.id, status: "active", lastSeenScanId: thirdBrew.scanId },
		])
		await writeTakeaway(fourthBrew, "Set the kettle near 90 degrees.", vector(0.88))
		const flagged = (await loadMemories(topicId)).find(({ needsReview }) => needsReview)
		expect(flagged?.reviewMatchId).toBe(first.id)
		expect(await readDecisionCosines(fourthBrew.scanId)).toMatchObject([
			{ kind: "flag", source: "similarity", matchMemoryId: first.id },
		])
		expect((await readDecisionCosines(fourthBrew.scanId))[0]?.cosine).toBeCloseTo(0.88, 5)

		// the fifth brew confirms its flagged pair using both texts, dates, and live public Findings
		await db.update(findings).set({ sourceVisibility: "private" }).where(eq(findings.id, firstBrew.findingId))
		await saveTopicMemoryUpdates({
			scanId: fifthBrew.scanId,
			topicId,
			writes: [],
			signal,
			confirmCleanup: async (pairs) => {
				expect(pairs).toHaveLength(1)
				expect(pairs[0]?.takeaways).toMatchObject([
					{ text: "Set the kettle near 90 degrees.", firstSeenDay: "2026-11-04", findings: [{ day: "2026-11-04" }] },
					{
						text: "Use water heated to 90 degrees.",
						lastSeenDay: "2026-11-03",
						findings: [{ day: "2026-11-02" }, { day: "2026-11-03" }],
					},
				])
				return pairs.map(({ id, revision }) => ({ id, revision, verdict: "duplicate" }))
			},
		})
		expect((await loadMemories(topicId)).find(({ id }) => id === flagged?.id)).toMatchObject({
			status: "outdated",
			replacedById: first.id,
		})
		expect((await readDecisionCosines(fifthBrew.scanId))[0]).toMatchObject({ kind: "merge", source: "cleanup" })
		expect((await readDecisionCosines(fifthBrew.scanId))[0]?.cosine).toBeCloseTo(0.88, 5)

		// the first-pass model can nominate a pair. a distinct second review can still keep both texts
		await writeTakeaway(sixthBrew, "Use 90-degree water for this brew.", vector(0.97), first.id)
		expect(await readDecisionCosines(sixthBrew.scanId)).toMatchObject([
			{ kind: "flag", source: "model", matchMemoryId: first.id },
		])
		expect((await readDecisionCosines(sixthBrew.scanId))[0]?.cosine).toBeCloseTo(0.97, 5)
		expect((await readDecisionCosines(secondBrew.scanId))[0]?.cosine).toBeCloseTo(1, 5)

		// a rejected text blocks even a proposal with a different vector and case
		await saveTopicMemoryFeedback({
			topicId,
			topicMemoryId: first.id,
			userId: firstBrew.ownerId,
			feedback: { rating: "down" },
		})
		await writeTakeaway(seventhBrew, "USE water heated to 90 degrees.", vector(0))
		expect(await loadMemories(topicId)).toHaveLength(3)
		expect((await loadMemories(topicId)).find(({ id }) => id === first.id)?.status).toBe("rejected")
		expect(await readDecisionCosines(seventhBrew.scanId)).toEqual([])
	})
})

test("Journal write evicts the weakest row while retaining saved takeaways and corrections", async () => {
	await withTopic(async ({ topicId }) => {
		const first = await insertBrew(topicId, 1)
		const second = await insertBrew(topicId, 2)
		const seeded = await db
			.insert(topicMemories)
			.values(
				Array.from({ length: TOPIC_MEMORY_ACTIVE_LIMIT }, (_, index) => ({
					topicId,
					kind: "fact" as const,
					isAtomic: true,
					text: `Seed takeaway ${index}`,
					importance: index < 4 ? index * 0.01 : 0.9,
					findingIds: [first.findingId],
					firstScanId: first.scanId,
					lastSeenScanId: first.scanId,
					embedding: vector(1),
					embeddingModel: EMBED_MODEL_NAME,
				})),
			)
			.returning({ id: topicMemories.id })
		const [saved, corrected, loser] = seeded
		if (!saved || !corrected || !loser) {
			throw new Error("The eviction fixture is missing rows")
		}
		const { ownerId } = first
		expect(
			await saveTopicMemoryFeedback({ topicId, userId: ownerId, topicMemoryId: saved.id, feedback: { rating: "up" } }),
		).toBe("saved")
		expect(
			await saveTopicMemoryFeedback({
				topicId,
				userId: ownerId,
				topicMemoryId: corrected.id,
				feedback: { rating: "down", note: "Only for light roasts." },
			}),
		).toBe("saved")
		await writeTakeaway(second, "Try a different roast.", vector(0))
		const rows = await loadMemories(topicId)
		expect(rows.filter(({ status }) => status === "active")).toHaveLength(TOPIC_MEMORY_ACTIVE_LIMIT)
		expect(rows.filter(({ status }) => status === "outdated")).toMatchObject([{ id: loser.id, replacedById: null }])
	})
})

test("public external facts carry distinct person identities and the saved notes enter Carl's context", async () => {
	await withTopic(async ({ topicId, ownerId }) => {
		// use the actual cross-Topic podcast URL shape that used to survive review
		const ownEpisode = await insertBrew(
			topicId,
			1,
			`https://reader@carlnotes.com./topics/recreated/keeping-up-with-the-chens/episodes/2026/17?journal-integration=${topicId}`,
		)
		expect(await loadTopicMemoryFindings(ownEpisode.scanId, topicId)).toEqual([])

		// the vector is deliberately identical to exercise the DB identity guard
		const first = await insertBrew(topicId, 2)
		const second = await insertBrew(topicId, 3)
		for (const [brew, identifyingDetail] of [
			[first, "Taipei 101 marketing"],
			[second, "Benedictine University"],
		] as const) {
			await saveTopicMemoryUpdates({
				topicId,
				scanId: brew.scanId,
				writes: [
					{
						operation: "add",
						kind: "fact",
						text: "Wilson Chen began a marketing role.",
						factDate: "2026-09-25",
						person: { name: "Wilson Chen", identifyingDetail },
						findingIds: [brew.findingId],
						importance: 0.8,
						embedding: vector(1),
					},
				],
				signal,
			})
		}
		const rows = await loadMemories(topicId)
		expect(rows).toHaveLength(2)

		// keep the positive guidance and the correction private while loading prompt background
		for (const memory of rows) {
			const isTaipei =
				memory.person &&
				"identifyingDetail" in memory.person &&
				memory.person.identifyingDetail === "Taipei 101 marketing"
			expect(
				await saveTopicMemoryFeedback({
					topicId,
					userId: ownerId,
					topicMemoryId: memory.id,
					feedback: isTaipei
						? { rating: "up", note: "Keep the local coverage." }
						: { rating: "down", note: "The university describes a different role." },
				}),
			).toBe("saved")
		}
		const prompt = toTopicMemoryPromptText(await loadRankedTopicMemories({ topicId }))
		expect(prompt).toContain("Thumbs up note: Keep the local coverage.")
		expect(prompt).toContain("Thumbs down note: The university describes a different role.")
		expect(await loadRankedTopicMemories({ topicId, isPublicOnly: true })).toEqual([])
		const neighbors = await loadTopicMemoryNeighbors(topicId, vector(1))
		expect(neighbors.flatMap(({ feedback }) => feedback)).toEqual(
			expect.arrayContaining([
				{ rating: "up", note: "Keep the local coverage." },
				{ rating: "down", note: "The university describes a different role." },
			]),
		)
	})
})

test("both takeaway thumbs save the optional note and reopen it for the rater", async () => {
	await withTopic(async ({ topicId, ownerId }) => {
		const brew = await insertBrew(topicId, 1)
		await writeTakeaway(brew, "Check the brew temperature.", vector(1))
		const [memory] = await loadMemories(topicId)
		if (!memory) {
			throw new Error("Missing takeaway fixture")
		}
		for (const rating of ["up", "down"] as const) {
			const note = `Example ${rating} feedback`
			expect(
				await saveTopicMemoryFeedback({
					topicId,
					topicMemoryId: memory.id,
					userId: ownerId,
					feedback: { rating, note },
				}),
			).toBe("saved")
			const page = await loadTopicMemoriesPage({ topicId, userId: ownerId, page: 1 })
			expect(page.items[0]).toMatchObject({ rating, note, text: memory.text })
			const visitorPage = await loadTopicMemoriesPage({ topicId, userId: null, page: 1 })
			expect(visitorPage.items[0]).toMatchObject({ rating: null, note: null, text: memory.text })
		}
	})
})

test("a failed cleanup review retries without replaying the staged brew", async () => {
	await withTopic(async ({ topicId, ownerId }) => {
		const first = await insertBrew(topicId, 1)
		for (const index of [2, 3, 4]) {
			await insertBrew(topicId, index)
		}
		const fifth = await insertBrew(topicId, 5)
		await writeTakeaway(first, "The old brew took place in October.", vector(1))
		const writes: EmbeddedTopicMemoryWrite[] = [
			{
				operation: "add",
				kind: "fact",
				factDate: null,
				person: null,
				text: "A separate brew took place in November.",
				findingIds: [fifth.findingId],
				importance: 0.5,
				embedding: vector(0.91),
			},
		]
		const input = { scanId: fifth.scanId, topicId, writes, signal }
		await expect(
			saveTopicMemoryUpdates({
				...input,
				confirmCleanup: async () => {
					throw new Error("test provider outage")
				},
			}),
		).rejects.toThrow("test provider outage")
		const [staged] = await db
			.select({ written: scans.topicMemoriesWrittenAt, complete: scans.topicMemoriesUpdatedAt })
			.from(scans)
			.where(eq(scans.id, fifth.scanId))
		expect(staged).toEqual({ written: expect.any(Date), complete: null })
		await saveTopicMemoryUpdates({
			...input,
			confirmCleanup: async (pairs) => pairs.map(({ id, revision }) => ({ id, revision, verdict: "distinct" })),
		})
		expect(await readDecisionCosines(fifth.scanId)).toMatchObject([{ kind: "flag" }])
		const page = await loadTopicMemoriesPage({ topicId, userId: ownerId, page: 1 })
		expect(page.items).toHaveLength(2)
		expect((await loadMemories(topicId)).every(({ needsReview }) => !needsReview)).toBe(true)
	})
})

test("MCP page and count share the private membership gate in real Postgres", async () => {
	await withTopic(async ({ topicId, ownerId }) => {
		const runPage = (userId: string | null, page = 1): ReturnType<typeof loadMemberTopicMemoriesPage> =>
			loadMemberTopicMemoriesPage({ topicId, userId, page })
		expect((await runPage(ownerId))?.page).toEqual({ items: [], pageCount: 0 })
		const brew = await insertBrew(topicId, 1)
		await writeTakeaway(brew, "One private takeaway.", vector(1))
		expect(await runPage(null)).toBeNull()
		expect((await runPage(ownerId))?.page.items).toMatchObject([{ text: "One private takeaway." }])
		expect((await runPage(ownerId, 2))?.page).toEqual({ items: [], pageCount: 1 })

		// an admin without active membership sees no row or count, even after previously reading it
		const memberId = await insertUser("admin")
		const teamId = crypto.randomUUID()
		try {
			await db.insert(teams).values({ id: teamId, name: `Journal ${teamId}` })
			await db.update(topics).set({ teamId }).where(eq(topics.id, topicId))
			await db.insert(teamMembers).values({ teamId, userId: memberId })
			expect((await runPage(memberId))?.page).toMatchObject({
				pageCount: 1,
				items: [{ text: "One private takeaway." }],
			})
			await db.update(teamMembers).set({ isActive: false }).where(eq(teamMembers.userId, memberId))
			expect(await runPage(memberId)).toBeNull()
		} finally {
			await db.delete(teams).where(eq(teams.id, teamId))
			await db.delete(users).where(eq(users.id, memberId))
		}
	})
})

type Brew = { topicId: string; ownerId: string; scanId: string; findingId: string }

// fixed model proposal and vector, with real eligibility, dedup and retention downstream
async function writeTakeaway(
	{ topicId, scanId, findingId }: Brew,
	text: string,
	embedding: number[],
	mergeId?: string,
): Promise<void> {
	const evidence = {
		text,
		importance: 0.8,
		findingIds: [findingId],
		embedding,
		kind: "fact" as const,
		factDate: null,
		person: null,
	}
	const write: EmbeddedTopicMemoryWrite = mergeId
		? { ...evidence, operation: "merge", id: mergeId }
		: { ...evidence, operation: "add" }
	await saveTopicMemoryUpdates({ scanId, topicId, writes: [write], signal })
}

async function withTopic(check: (topic: { topicId: string; ownerId: string }) => Promise<void>): Promise<void> {
	const ownerId = await insertUser()
	const topicId = crypto.randomUUID()
	try {
		await db
			.insert(topics)
			.values({ id: topicId, ownerId, name: "Journal integration fixture", prompt: "Coffee", visibility: "private" })
		await check({ topicId, ownerId })
	} finally {
		await db.delete(topics).where(eq(topics.id, topicId))
		await db.delete(users).where(eq(users.id, ownerId))
		const url = `https://example.test/journal-integration/${topicId}/%`
		const firstPartyUrl = `https://carlnotes.com/%?journal-integration=${topicId}`
		await db.delete(resources).where(sql`${resources.url} like ${url} or ${resources.url} like ${firstPartyUrl}`)
	}
}

async function insertUser(role: "admin" | "user" = "user"): Promise<string> {
	const id = crypto.randomUUID()
	const username = `jt${id.replaceAll("-", "").slice(0, 12)}`
	await db
		.insert(users)
		.values({ id, name: "Journal fixture", username, usernameNormalized: username, email: `${id}@example.test`, role })
	return id
}

async function insertBrew(topicId: string, index: number, url?: string): Promise<Brew> {
	const [topic] = await db.select({ ownerId: topics.ownerId }).from(topics).where(eq(topics.id, topicId))
	if (!topic) {
		throw new Error("The brew fixture has no Topic")
	}

	// each brew references a different real public Finding
	const scanId = crypto.randomUUID()
	const resourceId = crypto.randomUUID()
	const findingId = crypto.randomUUID()
	const { ownerId } = topic
	await db
		.insert(scans)
		.values({ id: scanId, topicId, ownerId, status: "succeeded", startedAt: new Date(Date.UTC(2026, 10, index)) })
	await db.insert(resources).values({
		id: resourceId,
		kind: "read",
		url: url ?? `https://example.test/journal-integration/${topicId}/${scanId}`,
	})
	await db.insert(findings).values({ id: findingId, topicId, scanId, resourceId, relevanceScore: 0.9 })
	return { topicId, ownerId, scanId, findingId }
}

function vector(cosine: number): number[] {
	return [cosine, Math.sqrt(1 - cosine ** 2), ...Array<number>(EMBED_DIMENSIONS - 2).fill(0)]
}

async function loadMemories(topicId: string): Promise<(typeof topicMemories.$inferSelect)[]> {
	return db.select().from(topicMemories).where(eq(topicMemories.topicId, topicId))
}

async function readDecisionCosines(scanId: string): Promise<(typeof topicMemoryDecisions.$inferSelect)[]> {
	return db.select().from(topicMemoryDecisions).where(eq(topicMemoryDecisions.scanId, scanId))
}
