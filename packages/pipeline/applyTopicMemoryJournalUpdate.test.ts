import { afterEach, expect, test } from "bun:test"
import { db } from "@carlnotes/db"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { topicMemories } from "@carlnotes/db/schema/topicMemories"
import { applyTopicMemoryJournalUpdate } from "./applyTopicMemoryJournalUpdate"
import type { EmbeddedTopicMemoryWrite } from "./applyTopicMemoryWrite"

afterEach(restoreConnectionPool)

// the active row that the model matched, last seen in the Scan of November 2
const TARGET = {
	id: "memory-1",
	topicId: "topic-1",
	kind: "fact",
	status: "active",
	isAtomic: true,
	needsReview: false,
	text: "The cafe opened.",
	findingIds: ["finding-1"],
	importance: 0.8,
	firstScanId: "scan-2",
	lastSeenScanId: "scan-2",
	embedding: "[1,0]",
	embeddingModel: "old-model",
	createdAt: new Date("2026-11-02T12:00:00Z"),
	updatedAt: new Date("2026-11-02T12:00:00Z"),
}

// a candidate that the model judged the same fact in fuller wording
const WRITE: EmbeddedTopicMemoryWrite = {
	operation: "add",
	kind: "fact",
	person: null,
	factDate: null,
	text: "The Acorn Cafe opened to the public.",
	subject: "Acorn Cafe",
	claimType: "launch",
	value: "public launch",
	importance: 0.8,
	embedding: [1, 0],
	findingIds: ["finding-2"],
}

// applies the update from a Scan that started at the given time, and returns the wording saved on the matched row
// and how many copies of the row were archived
async function applyUpdate({
	startedAt,
	isRated,
	useCandidateText = true,
}: {
	startedAt: string
	isRated: boolean
	useCandidateText?: boolean
}): Promise<{ text: unknown; archivedCount: number }> {
	// the matched row, its Scan's time, the ratings on it, and the archived copy's id
	const queries = stubConnectionPool(({ text }) => {
		const knownRows: [string, unknown[][]][] = [
			['from "topic_memory_feedback"', isRated ? [["memory-1"]] : []],
			['insert into "topic_memories"', [["archived-1"]]],
			['from "topic_memories"', [toTableRow(topicMemories, TARGET)]],
			['from "scans"', [["scan-2", new Date("2026-11-02T12:00:00Z")]]],
		]
		return knownRows.find(([fragment]) => text.includes(fragment))?.[1] ?? []
	})
	const memoryId = await db.transaction((transaction) =>
		applyTopicMemoryJournalUpdate(
			transaction,
			{ write: WRITE, scanId: "scan-new", startedAt: new Date(startedAt), topicId: "topic-1", now: new Date() },
			{ operation: "update", target: { ...TARGET, factDate: null, person: null }, useCandidateText },
		),
	)
	expect(memoryId).toBe("memory-1")

	// the matched row's update lists its wording first
	const update = queries.find(
		({ text }) => text.startsWith('update "topic_memories" set "text"') && text.includes('"finding_ids"'),
	)
	expect(update?.values).toContain('{"finding-1","finding-2"}')
	const archivedCount = queries.filter(({ text }) => text.startsWith('insert into "topic_memories"')).length
	return { text: update?.values[0], archivedCount }
}

test("a later Scan's fuller wording replaces an unrated topic memory's and archives the prior wording", async () => {
	const update = await applyUpdate({ startedAt: "2026-11-03T12:00:00Z", isRated: false })
	expect(update).toEqual({ text: WRITE.text, archivedCount: 1 })
})

test("a rated topic memory keeps the wording that its rater saw and still gains the evidence", async () => {
	expect((await applyUpdate({ startedAt: "2026-11-03T12:00:00Z", isRated: true })).text).toBe(TARGET.text)
})

test("an older Scan's wording never replaces a newer one's", async () => {
	expect((await applyUpdate({ startedAt: "2026-11-01T12:00:00Z", isRated: false })).text).toBe(TARGET.text)
})

test("an update that only adds evidence archives no copy of the row", async () => {
	// the model matched the row and kept its wording, and neither the wording nor the date changed
	const update = await applyUpdate({ startedAt: "2026-11-03T12:00:00Z", isRated: false, useCandidateText: false })
	expect(update).toEqual({ text: TARGET.text, archivedCount: 0 })
})

test("a later Scan that repeats the claim moves the row's last Scan and saves no decision", async () => {
	// the matched row, its Scan's time, and no ratings
	const queries = stubConnectionPool(({ text }) => {
		if (text.includes('from "topic_memories"')) {
			return [toTableRow(topicMemories, TARGET)]
		}
		return text.includes('from "scans"') ? [["scan-2", new Date("2026-11-02T12:00:00Z")]] : []
	})
	// the candidate repeats the stored wording, date, and Finding
	const repeatedWrite = { ...WRITE, text: TARGET.text, findingIds: ["finding-1"] }
	const applyRepeat = (scanId: string): Promise<string | undefined> =>
		db.transaction((transaction) =>
			applyTopicMemoryJournalUpdate(
				transaction,
				{
					write: repeatedWrite,
					scanId,
					startedAt: new Date("2026-11-03T12:00:00Z"),
					topicId: "topic-1",
					now: new Date(),
				},
				{ operation: "update", target: { ...TARGET, factDate: null, person: null }, useCandidateText: false },
			),
		)
	expect(await applyRepeat("scan-3")).toBe("memory-1")

	// the row's last Scan is the repeating Scan, with no archived copy and no decision
	const update = queries.find(({ text }) => text.startsWith('update "topic_memories" set "text"'))
	expect(update?.text).toContain('"last_seen_scan_id"')
	expect(update?.values).toContain("scan-3")
	expect(queries.some(({ text }) => text.startsWith('insert into "topic_memories"'))).toBe(false)
	expect(queries.some(({ text }) => text.startsWith('insert into "topic_memory_decisions"'))).toBe(false)

	// a replay of the row's own last Scan writes nothing
	queries.length = 0
	expect(await applyRepeat("scan-2")).toBe("memory-1")
	expect(queries.some(({ text }) => text.startsWith("update") || text.startsWith("insert"))).toBe(false)
})
