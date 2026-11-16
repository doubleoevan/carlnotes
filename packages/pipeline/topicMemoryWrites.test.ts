import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { EMBED_MODEL_NAME } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import type { EmbeddedTopicMemoryWrite } from "./applyTopicMemoryWrite"
import { loadTopicMemoryNeighbors } from "./topicMemoryEvidence"
import { saveTopicMemoryUpdates } from "./topicMemoryWrites"

afterEach(restoreConnectionPool)

test("each cluster retrieves five Topic-scoped neighbors and can see evicted history", async () => {
	const queries = stubConnectionPool()
	await loadTopicMemoryNeighbors("topic-1", [1, 0])
	expect(queries[0]?.values).toEqual(
		expect.arrayContaining(["topic-1", "active", "outdated", EMBED_MODEL_NAME, "[1,0]"]),
	)
	expect(queries[0]?.values.at(-1)).toBe(5)
	expect(queries[0]?.text).toContain("<=>")
})

test.each([
	{ similarity: 0.99, isRejected: false, mode: "reactivate" },
	{ similarity: 0.88, isRejected: false, mode: "flag" },
	{ similarity: 0.1, isRejected: false, mode: "add" },
	{ similarity: 0.95, isRejected: true, mode: "block" },
])("a proposed add can $mode", async ({ similarity, isRejected, mode }) => {
	// provide one eligible Finding, an evicted match, and a completed brew ready to update takeaways
	const queries = stubConnectionPool(({ text }) => {
		const knownRows: [string, unknown[][]][] = [
			['from "topics"', [toTableRow(topics, { id: "topic-1" })]],
			['from "findings"', [["finding-1", "Public", "", "", null, null]]],
			[
				'"first_brew"',
				[
					[
						"existing",
						"An earlier takeaway.",
						"outdated",
						null,
						0.7,
						["older-finding"],
						"brew-1",
						"2026-11-01T12:00:00Z",
						"brew-1",
						"2026-11-01T12:00:00Z",
						false,
						"[1,0]",
						EMBED_MODEL_NAME,
						"fact",
						null,
						null,
					],
				],
			],
			[
				'select "id", "topic_id", "owner_id"',
				[["brew-2", "topic-1", "owner-1", "2026-11-02T12:00:00Z", null, null, 1]],
			],
			["regexp_replace", isRejected ? [["rejected"]] : []],
			["<=>", similarity >= 0.8 ? [["existing", "existing", "An earlier takeaway.", null, similarity]] : []],
			['insert into "topic_memories"', [["added"]]],
		]
		return knownRows.find(([fragment]) => text.includes(fragment))?.[1] ?? []
	})
	const write: EmbeddedTopicMemoryWrite = {
		operation: "add",
		kind: "fact",
		person: null,
		factDate: null,
		text: "The water temperature changed.",
		importance: 0.8,
		embedding: [1, 0],
		findingIds: ["finding-1"],
	}
	await saveTopicMemoryUpdates({
		topicId: "topic-1",
		scanId: "brew-2",
		writes: [write],
		signal: new AbortController().signal,
	})
	const update = queries.find(({ text }) => text.startsWith('update "topic_memories"'))
	const insert = queries.find(({ text }) => text.startsWith('insert into "topic_memories"'))
	// each outcome writes only the intended row or leaves the Journal alone
	switch (mode) {
		case "reactivate":
			expect(update?.values).toContain("active")
			expect(update?.values).toContain("brew-2")
			expect(update?.values).toContain("existing")
			expect(insert).toBeUndefined()
			break

		case "flag":
			expect(insert?.values).toContain(true)
			expect(insert?.values).toContain("existing")
			expect(update).toBeUndefined()
			break

		case "add":
			expect(insert?.values).toContain(false)
			expect(update).toBeUndefined()
			break
		default:
			expect(insert).toBeUndefined()
			expect(update).toBeUndefined()
	}
	// a successful attempt always records its Scan even when nothing is added
	expect(queries.at(-1)?.text).toContain('update "scans" set "topic_memories_format_version"')
	expect(queries.at(-1)?.text).toContain('"topic_memories_updated_at"')
})
