// the disposable database checks of the Journal's rows: eviction, protected slots, the group count, page order,
// a stale page, and the membership gate

import { expect, test } from "bun:test"
import { TOPIC_MEMORY_ACTIVE_LIMIT, TOPIC_MEMORY_PAGE_SIZE } from "@carlnotes/contracts/topicMemories"
import { db } from "@carlnotes/db"
import { loadRankedTopicMemories } from "@carlnotes/db/rankedTopicMemories"
import { EMBED_DIMENSIONS } from "@carlnotes/db/schema/scans"
import { teamMembers, teams } from "@carlnotes/db/schema/teams"
import { TOPIC_MEMORY_EMBEDDING_MODEL, topicMemories, topicMemoryFeedback } from "@carlnotes/db/schema/topicMemories"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import {
	loadMemberTopicMemoriesPage,
	loadTopicMemoriesPage,
	toTopicMemoryGroupCount,
	toVisibleTopicMemoryGroups,
} from "@carlnotes/db/topicMemories"
import { saveTopicMemoryFeedback } from "@carlnotes/db/topicMemoryFeedback"
import { eq } from "drizzle-orm"
import { isTopicMemoryLimitFilledBySaved } from "./topicMemoryCleanup"
import { insertBrew, insertUser, loadMemories, vector, withTopic, writeTopicMemory } from "./topicMemorySmokeFixtures"

// Register these cases inside the disposable database suite.
export function checkTopicMemoryJournal(): void {
	test("Journal write evicts the weakest row while retaining saved topic memories and corrections", async () => {
		await withTopic(async ({ topicId }) => {
			// two Scans, and as many topic memories as the active limit allows
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
			// the owner saves one topic memory and corrects another
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

	test("saved topic memories and corrections that fill the limit leave no slot for a new one", async () => {
		await withTopic(async ({ topicId, ownerId }) => {
			// the owner saves every topic memory of a full Journal except one
			const first = await insertBrew(topicId, 1)
			const seeded = await db
				.insert(topicMemories)
				.values(
					Array.from({ length: TOPIC_MEMORY_ACTIVE_LIMIT }, (_, index) => ({
						topicId,
						kind: "fact" as const,
						isAtomic: true,
						text: `Seed topic memory ${index}`,
						importance: 0.9,
						findingIds: [first.findingId],
						firstScanId: first.scanId,
						lastSeenScanId: first.scanId,
						embedding: vector(1),
						embeddingModel: TOPIC_MEMORY_EMBEDDING_MODEL,
					})),
				)
				.returning({ id: topicMemories.id })
			const [corrected, ...saved] = seeded
			if (!corrected) {
				throw new Error("The protected fixture is missing rows")
			}
			// a save on every topic memory but one leaves one slot unprotected
			await db
				.insert(topicMemoryFeedback)
				.values(saved.map(({ id }) => ({ topicMemoryId: id, userId: ownerId, rating: "up" as const })))
			expect(await isTopicMemoryLimitFilledBySaved(topicId)).toBe(false)

			// a correction on the last one fills the limit, and a new topic memory is then retired as it is added
			await db
				.insert(topicMemoryFeedback)
				.values({ topicMemoryId: corrected.id, userId: ownerId, rating: "down", note: "Only on weekdays." })
			expect(await isTopicMemoryLimitFilledBySaved(topicId)).toBe(true)
			// the new topic memory is stored as outdated
			await writeTopicMemory(await insertBrew(topicId, 2), "A new claim arrives.", vector(0))
			const outdated = (await loadMemories(topicId)).filter(({ status }) => status === "outdated")
			expect(outdated).toMatchObject([{ text: "A new claim arrives." }])
		})
	})

	test("the Journal count groups only the rows that share a key and counts the rest in SQL", async () => {
		await withTopic(async ({ topicId, ownerId }) => {
			// two statements of one fact with near vectors, and two facts that stand alone
			const brew = await insertBrew(topicId, 1)
			const toRow = (subject: string, text: string, cosine: number): typeof topicMemories.$inferInsert => ({
				topicId,
				kind: "fact" as const,
				isAtomic: true,
				subject,
				claimType: "other" as const,
				value: "roasts beans",
				text,
				importance: 0.8,
				findingIds: [brew.findingId],
				firstScanId: brew.scanId,
				lastSeenScanId: brew.scanId,
				embedding: vector(cosine),
				embeddingModel: TOPIC_MEMORY_EMBEDDING_MODEL,
			})
			await db
				.insert(topicMemories)
				.values([
					toRow("cafe", "The cafe roasts its own beans.", 1),
					toRow("cafe", "The cafe roasts beans in house.", 0.95),
					toRow("bakery", "The bakery roasts beans too.", 1),
					toRow("market", "The market roasts beans on Sundays.", 1),
				])

			// the count's read returns the two rows that can group and a count of the two that cannot
			const [counted] = await db
				.select({ groups: toVisibleTopicMemoryGroups({ topicId, userId: ownerId, visibility: "private" }) })
				.from(topics)
				.where(eq(topics.id, topicId))
			expect(counted?.groups.ungroupedCount).toBe(2)
			expect(counted?.groups.groupRows.map(({ subject }) => subject)).toEqual(["cafe", "cafe"])
			expect(counted?.groups.groupRows.every(({ embedding }) => embedding?.length === EMBED_DIMENSIONS)).toBe(true)

			// the count is the number of groups that the Journal's own pages show
			expect(toTopicMemoryGroupCount(counted?.groups)).toBe(3)
			expect((await loadTopicMemoriesPage({ topicId, userId: ownerId, page: 1 })).items).toHaveLength(3)
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
			// the one topic memory on the last page
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

	test("MCP page and count share the private membership gate in real Postgres", async () => {
		await withTopic(async ({ topicId, ownerId }) => {
			// a page read for a user, or for a visitor
			const runPage = (userId: string | null, page = 1): ReturnType<typeof loadMemberTopicMemoriesPage> =>
				loadMemberTopicMemoriesPage({ topicId, userId, page })
			expect((await runPage(ownerId))?.page).toEqual({ items: [], pageCount: 0 })
			// one topic memory, which a visitor cannot read and the owner can
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
				// a member who is no longer active reads nothing
				await db.update(teamMembers).set({ isActive: false }).where(eq(teamMembers.userId, memberId))
				expect(await runPage(memberId)).toBeNull()
			} finally {
				// remove the team and the member
				await db.delete(teams).where(eq(teams.id, teamId))
				await db.delete(users).where(eq(users.id, memberId))
			}
		})
	})
}
