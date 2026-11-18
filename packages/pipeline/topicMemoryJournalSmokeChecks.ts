import { expect, test } from "bun:test"
import { TOPIC_MEMORY_ACTIVE_LIMIT, TOPIC_MEMORY_PAGE_SIZE } from "@carlnotes/contracts/topicMemories"
import { TOPIC_MEMORY_PROMPT_LIMIT } from "@carlnotes/contracts/topicMemoryWork"
import { db } from "@carlnotes/db"
import { teamMembers, teams } from "@carlnotes/db/schema/teams"
import { TOPIC_MEMORY_EMBEDDING_MODEL, topicMemories, topicMemoryFeedback } from "@carlnotes/db/schema/topicMemories"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import {
	loadMemberTopicMemoriesPage,
	loadRankedTopicMemories,
	loadTopicMemoriesPage,
} from "@carlnotes/db/topicMemories"
import { saveTopicMemoryFeedback } from "@carlnotes/db/topicMemoryFeedback"
import { eq } from "drizzle-orm"
import { loadTopicMemoryFindings, loadTopicMemoryNeighbors } from "./topicMemoryEvidence"
import { loadTopicMemoryPrompt, toTopicMemoryPromptText } from "./topicMemoryPrompt"
import {
	insertBrew,
	insertUser,
	loadMemories,
	signal,
	vector,
	withTopic,
	writeTopicMemory,
} from "./topicMemorySmokeFixtures"
import { saveTopicMemoryUpdates } from "./topicMemoryWrites"

// Register these cases inside the disposable database suite.
export function checkTopicMemoryJournal(): void {
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
				await saveTopicMemoryFeedback({
					topicId,
					userId: ownerId,
					topicMemoryId: saved.id,
					feedback: { rating: "up" },
				}),
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

	test("the Journal keeps all 31 ratings and notes while the prompt selects its ranked subset", async () => {
		await withTopic(async ({ topicId, ownerId }) => {
			// Give each recipe its own group so the prompt budget decides which claims Carl reads.
			const brew = await insertBrew(topicId, 1)
			const memories = await db
				.insert(topicMemories)
				.values(
					Array.from({ length: 31 }, (_, index) => ({
						topicId,
						kind: "fact" as const,
						isAtomic: true,
						subject: `recipe ${index}`,
						claimType: "other" as const,
						value: "filtered water",
						text: `Recipe ${index} uses filtered water.`,
						importance: 0.8,
						findingIds: [brew.findingId],
						firstScanId: brew.scanId,
						lastSeenScanId: brew.scanId,
						embedding: vector(1),
						embeddingModel: TOPIC_MEMORY_EMBEDDING_MODEL,
					})),
				)
				.returning({ id: topicMemories.id, text: topicMemories.text })

			// The owner endorses every claim through the normal write and attaches a distinct note.
			for (const memory of memories) {
				expect(
					await saveTopicMemoryFeedback({
						topicId,
						userId: ownerId,
						topicMemoryId: memory.id,
						feedback: { rating: "up", note: memory.text },
					}),
				).toBe("saved")
			}

			// Reload every Journal page, including ratings for claims omitted from the ranked prompt.
			const prompt = await loadRankedTopicMemories({ topicId })
			expect(prompt).toHaveLength(TOPIC_MEMORY_PROMPT_LIMIT)
			const promptClaims = new Set(prompt.map(({ text }) => text))
			const journal = []
			for (let page = 1; page <= Math.ceil(memories.length / TOPIC_MEMORY_PAGE_SIZE); page++) {
				const result = await loadTopicMemoriesPage({ topicId, userId: ownerId, page })
				journal.push(...result.items)
			}
			expect(journal).toHaveLength(memories.length)
			expect(new Set(journal.map(({ id }) => id))).toEqual(new Set(memories.map(({ id }) => id)))
			expect(journal.every((item) => item.rating === "up" && item.note === item.text)).toBe(true)
			expect(journal.filter((item) => !promptClaims.has(item.text))).toHaveLength(31 - TOPIC_MEMORY_PROMPT_LIMIT)
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
				await saveTopicMemoryFeedback({
					topicId,
					userId: ownerId,
					topicMemoryId: last.id,
					feedback: { rating: "down" },
				}),
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

	test("the Journal shows newly added facts before older groups with newer wording or feedback", async () => {
		await withTopic(async ({ topicId, ownerId }) => {
			// backfilled evidence can be older than the first evidence for a previously saved fact
			const olderEvidence = await insertBrew(topicId, 1)
			const firstObservation = await insertBrew(topicId, 2)
			const repeat = await insertBrew(topicId, 3)
			const newFact = "The cafe sells tea."
			const newWording = "The cafe opened for customers."
			const facts = [
				[firstObservation, "The cafe opened.", "opened", "2026-11-01"],
				[olderEvidence, newFact, "sells tea", "2026-11-02"],
				[repeat, newWording, "opened", "2026-11-03"],
			] as const
			const [firstRow] = await db
				.insert(topicMemories)
				.values(
					facts.map(([brew, text, value, addedAt]) => ({
						topicId,
						text,
						value,
						kind: "fact" as const,
						subject: "Cafe",
						claimType: "other" as const,
						isAtomic: true,
						importance: 0.8,
						findingIds: [brew.findingId],
						firstScanId: brew.scanId,
						lastSeenScanId: brew.scanId,
						embedding: vector(1),
						embeddingModel: TOPIC_MEMORY_EMBEDDING_MODEL,
						createdAt: new Date(addedAt),
					})),
				)
				.returning({ id: topicMemories.id })
			if (!firstRow) {
				throw new Error("Missing first Journal row")
			}
			await saveTopicMemoryFeedback({
				topicId,
				userId: ownerId,
				topicMemoryId: firstRow.id,
				feedback: { rating: "up", note: "Keep the opening date." },
			})

			// both Journal readers use the first saved date for the group and display the latest evidence
			const options = { topicId, userId: ownerId, page: 1 }
			const journal = await loadTopicMemoriesPage(options)
			expect(journal.items.map(({ text }) => text)).toEqual([newFact, newWording])
			expect((await loadMemberTopicMemoriesPage(options))?.page).toEqual(journal)
			expect((await loadRankedTopicMemories({ topicId }))[0]?.text).toBe(newWording)
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
}
