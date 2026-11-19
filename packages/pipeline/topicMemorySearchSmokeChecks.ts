import { expect, test } from "bun:test"
import { db } from "@carlnotes/db"
import { findings, resources } from "@carlnotes/db/schema/scans"
import { topicMemories, topicMemoryFeedback } from "@carlnotes/db/schema/topicMemories"
import { eq } from "drizzle-orm"
import { PaidSourceError } from "./ingest/ingester"
import { searchOncePerScan } from "./ingest/scanSearchResult"
import {
	loadTopicMemoryRatingNotes,
	loadTopicMemorySearchFindings,
	toTopicMemorySearchQueries,
} from "./topicMemorySearch"
import { insertBrew, loadMemories, vector, withTopic, writeTopicMemory } from "./topicMemorySmokeFixtures"

/** Exercises the search eligibility and note boundaries against the real Journal tables. */
export function checkTopicMemorySearch(): void {
	test("concurrent and retried Scan searches call the paid provider once and replay its cost", async () => {
		await withTopic(async ({ topicId }) => {
			const { scanId } = await insertBrew(topicId, 1)
			const started = Promise.withResolvers<void>()
			const release = Promise.withResolvers<void>()
			let calls = 0
			const result = { resources: [{ url: "https://example.test/carl", kind: "read" as const }], costDollars: 0.03 }
			const search = async (): Promise<typeof result> => {
				calls += 1
				started.resolve()
				await release.promise
				return result
			}
			// A live reservation survives another worker trying the same Scan.
			const first = searchOncePerScan(scanId, search)
			await started.promise
			try {
				await expect(searchOncePerScan(scanId, search)).rejects.toThrow("no saved results")
			} finally {
				release.resolve()
			}
			expect(await first).toEqual(result)
			expect(await searchOncePerScan(scanId, search)).toEqual(result)
			expect(calls).toBe(1)
		})
	})

	test("a paid failure replays its known spend without resending the search", async () => {
		await withTopic(async ({ topicId }) => {
			const { scanId } = await insertBrew(topicId, 2)
			let calls = 0
			const search = async (): Promise<never> => {
				calls += 1
				throw new PaidSourceError("provider failed", 0.005)
			}
			for (let attempt = 0; attempt < 2; attempt++) {
				await expect(searchOncePerScan(scanId, search)).rejects.toMatchObject({ costDollars: 0.005 })
			}
			expect(calls).toBe(1)
		})
	})

	test("search rechecks the cited Finding, Topic and ratings before offering a public lead", async () => {
		await withTopic(async ({ topicId, ownerId }) => {
			const brew = await insertBrew(topicId, 1)
			await writeTopicMemory(brew, "Evan Tsao built CarlNotes.", vector(1), {
				subject: "Evan Tsao",
				claimType: "other",
				value: "CarlNotes",
				factDate: null,
			})
			const [row] = await loadMemories(topicId)
			const [finding] = await db.select().from(findings).where(eq(findings.id, brew.findingId))
			if (!row || !finding) {
				throw new Error("Missing search fixture")
			}
			const resource = eq(resources.id, finding.resourceId)
			const query = async (): Promise<string[]> =>
				toTopicMemorySearchQueries([], await loadTopicMemorySearchFindings(topicId, brew.scanId))
			await db.update(resources).set({ title: "Evan Tsao", snippet: "Introducing CarlNotes" }).where(resource)
			await db
				.insert(topicMemoryFeedback)
				.values({ topicMemoryId: row.id, userId: ownerId, rating: "up", note: "Internal guidance" })
			expect(await query()).toEqual(["evan tsao carlnotes"])
			expect(await loadTopicMemoryRatingNotes(topicId)).toEqual([
				{ claim: row.text, rating: "up", note: "Internal guidance" },
			])
			expect(await loadTopicMemorySearchFindings("another-topic", brew.scanId)).toEqual([])
			expect(await loadTopicMemoryRatingNotes("another-topic")).toEqual([])

			// A correction remains available to guide other leads. Its disputed fact cannot be offered.
			await db.update(topicMemoryFeedback).set({ rating: "down" }).where(eq(topicMemoryFeedback.topicMemoryId, row.id))
			expect(await query()).toEqual([])
			expect((await loadTopicMemoryRatingNotes(topicId))[0]?.rating).toBe("down")
			await db.delete(topicMemoryFeedback).where(eq(topicMemoryFeedback.topicMemoryId, row.id))
			await db.update(findings).set({ personalSourceScoreBonus: 0.1 }).where(eq(findings.id, finding.id))
			expect(await query()).toEqual([])
			await db
				.update(findings)
				.set({ personalSourceScoreBonus: 0, sourceVisibility: "private" })
				.where(eq(findings.id, finding.id))
			expect(await query()).toEqual([])
			await db.update(findings).set({ sourceVisibility: "public", rating: "down" }).where(eq(findings.id, finding.id))
			expect(await query()).toEqual([])
			await db.update(findings).set({ rating: null }).where(eq(findings.id, finding.id))
			await db
				.update(resources)
				.set({ url: `https://carlnotes.com/topics/${topicId}` })
				.where(resource)
			expect(await query()).toEqual([])
			await db
				.update(resources)
				.set({ url: `https://example.test/${brew.scanId}` })
				.where(resource)
			await db.update(topicMemories).set({ status: "outdated" }).where(eq(topicMemories.id, row.id))
			expect(await query()).toEqual([])
		})
	})
}
