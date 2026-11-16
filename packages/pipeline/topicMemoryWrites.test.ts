import { afterEach, expect, test } from "bun:test"
import {
	TOPIC_MEMORY_FACT_FORMAT_VERSION,
	TOPIC_MEMORY_GROUP_CANDIDATE_LIMIT,
} from "@carlnotes/contracts/topicMemoryWork"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { TOPIC_MEMORY_EMBEDDING_MODEL } from "@carlnotes/db/schema/topicMemories"
import { topics } from "@carlnotes/db/schema/topics"
import type { EmbeddedTopicMemoryWrite } from "./applyTopicMemoryWrite"
import { loadTopicMemoryNeighbors } from "./topicMemoryEvidence"
import { saveTopicMemoryUpdates } from "./topicMemoryWrites"

afterEach(restoreConnectionPool)

test("each cluster retrieves five Topic-scoped neighbors and can see evicted history", async () => {
	const queries = stubConnectionPool()
	await loadTopicMemoryNeighbors("topic-1", [1, 0])
	expect(queries[0]?.values).toEqual(
		expect.arrayContaining(["topic-1", "active", "outdated", TOPIC_MEMORY_EMBEDDING_MODEL, "[1,0]"]),
	)
	expect(queries[0]?.values.at(-1)).toBe(TOPIC_MEMORY_GROUP_CANDIDATE_LIMIT)
	expect(queries[0]?.text).toContain("<=>")
})

test.each([false, true])("a write completes the Scan atomically with rejected=%s", async (isRejected) => {
	// provide one eligible Finding and a completed brew ready to update topic memories
	const queries = stubConnectionPool(({ text }) => {
		const knownRows: [string, unknown[][]][] = [
			['from "topics"', [toTableRow(topics, { id: "topic-1" })]],
			['from "findings"', [["finding-1", "Public", "", "", null, null]]],
			[
				'select "id", "topic_id", "owner_id"',
				[["brew-2", "topic-1", "owner-1", "2026-11-02T12:00:00Z", null, null, TOPIC_MEMORY_FACT_FORMAT_VERSION]],
			],
			["regexp_replace", isRejected ? [["rejected"]] : []],
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
		subject: "Water",
		claimType: "other",
		value: "temperature changed",
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
	const insert = queries.find(({ text }) => text.startsWith('insert into "topic_memories"'))
	expect(Boolean(insert)).toBe(!isRejected)
	expect(queries.some(({ text }) => text.includes("<=>"))).toBe(false)
	// a successful attempt always records its Scan even when nothing is added
	expect(queries.at(-1)?.text).toContain('update "scans" set')
	expect(queries.at(-1)?.text).toContain('"topic_memories_format_version"')
	expect(queries.at(-1)?.text).toContain('"topic_memories_updated_at"')
})
