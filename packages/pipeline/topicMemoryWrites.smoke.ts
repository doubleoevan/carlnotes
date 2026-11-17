// exercises the production Journal transaction with migrated Postgres and pgvector
import { afterAll, beforeAll, expect, mock, spyOn, test } from "bun:test"
import { TOPIC_MEMORY_ACTIVE_LIMIT, TOPIC_MEMORY_PAGE_SIZE } from "@carlnotes/contracts/topicMemories"
import { db } from "@carlnotes/db"
import { EMBED_DIMENSIONS, findings, resources, scans } from "@carlnotes/db/schema/scans"
import { teamMembers, teams } from "@carlnotes/db/schema/teams"
import {
	TOPIC_MEMORY_EMBEDDING_MODEL,
	topicMemories,
	topicMemoryDecisions,
	topicMemoryFeedback,
} from "@carlnotes/db/schema/topicMemories"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import {
	loadMemberTopicMemoriesPage,
	loadRankedTopicMemories,
	loadTopicMemoriesPage,
	saveTopicMemoryFeedback,
} from "@carlnotes/db/topicMemories"
import * as models from "@carlnotes/models/models"
import type { LanguageModel } from "ai"
import * as ai from "ai"
import { eq, sql } from "drizzle-orm"
import type { EmbeddedTopicMemoryWrite } from "./applyTopicMemoryWrite"
import { repairTopicMemoryClaims } from "./repairTopicMemoryClaims"
import {
	loadTopicMemoryFindingEvidence,
	loadTopicMemoryFindings,
	loadTopicMemoryNeighbors,
} from "./topicMemoryEvidence"
import { loadTopicMemoryPrompt, toTopicMemoryPromptText } from "./topicMemoryPrompt"
import { reviewTopicMemoryReplacements } from "./topicMemoryReplacements"
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

test("exact facts combine and reactivate while different values remain active", async () => {
	await withTopic(async ({ topicId, ownerId }) => {
		const first = await insertBrew(topicId, 1)
		const second = await insertBrew(topicId, 2)
		const older = await insertBrew(topicId, 3)
		const newer = await insertBrew(topicId, 4)
		const latest = await insertBrew(topicId, 5)
		const key = { subject: "Cafe", claimType: "price", factDate: "2026-10-01", value: "$10" } as const

		// equal keys combine even though the vectors are orthogonal
		await writeTopicMemory(first, "The coffee costs ten dollars.", vector(1), key)
		const [previous] = await loadMemories(topicId)
		if (!previous) {
			throw new Error("The original topic memory is missing")
		}
		await db.update(topicMemories).set({ status: "outdated" }).where(eq(topicMemories.id, previous.id))
		await writeTopicMemory(second, "A coffee costs $10.", vector(0), key)
		const combined = await loadMemories(topicId)
		expect(combined).toHaveLength(2)
		expect(combined).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: previous.id, status: "active", findingIds: [first.findingId, second.findingId] }),
				expect.objectContaining({
					status: "outdated",
					replacedById: previous.id,
					text: "A coffee costs $10.",
					findingIds: [second.findingId],
				}),
			]),
		)
		expect(await readDecisionCosines(second.scanId)).toMatchObject([
			{ kind: "merge", source: "exact", cosine: 0, candidateText: "A coffee costs $10." },
		])
		// replaying the same wording and evidence under a new format does not create a second pair
		await db.update(scans).set({ topicMemoriesFormatVersion: 0 }).where(eq(scans.id, second.scanId))
		await writeTopicMemory(second, "A coffee costs $10.", vector(0), key)
		expect(await readDecisionCosines(second.scanId)).toHaveLength(1)

		await saveTopicMemoryFeedback({
			topicId,
			userId: ownerId,
			topicMemoryId: previous.id,
			feedback: { rating: "up", note: "Verified." },
		})

		// different values stay active even when an older brew supplies them later
		await writeTopicMemory(newer, "A coffee costs $12.", vector(1), { ...key, value: "$12" })
		await writeTopicMemory(older, "A coffee costs $11.", vector(1), { ...key, value: "$11" })
		const rows = await loadMemories(topicId)
		const current = rows.find(({ value }) => value === "$12")
		expect(current?.status).toBe("active")
		expect(rows.filter(({ status }) => status === "active")).toHaveLength(3)
		expect(rows.filter(({ replacedById }) => replacedById !== null)).toHaveLength(1)
		expect(await readDecisionCosines(newer.scanId)).toEqual([])
		expect(await readDecisionCosines(older.scanId)).toEqual([])
		expect(await db.select().from(topicMemoryFeedback)).toEqual(
			expect.arrayContaining([expect.objectContaining({ topicMemoryId: previous.id, note: "Verified." })]),
		)

		// rejected wording stays blocked, independent of the replacement key or vector
		if (!current) {
			throw new Error("The replacement topic memory is missing")
		}
		await saveTopicMemoryFeedback({ topicId, userId: ownerId, topicMemoryId: current.id, feedback: { rating: "down" } })
		await writeTopicMemory(latest, "A COFFEE costs $12.", vector(0), key)
		expect(await loadMemories(topicId)).toHaveLength(4)
	})
})

test("The Marsh founding and its Monday series stay active on the same founding key", async () => {
	await withTopic(async ({ topicId }) => {
		const first = await insertBrew(topicId, 1)
		const second = await insertBrew(topicId, 2)
		const key = { subject: "The Marsh", claimType: "founding", factDate: "1989-01-01" } as const
		await writeTopicMemory(first, "The Marsh performance space was founded in San Francisco in 1989.", vector(1), {
			...key,
			value: "founded in san francisco",
		})
		await writeTopicMemory(
			second,
			"Stephanie Weisman started The Marsh's Monday night series at the Hotel Utah.",
			vector(1),
			{
				...key,
				value: "monday series at the hotel utah",
			},
		)
		expect((await loadMemories(topicId)).map(({ status }) => status)).toEqual(["active", "active"])
		expect(await readDecisionCosines(second.scanId)).toEqual([])
	})
})

test.each(["confirmed", "declined", "stale", "tied"] as const)(
	"a %s model review controls an edition-specific runtime replacement",
	async (review) => {
		await withTopic(async ({ topicId }) => {
			const first = await insertBrew(topicId, 1)
			const second = await insertBrew(topicId, 2)
			const key = { subject: "Festival cut", claimType: "runtime", factDate: "2026-10-01" } as const
			const earlier = "The original festival cut ran 92 minutes."
			const newer = "The corrected runtime of the original festival cut was 92 minutes and 15 seconds."
			await writeTopicMemory(first, earlier, vector(1), { ...key, value: "92 minutes" })
			if (review === "tied") {
				await db
					.update(scans)
					.set({ startedAt: sql`(select started_at from ${scans} where ${scans.id} = ${first.scanId})` })
					.where(eq(scans.id, second.scanId))
			}
			const [scan] = await db.select({ startedAt: scans.startedAt }).from(scans).where(eq(scans.id, second.scanId))
			if (!scan) {
				throw new Error("The second brew is missing")
			}
			const write: EmbeddedTopicMemoryWrite = {
				...key,
				operation: "add",
				kind: "fact",
				text: newer,
				value: "92 minutes and 15 seconds",
				person: null,
				importance: 0.8,
				embedding: vector(1),
				findingIds: [second.findingId],
			}

			// stub only the paid model. nomination, locking, and both writes use real Postgres
			spyOn(models, "cheapModel").mockReturnValue({} as LanguageModel)
			const generate = spyOn(ai, "generateText").mockResolvedValue({
				output: { confirmedIndexes: review === "declined" ? [] : [0] },
				usage: {},
			} as Awaited<ReturnType<typeof ai.generateText>>)
			try {
				const replacements = await reviewTopicMemoryReplacements({
					topicId,
					scanId: second.scanId,
					scanStartedAt: scan.startedAt,
					writes: [write],
					signal,
					litellmApiKey: "fixture",
				})
				if (review === "tied") {
					expect(generate).not.toHaveBeenCalled()
				} else {
					const prompt = generate.mock.calls[0]?.[0].prompt
					expect(prompt).toContain(earlier)
					expect(prompt).toContain(newer)
					expect(String(prompt).match(/"factDate":"2026-10-01"/g)).toHaveLength(2)
				}
				if (review === "stale") {
					await db
						.update(topicMemories)
						.set({ text: "The original festival cut's runtime was reported as 92 minutes." })
						.where(eq(topicMemories.topicId, topicId))
				}
				await saveTopicMemoryUpdates({ topicId, scanId: second.scanId, writes: [write], signal, replacements })
				const rows = await loadMemories(topicId)
				expect(rows.filter(({ status }) => status === "active")).toHaveLength(review === "confirmed" ? 1 : 2)
				const decisions = await readDecisionCosines(second.scanId)
				expect(decisions).toHaveLength(review === "confirmed" ? 1 : 0)
				expect(decisions).toMatchObject(
					review === "confirmed"
						? [{ kind: "replace", source: "model", candidateText: newer, matchText: earlier }]
						: [],
				)
			} finally {
				mock.restore()
			}
		})
	},
)

test("Journal write evicts the weakest row while retaining saved topic memories and corrections", async () => {
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
					text: `Seed topic memory ${index}`,
					importance: index < 4 ? index * 0.01 : 0.9,
					findingIds: [first.findingId],
					firstScanId: first.scanId,
					lastSeenScanId: first.scanId,
					embedding: vector(1),
					embeddingModel: TOPIC_MEMORY_EMBEDDING_MODEL,
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
		await writeTopicMemory(second, "Try a different roast.", vector(0))
		const rows = await loadMemories(topicId)
		expect(rows.filter(({ status }) => status === "active")).toHaveLength(TOPIC_MEMORY_ACTIVE_LIMIT)
		expect(rows.filter(({ status }) => status === "outdated")).toMatchObject([{ id: loser.id, replacedById: null }])
	})
})

test("a stale Journal page falls back to the last page after a protected row is rejected", async () => {
	await withTopic(async ({ topicId, ownerId }) => {
		// corrections alone can exceed the eviction target and create another page
		const first = await insertBrew(topicId, 1)
		const second = await insertBrew(topicId, 2)
		const protectedRows = await db
			.insert(topicMemories)
			.values(
				Array.from({ length: TOPIC_MEMORY_ACTIVE_LIMIT + 1 }, (_, index) => ({
					topicId,
					kind: "fact" as const,
					isAtomic: true,
					text: `Coffee recipe ${index} uses filtered water.`,
					importance: 0.8,
					findingIds: [first.findingId],
					firstScanId: first.scanId,
					lastSeenScanId: first.scanId,
					embedding: vector(1),
					embeddingModel: TOPIC_MEMORY_EMBEDDING_MODEL,
				})),
			)
			.returning({ id: topicMemories.id })
		const corrections = protectedRows.map(({ id }) => ({
			topicMemoryId: id,
			userId: ownerId,
			rating: "down" as const,
			note: "Use soft water.",
		}))
		await db.insert(topicMemoryFeedback).values(corrections)
		await writeTopicMemory(second, "The kettle is green.", vector(1))

		// both read paths keep the protected overflow page accessible
		const lastPage = Math.ceil((TOPIC_MEMORY_ACTIVE_LIMIT + 1) / TOPIC_MEMORY_PAGE_SIZE)
		const page = await loadTopicMemoriesPage({ topicId, userId: ownerId, page: lastPage })
		expect(page.pageCount).toBe(lastPage)
		expect(page.items).toHaveLength(1)
		expect((await loadMemberTopicMemoriesPage({ topicId, userId: ownerId, page: lastPage + 1 }))?.page).toEqual(page)
		const last = page.items[0]
		if (!last) {
			throw new Error("Expected a protected topic memory on the overflow page")
		}

		// rejecting that row moves a stale request back one page without returning an empty list
		expect(
			await saveTopicMemoryFeedback({ topicId, userId: ownerId, topicMemoryId: last.id, feedback: { rating: "down" } }),
		).toBe("saved")
		const clamped = await loadTopicMemoriesPage({ topicId, userId: ownerId, page: lastPage })
		expect(clamped.pageCount).toBe(lastPage - 1)
		expect(clamped.items).toHaveLength(TOPIC_MEMORY_PAGE_SIZE)
		expect(clamped).toEqual(await loadTopicMemoriesPage({ topicId, userId: ownerId, page: lastPage - 1 }))
		expect((await loadMemberTopicMemoriesPage({ topicId, userId: ownerId, page: lastPage }))?.page).toEqual(clamped)
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
						subject: "Wilson Chen",
						claimType: "role",
						value: "marketing",
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

test("both topic memory thumbs save the optional note and reopen it for the rater", async () => {
	await withTopic(async ({ topicId, ownerId }) => {
		const brew = await insertBrew(topicId, 1)
		await writeTopicMemory(brew, "Check the brew temperature.", vector(1))
		const [memory] = await loadMemories(topicId)
		if (!memory) {
			throw new Error("Missing topic memory fixture")
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

test("equal undated claims preserve the combined row in history", async () => {
	await withTopic(async ({ topicId, ownerId }) => {
		const first = await insertBrew(topicId, 1)
		const second = await insertBrew(topicId, 2)
		// compare exact structured keys even when both event dates are unknown
		const key = { subject: "Cafe", claimType: "launch", factDate: null, value: "opened" } as const
		await writeTopicMemory(first, "The cafe opened.", vector(1), key)
		await writeTopicMemory(second, "The cafe opened for customers.", vector(0.95), key)
		expect(await loadMemories(topicId)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ text: "The cafe opened.", status: "active" }),
				expect.objectContaining({
					text: "The cafe opened for customers.",
					status: "outdated",
					replacedById: expect.any(String),
				}),
			]),
		)
		expect(await readDecisionCosines(second.scanId)).toMatchObject([{ kind: "merge", source: "exact" }])

		// all readers share the active representative
		const journal = await loadTopicMemoriesPage({ topicId, userId: ownerId, page: 1 })
		expect(journal.items).toHaveLength(1)
		expect(journal.items[0]?.text).toBe("The cafe opened.")
		expect((await loadMemberTopicMemoriesPage({ topicId, userId: ownerId, page: 1 }))?.page).toEqual(journal)
		expect(await loadRankedTopicMemories({ topicId })).toMatchObject([{ text: "The cafe opened." }])
	})
})

test("both prompt loaders keep Skywork AI editing and Spotify publishing as separate groups", async () => {
	await withTopic(async ({ topicId, ownerId }) => {
		// two distinct values share a subject and type. repeated editing evidence shares one group
		const first = await insertBrew(topicId, 1)
		const second = await insertBrew(topicId, 2)
		const third = await insertBrew(topicId, 3)
		const fourth = await insertBrew(topicId, 4)
		const generator = { subject: "Skywork AI podcast generator", claimType: "other", factDate: "2025-10-23" } as const
		const editing = "Skywork AI's podcast generator automates editing."
		const editingParaphrase = "Skywork AI's podcast generator handles editing automatically."
		const publishing = "Skywork AI's podcast generator supports direct publishing to Spotify."
		await writeTopicMemory(first, editing, vector(1), { ...generator, value: "automated editing" })
		await writeTopicMemory(second, publishing, vector(1), { ...generator, value: "direct spotify publishing" })
		await writeTopicMemory(third, editingParaphrase, vector(1), { ...generator, value: "automated editing" })
		await writeTopicMemory(fourth, "The reader bookmarked this podcast generator.", vector(1), {
			...generator,
			value: "bookmark",
		})
		const [historical] = await db
			.select({ id: topicMemories.id })
			.from(topicMemories)
			.where(eq(topicMemories.lastSeenScanId, fourth.scanId))
		if (!historical) {
			throw new Error("The archived fixture is missing")
		}
		await db
			.insert(topicMemoryFeedback)
			.values({ topicMemoryId: historical.id, userId: ownerId, rating: "up", note: "old review" })
		await db
			.update(topicMemories)
			.set({ status: "outdated", isAtomic: false })
			.where(eq(topicMemories.id, historical.id))

		// keep both features and one version of the editing claim in both prompt loaders
		expect((await loadTopicMemoriesPage({ topicId, userId: ownerId, page: 1 })).items).toHaveLength(2)
		const prompt = await loadTopicMemoryPrompt({ topicId })
		expect([editing, editingParaphrase].filter((text) => prompt.includes(text))).toHaveLength(1)
		expect(prompt).toContain(publishing)
		const neighbors = await loadTopicMemoryNeighbors(topicId, vector(1))
		expect(neighbors).toHaveLength(2)
		expect(neighbors.map(({ text }) => text)).toContain(publishing)
		expect(neighbors.some(({ id }) => id === historical.id)).toBe(false)
	})
})

test("compatible dates combine without letting an undated observation bridge conflicts", async () => {
	await withTopic(async ({ topicId, ownerId }) => {
		// a narrower date upgrades the representative while a different month stays independent
		const dates = ["2025", "2025-07", "2025-07", "2025-08", null]
		for (const [index, factDate] of dates.entries()) {
			const brew = await insertBrew(topicId, index + 1)
			await writeTopicMemory(brew, "The cafe opened for customers.", vector(1), {
				subject: "Cafe",
				claimType: "launch",
				value: "opened",
				factDate,
			})
			expect(await readDecisionCosines(brew.scanId)).toHaveLength(index === 1 || index === 2 ? 1 : 0)
		}
		const rows = await loadMemories(topicId)
		expect(rows.filter(({ status }) => status === "active").map(({ factDate }) => factDate)).toEqual(
			expect.arrayContaining(["2025-07", "2025-08", null]),
		)
		expect(rows.filter(({ replacedById }) => replacedById !== null)).toHaveLength(2)
		const page = await loadTopicMemoriesPage({ topicId, userId: ownerId, page: 1 })
		expect(page.items).toHaveLength(2)
		expect(page.items.map(({ factDate }) => factDate)).toContain("2025-08")
	})
})

test("rewrite evidence keeps the matching caption when the draft paraphrases it", async () => {
	await withTopic(async ({ topicId }) => {
		const { findingId } = await insertBrew(topicId, 1)
		const caption = "Mara Diaz and Hana Li attended the gallery opening on March 4, 2026."
		await db
			.update(resources)
			.set({ content: null, snippet: `${"Unrelated caption. ".repeat(110)}${caption}` })
			.where(
				eq(resources.id, sql`(select ${findings.resourceId} from ${findings} where ${findings.id} = ${findingId})`),
			)
		const evidence = await loadTopicMemoryFindingEvidence(topicId, [findingId], db, "Attends alongside Hana Li.")
		expect(evidence.get(findingId)?.articleContext).toContain(caption)
		expect(evidence.get(findingId)?.articleContext?.length).toBeLessThanOrEqual(1400)
	})
})

test("MCP page and count share the private membership gate in real Postgres", async () => {
	await withTopic(async ({ topicId, ownerId }) => {
		const runPage = (userId: string | null, page = 1): ReturnType<typeof loadMemberTopicMemoriesPage> =>
			loadMemberTopicMemoriesPage({ topicId, userId, page })
		expect((await runPage(ownerId))?.page).toEqual({ items: [], pageCount: 0 })
		const brew = await insertBrew(topicId, 1)
		await writeTopicMemory(brew, "One private topic memory.", vector(1))
		expect(await runPage(null)).toBeNull()
		const firstPage = (await runPage(ownerId))?.page
		expect(firstPage?.items).toMatchObject([{ text: "One private topic memory." }])
		expect((await runPage(ownerId, 2))?.page).toEqual(firstPage)

		// an admin without active membership sees no row or count, even after previously reading it
		const memberId = await insertUser("admin")
		const teamId = crypto.randomUUID()
		try {
			await db.insert(teams).values({ id: teamId, name: `Journal ${teamId}` })
			await db.update(topics).set({ teamId }).where(eq(topics.id, topicId))
			await db.insert(teamMembers).values({ teamId, userId: memberId })
			expect((await runPage(memberId))?.page).toMatchObject({
				pageCount: 1,
				items: [{ text: "One private topic memory." }],
			})
			await db.update(teamMembers).set({ isActive: false }).where(eq(teamMembers.userId, memberId))
			expect(await runPage(memberId)).toBeNull()
		} finally {
			await db.delete(teams).where(eq(teams.id, teamId))
			await db.delete(users).where(eq(users.id, memberId))
		}
	})
})

test.each(["split", "blocked child", "same survivor"] as const)(
	"repair handles %s without losing feedback",
	async (result) => {
		await withTopic(async ({ topicId, ownerId }) => {
			const opening = await insertBrew(topicId, 1)
			const award = await insertBrew(topicId, 2)
			const raterId = await insertUser()
			try {
				const openingKey = { subject: "Cafe", claimType: "launch", value: "opened", factDate: null } as const
				const openingText = "The cafe opened."
				const awardText = "The cafe won an award."
				await seedTopicMemorySplitTarget({ result, opening, award, openingKey, openingText, awardText, raterId })

				// create the original claim with its before-and-after Scans and its two ratings
				const [original] = await db
					.insert(topicMemories)
					.values({
						topicId,
						kind: "fact",
						text: "The cafe opened and won an award.",
						isAtomic: true,
						importance: 0.8,
						embedding: vector(1),
						embeddingModel: "before-claim-checks",
						firstScanId: opening.scanId,
						lastSeenScanId: award.scanId,
						findingIds: [opening.findingId, award.findingId],
					})
					.returning({ id: topicMemories.id })
				if (!original) {
					throw new Error("The original topic memory is missing")
				}
				const correction = "The award was a silver medal."
				await db.insert(topicMemoryFeedback).values([
					{ topicMemoryId: original.id, userId: ownerId, rating: "down", note: correction },
					{ topicMemoryId: original.id, userId: raterId, rating: "up", note: "Keep this." },
				])

				// provide only model outputs. source authorization, embeddings storage, and feedback writes use Postgres
				const orderedOwners = [ownerId, raterId].sort()
				const output = (value: unknown): Awaited<ReturnType<typeof ai.generateText>> =>
					({ output: value, usage: {} }) as Awaited<ReturnType<typeof ai.generateText>>
				spyOn(models, "cheapModel").mockReturnValue({} as LanguageModel)
				spyOn(models, "embedVectors").mockResolvedValue([vector(1), vector(0.1)])
				spyOn(ai, "generateText")
					.mockResolvedValueOnce(
						output({
							claims: [
								{
									text: openingText,
									...openingKey,
									person: null,
									sourceFindingIndexes: [0],
									feedbackIndexes: [],
								},
								{
									text: awardText,
									...openingKey,
									...(result === "same survivor" ? {} : { claimType: "other", value: "won an award" }),
									person: null,
									sourceFindingIndexes: [1],
									feedbackIndexes: [orderedOwners.indexOf(ownerId)],
								},
							],
						}),
					)
					.mockResolvedValueOnce(
						output({
							claims: [
								{ index: 0, verdict: "single" },
								{ index: 1, verdict: "single" },
							],
						}),
					)

				// a rejected child or a repeated survivor must roll back all writes for this split
				const repaired = result === "split"
				expect(
					await repairTopicMemoryClaims({ litellmApiKey: "fixture", signal, compoundIds: [original.id] }),
				).toMatchObject({
					split: Number(repaired),
					queued: Number(!repaired),
					deferred: 0,
				})
				const rows = await loadMemories(topicId)
				const active = rows.filter(({ status }) => status === "active")
				if (!repaired) {
					expect(rows).toHaveLength(result === "blocked child" ? 2 : 1)
					expect(active).toMatchObject([{ id: original.id, needsReview: true }])
					return
				}

				// each child keeps applicable votes and a previously entered correction stays on its claim
				expect(rows.find(({ id }) => id === original.id)?.status).toBe("outdated")
				expect(active.flatMap(({ findingIds }) => findingIds).sort()).toEqual(
					[opening.findingId, award.findingId].sort(),
				)
				for (const row of active) {
					const feedback = await db
						.select()
						.from(topicMemoryFeedback)
						.where(eq(topicMemoryFeedback.topicMemoryId, row.id))
					expect(feedback.map(({ note }) => note).sort()).toEqual(
						row.text === awardText ? ["Keep this.", correction].sort() : ["It opened in May."],
					)
				}
			} finally {
				mock.restore()
				await db.delete(users).where(eq(users.id, raterId))
			}
		})
	},
)

async function seedTopicMemorySplitTarget({
	result,
	opening,
	award,
	openingKey,
	openingText,
	awardText,
	raterId,
}: {
	result: "split" | "blocked child" | "same survivor"
	opening: Brew
	award: Brew
	openingKey: Pick<EmbeddedTopicMemoryWrite, "subject" | "claimType" | "value" | "factDate">
	openingText: string
	awardText: string
	raterId: string
}): Promise<void> {
	if (result === "blocked child") {
		await writeTopicMemory(award, awardText, vector(0.1))
		await db.update(topicMemories).set({ status: "rejected" }).where(eq(topicMemories.topicId, award.topicId))
		return
	}
	if (result !== "split") {
		return
	}

	// the existing correction is older than the original's conflicting vote
	await writeTopicMemory(opening, openingText, vector(1), openingKey)
	const [existing] = await loadMemories(opening.topicId)
	if (!existing) {
		throw new Error("The opening claim is missing")
	}
	await db.insert(topicMemoryFeedback).values({
		topicMemoryId: existing.id,
		userId: raterId,
		rating: "down",
		note: "It opened in May.",
		updatedAt: new Date(0),
	})
}

test.each(["provider failure", "rejected split", "nonclaim"] as const)(
	"repair preserves sources and feedback after %s",
	async (result) => {
		await withTopic(async ({ topicId, ownerId }) => {
			const brew = await insertBrew(topicId, 1)
			const text = "The cafe opened and won an award."
			await writeTopicMemory(brew, text, vector(1))
			const [original] = await loadMemories(topicId)
			if (!original) {
				throw new Error("The original topic memory is missing")
			}
			// a correction remains attached to the original when the repair cannot replace it
			await db
				.insert(topicMemoryFeedback)
				.values({ topicMemoryId: original.id, userId: ownerId, rating: "down", note: "The award was silver." })
			spyOn(models, "cheapModel").mockReturnValue({} as LanguageModel)
			const generate = spyOn(ai, "generateText")
			if (result === "provider failure") {
				generate.mockRejectedValue(new Error("Unavailable"))
			} else {
				generate.mockResolvedValue({ output: { claims: [] }, usage: {} } as Awaited<ReturnType<typeof ai.generateText>>)
			}
			try {
				const retired = result === "nonclaim"
				const counts = await repairTopicMemoryClaims({
					litellmApiKey: "fixture",
					signal,
					auditedVerdicts: { [original.id]: retired ? "nonclaim" : "compound" },
				})
				expect(counts).toMatchObject({ retired: Number(retired), queued: Number(!retired), deferred: 0 })
				expect(await loadMemories(topicId)).toMatchObject([
					{
						id: original.id,
						text,
						findingIds: [brew.findingId],
						status: retired ? "outdated" : "active",
						needsReview: !retired,
					},
				])
				expect(await loadRankedTopicMemories({ topicId })).toEqual([])
				expect(
					await db.select().from(topicMemoryFeedback).where(eq(topicMemoryFeedback.topicMemoryId, original.id)),
				).toMatchObject([{ rating: "down", note: "The award was silver." }])
			} finally {
				mock.restore()
			}
		})
	},
)

test("a Journal add preserves a distinct claim that shares an exact key", async () => {
	await withTopic(async ({ topicId }) => {
		const first = await insertBrew(topicId, 1)
		const second = await insertBrew(topicId, 2)
		const key = { subject: "Hillary Fazzari", claimType: "role", value: "literary agent", factDate: null } as const
		await writeTopicMemory(first, "Hillary Fazzari is a literary agent.", vector(1), key)

		// deliberately reuse the wrong structured key for a separate dated observation
		const write: EmbeddedTopicMemoryWrite = {
			...key,
			operation: "add",
			kind: "fact",
			person: null,
			factDate: "2024-05-01",
			text: "Hillary Fazzari reopened to queries on May 1, 2024.",
			importance: 0.85,
			embedding: vector(1),
			findingIds: [second.findingId],
			reconciliation: { operation: "add" },
		}
		await saveTopicMemoryUpdates({ topicId, scanId: second.scanId, writes: [write], signal })
		expect((await loadMemories(topicId)).map(({ status }) => status)).toEqual(["active", "active"])
	})
})

test("a surplus Journal candidate survives when the selected wording was rejected", async () => {
	await withTopic(async ({ topicId }) => {
		const original = await insertBrew(topicId, 1)
		const next = await insertBrew(topicId, 2)
		const rejectedText = "The Acorn Cafe opened."
		const keptText = "The Acorn Cafe opened to customers."
		const key = { subject: "Acorn Cafe", claimType: "launch", value: "opening", factDate: "2026-11" } as const
		await writeTopicMemory(original, rejectedText, vector(1), key)
		await db.update(topicMemories).set({ status: "rejected" }).where(eq(topicMemories.topicId, topicId))

		// give the writer the model's preferred wording and its checked paraphrase
		const preferred: EmbeddedTopicMemoryWrite = {
			...key,
			operation: "add",
			kind: "fact",
			person: null,
			text: rejectedText,
			importance: 0.85,
			embedding: vector(1),
			findingIds: [next.findingId],
			reconciliation: { operation: "add" },
		}
		const surplus: EmbeddedTopicMemoryWrite = {
			...preferred,
			text: keptText,
			reconciliation: { operation: "add", combineWithExactMatch: true },
		}
		await saveTopicMemoryUpdates({ topicId, scanId: next.scanId, writes: [preferred, surplus], signal })
		expect(await loadMemories(topicId)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ text: rejectedText, status: "rejected" }),
				expect.objectContaining({ text: keptText, status: "active", findingIds: [next.findingId] }),
			]),
		)
	})
})

test("a Journal update keeps the original ID, archives the prior wording, and rejects a foreign target", async () => {
	await withTopic(async ({ topicId }) => {
		const originalBrew = await insertBrew(topicId, 1)
		const updateBrew = await insertBrew(topicId, 2)
		const originalText = "The cafe opened."
		const fullerText = "The Acorn Cafe opened to the public."
		await writeTopicMemory(originalBrew, originalText, vector(1))
		const [original] = await db.select().from(topicMemories).where(eq(topicMemories.topicId, topicId))
		if (!original) {
			throw new Error("The original Journal row is missing")
		}

		// send a confirmed update that would have failed the old exact subject and value guard
		const write: EmbeddedTopicMemoryWrite = {
			operation: "add",
			subject: "Acorn Cafe",
			value: "public launch",
			claimType: "launch",
			kind: "fact",
			person: null,
			factDate: "2026-11",
			text: fullerText,
			importance: 0.85,
			embedding: vector(1),
			findingIds: [updateBrew.findingId],
			reconciliation: { operation: "update", target: original, useCandidateText: true },
		}
		await saveTopicMemoryUpdates({ topicId, scanId: updateBrew.scanId, writes: [write], signal })
		const rows = await loadMemories(topicId)
		expect(rows.find(({ id }) => id === original.id)).toMatchObject({
			text: fullerText,
			factDate: "2026-11",
			findingIds: [originalBrew.findingId, updateBrew.findingId],
			status: "active",
		})
		expect(rows.find(({ id }) => id !== original.id)).toMatchObject({
			text: originalText,
			status: "outdated",
			replacedById: original.id,
			findingIds: [originalBrew.findingId],
		})

		// a real ID from another Topic can never receive evidence or create a new row here
		await withTopic(async ({ topicId: foreignTopicId }) => {
			const foreign = await insertBrew(foreignTopicId, 3)
			await saveTopicMemoryUpdates({
				topicId: foreignTopicId,
				scanId: foreign.scanId,
				signal,
				writes: [{ ...write, findingIds: [foreign.findingId] }],
			})
			expect(await loadMemories(foreignTopicId)).toEqual([])
		})
	})
})

type Brew = { topicId: string; ownerId: string; scanId: string; findingId: string }

// fixed model proposal and vector, with real eligibility and persistence
async function writeTopicMemory(
	{ topicId, scanId, findingId }: Brew,
	text: string,
	embedding: number[],
	key: Pick<EmbeddedTopicMemoryWrite, "subject" | "claimType" | "value" | "factDate"> = {
		subject: "Coffee",
		claimType: "other",
		value: text,
		factDate: null,
	},
): Promise<void> {
	const write: EmbeddedTopicMemoryWrite = {
		...key,
		text,
		importance: 0.8,
		findingIds: [findingId],
		embedding,
		kind: "fact",
		person: null,
		operation: "add",
	}
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
