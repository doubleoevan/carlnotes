import { afterEach, expect, test } from "bun:test"
import { getTableConfig } from "drizzle-orm/pg-core"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "./connectionPoolStub"
import { db } from "./index"
import { EMBED_DIMENSIONS } from "./schema/scans"
import { topicMemories, topicMemoryFeedback } from "./schema/topicMemories"
import { topics } from "./schema/topics"
import { loadRankedTopicMemories, loadTopicMemoriesPage, toVisibleTopicMemoryGroupRows } from "./topicMemories"
import { saveTopicMemoryFeedback } from "./topicMemoryFeedback"

afterEach(restoreConnectionPool)

test("the Journal indexes active reads and permits one feedback row per rater", () => {
	// inspect the schema the migration is generated from
	const memories = getTableConfig(topicMemories)
	const feedback = getTableConfig(topicMemoryFeedback)
	expect(memories.indexes[0]?.config.columns.map((column) => "name" in column && column.name)).toEqual([
		"topic_id",
		"status",
		"importance",
	])
	expect(topicMemories.embedding.getSQLType()).toBe(`vector(${EMBED_DIMENSIONS})`)
	expect(feedback.primaryKeys[0]?.columns.map(({ name }) => name)).toEqual(["topic_memory_id", "user_id"])
	expect(memories.foreignKeys.map((key) => key.reference().foreignTable)).toContain(topicMemories)
})

test("the Journal groups from creation order while prompts keep feedback priority", async () => {
	// exercise both readers, including the second page and a chapter-specific public slice
	const queries = stubConnectionPool(() => [])
	expect(await loadTopicMemoriesPage({ topicId: "topic-1", userId: null, page: 2 })).toEqual({
		items: [],
		pageCount: 0,
	})
	await loadRankedTopicMemories({ topicId: "topic-1", embeddings: [[1, 0]], isPublicOnly: true })
	// keep the Journal's date order independent of prompt relevance and ratings
	const [journal, prompt] = queries
	expect(journal?.text).toContain('order by "topic_memories"."created_at", "topic_memories"."id"')
	expect(journal?.values).toContain("active")
	expect(prompt?.values).toContain("active")
	expect(prompt?.text).toContain("then 0 when")
	expect(prompt?.text).toContain("then 1 else 2 end")
	expect(prompt?.text).toContain('"importance" desc')
	expect(prompt?.text).toContain("<=>")
	expect(prompt?.text).toContain('"scans"."id" = "topic_memories"."last_seen_scan_id"')
	expect(prompt?.text).toContain('"topics"."visibility" = \'public\'')
})

test("invite Journal rows and Brew diary counts share the first-Scan activation gate", async () => {
	// produce enough active topic memories to exercise both the count and the page rounding
	const queries = stubConnectionPool(() => [])
	const invite = { topicId: "topic-1", userId: "subscriber-1", visibility: "invite" } as const
	expect((await loadTopicMemoriesPage({ ...invite, page: 1 })).pageCount).toBe(0)
	await db.select({ groupRows: toVisibleTopicMemoryGroupRows(invite) }).from(topics)
	expect(queries).toHaveLength(2)
	// the count must hide the same history as the page
	for (const { text } of queries) {
		expect(text).toContain('"scans"."id" = "topic_memories"."first_scan_id"')
		expect(text).toContain('"scans"."started_at" >')
		expect(text).toContain('select min("created_at") from "subscriptions"')
		expect(text).toContain('"topics"."owner_id"')
		expect(text).toContain('"team_members"."is_active"')
	}
})

test("a member who lost their lead role cannot reject a topic memory", async () => {
	const queries = stubConnectionPool(({ text }) => {
		if (text.includes('from "topics"')) {
			return [toTableRow(topics, { id: "topic-1", ownerId: "owner-1" })]
		}
		return text.includes('from "team_members"') ? [["member"]] : []
	})
	// no topic memory read or write is allowed after the role check fails
	expect(
		await saveTopicMemoryFeedback({
			topicId: "topic-1",
			topicMemoryId: "topic-memory-1",
			userId: "former-lead",
			feedback: { rating: "down" },
		}),
	).toBe("forbidden")
	expect(queries.some(({ text }) => text.includes('from "topic_memories"'))).toBe(false)
})

test.each([
	{ note: "This applies only to dark roasts.", status: "active" },
	{ note: "  ", status: "rejected" },
])("a downvote with note '$note' leaves a topic memory $status", async ({ note, status }) => {
	// an authorized caller reaches the scoped feedback write
	const queries = stubConnectionPool(({ text }) => {
		if (text.includes('from "topics"')) {
			return [toTableRow(topics, { id: "topic-1", ownerId: "owner-1" })]
		}
		return text.startsWith("select") ? [["topic-memory-1", false]] : []
	})
	expect(
		await saveTopicMemoryFeedback({
			topicId: "topic-1",
			topicMemoryId: "topic-memory-1",
			userId: "owner-1",
			feedback: { rating: "down", note },
		}),
	).toBe("saved")
	expect(queries.find(({ text }) => text.startsWith('insert into "topic_memory_feedback"'))?.values).toContain(
		note.trim() || null,
	)
	expect(queries.find(({ text }) => text.startsWith('update "topic_memories"'))?.values).toContain(status)
})

test("clearing a rating also removes the caller's correction", async () => {
	// grant an owner access to an active topic memory
	const queries = stubConnectionPool(({ text }) => {
		if (text.includes('from "topics"')) {
			return [toTableRow(topics, { id: "topic-1", ownerId: "owner-1" })]
		}
		return text.startsWith("select") ? [["topic-memory-1", false]] : []
	})
	expect(
		await saveTopicMemoryFeedback({
			topicId: "topic-1",
			topicMemoryId: "topic-memory-1",
			userId: "owner-1",
			feedback: { rating: null },
		}),
	).toBe("saved")

	// clear either rating without editing the topic memory or other raters' feedback
	const deletion = queries.find(({ text }) => text.startsWith('delete from "topic_memory_feedback"'))
	expect(deletion?.values).toEqual(["topic-memory-1", "owner-1"])
	expect(deletion?.text).not.toContain('"rating"')
	expect(queries.some(({ text }) => text.startsWith('update "topic_memories"'))).toBe(false)
})
