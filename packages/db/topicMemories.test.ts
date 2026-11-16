import { afterEach, expect, test } from "bun:test"
import { getTableConfig } from "drizzle-orm/pg-core"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "./connectionPoolStub"
import { db } from "./index"
import { EMBED_DIMENSIONS } from "./schema/scans"
import { topicMemories, topicMemoryFeedback } from "./schema/topicMemories"
import { topics } from "./schema/topics"
import {
	loadRankedTopicMemories,
	loadTopicMemoriesPage,
	saveTopicMemoryFeedback,
	toVisibleTopicMemoryCount,
} from "./topicMemories"

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

test("Journal and prompt reads share feedback priority and keep inactive takeaways out", async () => {
	// exercise both readers, including the second page and a chapter-specific public slice
	const queries = stubConnectionPool(({ text }) => (text.startsWith("select count(") ? [[8]] : []))
	expect(await loadTopicMemoriesPage({ topicId: "topic-1", userId: null, page: 2 })).toEqual({
		items: [],
		pageCount: 2,
	})
	await loadRankedTopicMemories({ topicId: "topic-1", embeddings: [[1, 0]], isPublicOnly: true })
	// both readers rank feedback before importance
	const ranked = queries.filter(({ text }) => text.includes("order by case when exists"))
	expect(ranked).toHaveLength(2)
	for (const query of ranked) {
		expect(query.values).toContain("active")
		expect(query.text).toContain("then 0 when")
		expect(query.text).toContain("then 1 else 2 end")
		expect(query.text).toContain('"importance" desc')
	}
	// paging and public relevance each add their own query bounds
	expect(ranked[0]?.values.slice(-2)).toEqual([5, 5])
	expect(ranked[1]?.text).toContain("<=>")
	expect(ranked[1]?.text).toContain('"scans"."id" = "topic_memories"."last_seen_scan_id"')
	expect(ranked[1]?.text).toContain('"topics"."visibility" = \'public\'')
	expect(ranked[1]?.values.at(-1)).toBe(20)
})

test("invite Journal rows and Brew diary counts share the first-Scan activation gate", async () => {
	// produce enough active takeaways to exercise both the count and the page rounding
	const queries = stubConnectionPool(({ text }) => (text.startsWith("select count(") ? [[8]] : []))
	const invite = { topicId: "topic-1", userId: "subscriber-1", visibility: "invite" } as const
	expect((await loadTopicMemoriesPage({ ...invite, page: 1 })).pageCount).toBe(2)
	await db.select({ takeawayCount: toVisibleTopicMemoryCount(invite) }).from(topics)
	expect(queries).toHaveLength(3)
	// the count must hide the same history as the page
	for (const { text } of queries) {
		expect(text).toContain('"scans"."id" = "topic_memories"."first_scan_id"')
		expect(text).toContain('"scans"."started_at" >')
		expect(text).toContain('select min("created_at") from "subscriptions"')
		expect(text).toContain('"topics"."owner_id"')
		expect(text).toContain('"team_members"."is_active"')
	}
})

test("a member who lost their lead role cannot reject a takeaway", async () => {
	const queries = stubConnectionPool(({ text }) => {
		if (text.includes('from "topics"')) {
			return [toTableRow(topics, { id: "topic-1", ownerId: "owner-1" })]
		}
		return text.includes('from "team_members"') ? [["member"]] : []
	})
	// no takeaway read or write is allowed after the role check fails
	expect(
		await saveTopicMemoryFeedback({
			topicId: "topic-1",
			topicMemoryId: "takeaway-1",
			userId: "former-lead",
			feedback: { rating: "down" },
		}),
	).toBe("forbidden")
	expect(queries.some(({ text }) => text.includes('from "topic_memories"'))).toBe(false)
})

test.each([
	{ note: "This applies only to dark roasts.", status: "active" },
	{ note: "  ", status: "rejected" },
])("a downvote with note '$note' leaves a takeaway $status", async ({ note, status }) => {
	// an authorized caller reaches the scoped feedback write
	const queries = stubConnectionPool(({ text }) => {
		if (text.includes('from "topics"')) {
			return [toTableRow(topics, { id: "topic-1", ownerId: "owner-1" })]
		}
		return text.startsWith("select") ? [["takeaway-1", false]] : []
	})
	expect(
		await saveTopicMemoryFeedback({
			topicId: "topic-1",
			topicMemoryId: "takeaway-1",
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
	// grant an owner access to an active takeaway
	const queries = stubConnectionPool(({ text }) => {
		if (text.includes('from "topics"')) {
			return [toTableRow(topics, { id: "topic-1", ownerId: "owner-1" })]
		}
		return text.startsWith("select") ? [["takeaway-1", false]] : []
	})
	expect(
		await saveTopicMemoryFeedback({
			topicId: "topic-1",
			topicMemoryId: "takeaway-1",
			userId: "owner-1",
			feedback: { rating: null },
		}),
	).toBe("saved")

	// clear either rating without editing the takeaway or other raters' feedback
	const deletion = queries.find(({ text }) => text.startsWith('delete from "topic_memory_feedback"'))
	expect(deletion?.values).toEqual(["takeaway-1", "owner-1"])
	expect(deletion?.text).not.toContain('"rating"')
	expect(queries.some(({ text }) => text.startsWith('update "topic_memories"'))).toBe(false)
})

test("the saved takeaway limit lets another rater endorse an already saved takeaway", async () => {
	// both requests see a full cap, but adding a second vote cannot consume a slot
	const rate = (): ReturnType<typeof saveTopicMemoryFeedback> =>
		saveTopicMemoryFeedback({
			topicId: "topic-1",
			topicMemoryId: "takeaway-1",
			userId: "owner-1",
			feedback: { rating: "up" },
		})
	let isSavedTakeaway = false
	const queries = stubConnectionPool(({ text }) => {
		if (text.includes('from "topics"')) {
			return [toTableRow(topics, { id: "topic-1", ownerId: "owner-1" })]
		}
		// the Topic already has reached the saved takeaway limit
		if (text.startsWith("select count(")) {
			return [[30]]
		}
		return text.startsWith("select") ? [["takeaway-1", isSavedTakeaway]] : []
	})
	expect(await rate()).toBe("savedTakeawayLimit")
	expect(queries.some(({ text }) => text.startsWith("insert"))).toBe(false)
	// adding an endorsement to a saved takeaway takes no extra slot
	isSavedTakeaway = true
	expect(await rate()).toBe("saved")
	expect(queries.filter(({ text }) => text.startsWith("insert"))).toHaveLength(1)
})
