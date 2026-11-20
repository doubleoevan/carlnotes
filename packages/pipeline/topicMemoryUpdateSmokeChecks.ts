// the disposable database checks of a Journal add and update: a distinct claim on an exact key, a surplus
// candidate, an update that keeps its row's id, and an update that leaves a rated or newer wording

import { expect, test } from "bun:test"
import { db } from "@carlnotes/db"
import { topicMemories } from "@carlnotes/db/schema/topicMemories"
import { saveTopicMemoryFeedback } from "@carlnotes/db/topicMemoryFeedback"
import { eq } from "drizzle-orm"
import type { EmbeddedTopicMemoryWrite } from "./applyTopicMemoryWrite"
import { insertBrew, loadMemories, signal, vector, withTopic, writeTopicMemory } from "./topicMemorySmokeFixtures"
import { saveTopicMemoryUpdates } from "./topicMemoryWrites"

// Register these cases inside the disposable database suite.
export function checkTopicMemoryUpdates(): void {
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
			// the first Scan's wording is rejected before the second Scan writes
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
			// the first Scan's topic memory, as stored
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

	test("a Journal update leaves a rated row's wording and a newer Scan's wording as they are", async () => {
		await withTopic(async ({ topicId, ownerId }) => {
			// two topic memories from the middle Scans, the first of them saved by the owner
			const olderBrew = await insertBrew(topicId, 1)
			const ratedBrew = await insertBrew(topicId, 2)
			const unratedBrew = await insertBrew(topicId, 3)
			const newerBrew = await insertBrew(topicId, 4)
			await writeTopicMemory(ratedBrew, "The cafe opened.", vector(1))
			await writeTopicMemory(unratedBrew, "The cafe sells beans.", vector(0))
			// the active topic memory with the given wording
			const loadRow = async (wording: string): Promise<typeof topicMemories.$inferSelect> => {
				const row = (await loadMemories(topicId)).find(({ text, status }) => status === "active" && text === wording)
				if (!row) {
					throw new Error(`The topic memory "${wording}" is missing`)
				}
				return row
			}
			// the owner saves the first topic memory
			const { id: ratedId } = await loadRow("The cafe opened.")
			await saveTopicMemoryFeedback({ topicId, userId: ownerId, topicMemoryId: ratedId, feedback: { rating: "up" } })

			// a model-confirmed update in fuller wording for a row
			const toUpdate = (
				target: typeof topicMemories.$inferSelect,
				scanFinding: Awaited<ReturnType<typeof insertBrew>>,
				text: string,
			): EmbeddedTopicMemoryWrite => ({
				operation: "add",
				subject: "Acorn Cafe",
				value: text,
				claimType: "other",
				kind: "fact",
				person: null,
				factDate: null,
				text,
				importance: 0.85,
				embedding: vector(1),
				findingIds: [scanFinding.findingId],
				reconciliation: { operation: "update", target, useCandidateText: true },
			})

			// a newer Scan adds its evidence to the saved row, which keeps the wording that the owner saw
			const rated = await loadRow("The cafe opened.")
			const fullerOpening = toUpdate(rated, newerBrew, "The Acorn Cafe opened to the public.")
			await saveTopicMemoryUpdates({ topicId, scanId: newerBrew.scanId, writes: [fullerOpening], signal })
			expect(await loadRow("The cafe opened.")).toMatchObject({
				id: rated.id,
				findingIds: [ratedBrew.findingId, newerBrew.findingId],
				lastSeenScanId: newerBrew.scanId,
			})

			// an older Scan adds its evidence to the other row, which keeps the newer Scan's wording
			const unrated = await loadRow("The cafe sells beans.")
			const olderWording = toUpdate(unrated, olderBrew, "The Acorn Cafe once sold whole beans.")
			await saveTopicMemoryUpdates({ topicId, scanId: olderBrew.scanId, writes: [olderWording], signal })
			expect(await loadRow("The cafe sells beans.")).toMatchObject({
				id: unrated.id,
				findingIds: [unratedBrew.findingId, olderBrew.findingId],
				lastSeenScanId: unratedBrew.scanId,
			})
		})
	})
}
