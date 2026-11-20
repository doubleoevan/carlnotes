// the disposable database checks of topic memory ratings: a rating's notes on the Journal and in Carl's prompt, the
// prompt's groups, and the rater's standing

import { expect, test } from "bun:test"
import { TOPIC_MEMORY_PAGE_SIZE } from "@carlnotes/contracts/topicMemories"
import { TOPIC_MEMORY_PROMPT_LIMIT } from "@carlnotes/contracts/topicMemoryWork"
import { db } from "@carlnotes/db"
import { loadRankedTopicMemories } from "@carlnotes/db/rankedTopicMemories"
import { teamMembers, teams } from "@carlnotes/db/schema/teams"
import { TOPIC_MEMORY_EMBEDDING_MODEL, topicMemories, topicMemoryFeedback } from "@carlnotes/db/schema/topicMemories"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { loadTopicMemoriesPage } from "@carlnotes/db/topicMemories"
import { saveTopicMemoryFeedback } from "@carlnotes/db/topicMemoryFeedback"
import { and, eq } from "drizzle-orm"
import { loadTopicMemoryFindings, loadTopicMemoryNeighbors } from "./topicMemoryEvidence"
import { loadTopicMemoryPrompt, toTopicMemoryPromptText } from "./topicMemoryPrompt"
import { loadTopicMemoryRatingNotes } from "./topicMemorySearch"
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
export function checkTopicMemoryRatings(): void {
	test("a rating stays with its fact as newer statements arrive, and a blank thumbs-down clears them all", async () => {
		await withTopic(async ({ topicId, ownerId }) => {
			// the owner saves a note on the first statement of a fact, and a later Scan adds a second statement
			const first = await insertBrew(topicId, 1)
			const later = await insertBrew(topicId, 2)
			const toRow = (scanFinding: typeof first, text: string, cosine: number): typeof topicMemories.$inferInsert => ({
				topicId,
				kind: "fact",
				isAtomic: true,
				subject: "cafe",
				claimType: "other",
				value: "roasts beans",
				text,
				importance: 0.8,
				findingIds: [scanFinding.findingId],
				firstScanId: scanFinding.scanId,
				lastSeenScanId: scanFinding.scanId,
				embedding: vector(cosine),
				embeddingModel: TOPIC_MEMORY_EMBEDDING_MODEL,
			})
			// the first statement, from the first Scan
			const [older] = await db
				.insert(topicMemories)
				.values(toRow(first, "The cafe roasts beans.", 1))
				.returning({ id: topicMemories.id })
			if (!older) {
				throw new Error("The rated fixture is missing")
			}
			const rate = (
				topicMemoryId: string,
				feedback: { rating: "up" | "down"; note?: string },
			): ReturnType<typeof saveTopicMemoryFeedback> =>
				saveTopicMemoryFeedback({ topicId, userId: ownerId, topicMemoryId, feedback })
			expect(await rate(older.id, { rating: "up", note: "Seen it myself." })).toBe("saved")
			await db.insert(topicMemories).values(toRow(later, "The cafe roasts its own beans in house.", 0.95))

			// the Journal shows the newer wording with the owner's note, under the id that the note is saved on
			const loadItems = async (): Promise<Awaited<ReturnType<typeof loadTopicMemoriesPage>>["items"]> =>
				(await loadTopicMemoriesPage({ topicId, userId: ownerId, page: 1 })).items
			expect(await loadItems()).toMatchObject([
				{ id: older.id, text: "The cafe roasts its own beans in house.", rating: "up", note: "Seen it myself." },
			])

			// a correction on the same item replaces the note, and both the Journal and the prompt read it as one
			expect(await rate(older.id, { rating: "down", note: "They buy roasted beans." })).toBe("saved")
			expect(await loadItems()).toMatchObject([{ id: older.id, kind: "correction", note: "They buy roasted beans." }])
			const [ranked] = await loadRankedTopicMemories({ topicId })
			expect(ranked).toMatchObject({
				text: "The cafe roasts its own beans in house.",
				correction: "They buy roasted beans.",
			})

			// a thumbs-down with no note rejects both statements, so the fact leaves the Journal
			expect(await rate(older.id, { rating: "down" })).toBe("saved")
			expect(await loadItems()).toEqual([])
			expect((await loadMemories(topicId)).map(({ status }) => status)).toEqual(["rejected", "rejected"])
		})
	})

	test("the Journal keeps all 31 ratings and notes while the prompt selects its ranked subset", async () => {
		await withTopic(async ({ topicId, ownerId }) => {
			// Give each recipe its own group so the prompt budget decides which claims Carl reads.
			const scanFinding = await insertBrew(topicId, 1)
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
						findingIds: [scanFinding.findingId],
						firstScanId: scanFinding.scanId,
						lastSeenScanId: scanFinding.scanId,
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
			// read every page of the Journal
			const journal = []
			for (let page = 1; page <= Math.ceil(memories.length / TOPIC_MEMORY_PAGE_SIZE); page++) {
				const result = await loadTopicMemoriesPage({ topicId, userId: ownerId, page })
				journal.push(...result.items)
			}
			// every topic memory is on a page with its rating and note, the ones outside the prompt among them
			expect(journal).toHaveLength(memories.length)
			expect(new Set(journal.map(({ id }) => id))).toEqual(new Set(memories.map(({ id }) => id)))
			expect(journal.every((item) => item.rating === "up" && item.note === item.text)).toBe(true)
			expect(journal.filter((item) => !promptClaims.has(item.text))).toHaveLength(31 - TOPIC_MEMORY_PROMPT_LIMIT)
		})
	})

	test("public external facts keep distinct person identities and the saved notes enter Carl's context", async () => {
		await withTopic(async ({ topicId, ownerId }) => {
			// use a cross-Topic podcast URL with a real shape
			const ownEpisode = await insertBrew(
				topicId,
				1,
				`https://reader@carlnotes.com./topics/recreated/keeping-up-with-the-chens/episodes/2026/17?journal-integration=${topicId}`,
			)
			expect(await loadTopicMemoryFindings(ownEpisode.scanId, topicId)).toEqual([])

			// the vector is deliberately identical to exercise the DB identity guard
			const first = await insertBrew(topicId, 2)
			const second = await insertBrew(topicId, 3)
			for (const [scanFinding, identifyingDetail] of [
				[first, "Taipei 101 marketing"],
				[second, "Benedictine University"],
			] as const) {
				await saveTopicMemoryUpdates({
					topicId,
					scanId: scanFinding.scanId,
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
							findingIds: [scanFinding.findingId],
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
			// the prompt holds both notes, and a public read holds no topic memory
			const prompt = toTopicMemoryPromptText(await loadRankedTopicMemories({ topicId }))
			expect(prompt).toContain("Thumbs up note: Keep the local coverage.")
			expect(prompt).toContain("Thumbs down note: The university describes a different role.")
			expect(await loadRankedTopicMemories({ topicId, isPublicOnly: true })).toEqual([])
			// a neighbor read returns the notes too
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
			// one topic memory to rate
			const scanFinding = await insertBrew(topicId, 1)
			await writeTopicMemory(scanFinding, "Check the brew temperature.", vector(1))
			const [memory] = await loadMemories(topicId)
			if (!memory) {
				throw new Error("Missing topic memory fixture")
			}
			// each rating saves with its note
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

	test("both prompt loaders keep Skywork AI editing and Spotify publishing as separate groups", async () => {
		await withTopic(async ({ topicId, ownerId }) => {
			// two distinct values share a subject and type. repeated editing evidence shares one group
			const first = await insertBrew(topicId, 1)
			const second = await insertBrew(topicId, 2)
			const third = await insertBrew(topicId, 3)
			const fourth = await insertBrew(topicId, 4)
			// one subject and claim type, two wordings of the editing claim, and one publishing claim
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
			// the topic memory of the fourth Scan
			const [historical] = await db
				.select({ id: topicMemories.id })
				.from(topicMemories)
				.where(eq(topicMemories.lastSeenScanId, fourth.scanId))
			if (!historical) {
				throw new Error("The archived fixture is missing")
			}
			// rate the topic memory, then retire it
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
			// the neighbors hold both groups and leave the retired topic memory out
			const neighbors = await loadTopicMemoryNeighbors(topicId, vector(1))
			expect(neighbors).toHaveLength(2)
			expect(neighbors.map(({ text }) => text)).toContain(publishing)
			expect(neighbors.some(({ id }) => id === historical.id)).toBe(false)
		})
	})

	test("a rating counts only while its rater may still rate", async () => {
		await withTopic(async ({ topicId, ownerId }) => {
			// the owning team holds the owner and a second leader
			const leaderId = await insertUser()
			const teamId = crypto.randomUUID()
			const leaderMembership = and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, leaderId))
			const ownerMembership = and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, ownerId))
			try {
				await db.insert(teams).values({ id: teamId, name: `Journal ${teamId}` })
				await db.update(topics).set({ teamId }).where(eq(topics.id, topicId))
				await db.insert(teamMembers).values([
					{ teamId, userId: ownerId, role: "leader" },
					{ teamId, userId: leaderId, role: "leader" },
				])

				// the leader corrects one topic memory and saves the other
				await writeTopicMemory(await insertBrew(topicId, 1), "The cafe opens at seven.", vector(1))
				await writeTopicMemory(await insertBrew(topicId, 2), "The cafe roasts its own beans.", vector(0))
				// find each topic memory by its words
				const memories = await loadMemories(topicId)
				const corrected = memories.find(({ text }) => text.includes("seven"))
				const saved = memories.find(({ text }) => text.includes("beans"))
				if (!corrected || !saved) {
					throw new Error("The rated fixtures are missing")
				}
				const rate = (
					topicMemoryId: string,
					feedback: { rating: "up" | "down"; note: string },
				): ReturnType<typeof saveTopicMemoryFeedback> =>
					saveTopicMemoryFeedback({ topicId, userId: leaderId, topicMemoryId, feedback })
				expect(await rate(corrected.id, { rating: "down", note: "It opens at eight." })).toBe("saved")
				expect(await rate(saved.id, { rating: "up", note: "Keep the roaster." })).toBe("saved")

				// what each reader of ratings returns for this Topic
				const readRatings = async (): Promise<Record<string, unknown>> => {
					const ranked = await loadRankedTopicMemories({ topicId })
					return {
						corrections: ranked.flatMap(({ correction }) => (correction ? [correction] : [])),
						promptNotes: ranked.flatMap(({ feedback }) => feedback.map(({ note }) => note)).sort(),
						searchNotes: (await loadTopicMemoryRatingNotes(topicId)).map(({ note }) => note).sort(),
						firstText: ranked[0]?.text,
						kinds: (await loadTopicMemoriesPage({ topicId, userId: ownerId, page: 1 })).items.map(({ kind }) => kind),
					}
				}
				const counted = {
					corrections: ["It opens at eight."],
					promptNotes: ["It opens at eight.", "Keep the roaster."],
					searchNotes: ["It opens at eight.", "Keep the roaster."],
					firstText: "The cafe roasts its own beans.",
					kinds: ["fact", "correction"],
				}
				const uncounted = { corrections: [], promptNotes: [], searchNotes: [], kinds: ["fact", "fact"] }
				expect(await readRatings()).toEqual(counted)

				// a leader who became a member no longer steers any prompt
				await db.update(teamMembers).set({ role: "member" }).where(leaderMembership)
				expect(await readRatings()).toMatchObject(uncounted)
				expect(await loadTopicMemoryPrompt({ topicId })).not.toContain("It opens at eight.")

				// the ratings count again with the role, and stop once the owner leaves the team
				await db.update(teamMembers).set({ role: "leader" }).where(leaderMembership)
				expect(await readRatings()).toEqual(counted)
				await db.update(teamMembers).set({ isActive: false }).where(ownerMembership)
				expect(await readRatings()).toMatchObject(uncounted)
			} finally {
				// remove the team and the leader
				await db.delete(teams).where(eq(teams.id, teamId))
				await db.delete(users).where(eq(users.id, leaderId))
			}
		})
	})
}
