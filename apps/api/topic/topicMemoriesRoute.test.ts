import { afterEach, expect, test } from "bun:test"
import { topicMemoriesQuery, topicMemoryFeedbackPayload } from "@carlnotes/contracts/topicMemories"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { canRateTopicMemories } from "@carlnotes/db/findingPermissions"
import type { TopicRole } from "@carlnotes/db/topicPermissions"
import { readTopicMemories } from "./topicMemoriesRoute"

afterEach(restoreConnectionPool)

test("the Journal gives feedback authority only to owners and leads", () => {
	const roles: TopicRole[] = ["owner", "leader", "member", null]
	expect(roles.map(canRateTopicMemories)).toEqual([true, true, false, false])
})

test("feedback validation rejects control characters before storage", () => {
	expect(topicMemoryFeedbackPayload.safeParse({ rating: "down", note: "A\u0000B" }).success).toBe(false)
})

test("pages beyond the eviction target can show protected takeaways", () => {
	expect(topicMemoriesQuery.parse({ page: "21" })).toEqual({ page: 21 })
})

test("a private Topic's Journal never queries takeaways for a visitor", async () => {
	const queries = stubConnectionPool(() => [["topic-1", "owner-1", "private", null]])
	expect(await readTopicMemories({ topicId: "topic-1", userId: null, page: 1 })).toBeNull()
	expect(queries.some(({ text }) => text.includes('from "topic_memories"'))).toBe(false)
})

test("a visitor can read a public Topic's Journal with no rating controls", async () => {
	stubConnectionPool(({ text }) =>
		text.startsWith('select "id", "owner_id", "visibility"') ? [["topic-1", "owner-1", "public", null]] : [],
	)
	expect(await readTopicMemories({ topicId: "topic-1", userId: null, page: 1 })).toEqual({
		items: [],
		pageCount: 0,
		canRate: false,
	})
})

test("MCP withholds private takeaways from an admin who has no Topic membership", async () => {
	const queries = stubConnectionPool(() => [])
	expect(
		await readTopicMemories({ topicId: "topic-1", userId: "admin-1", page: 1, requiresPrivateMembership: true }),
	).toBeNull()
	expect(queries).toHaveLength(1)
	expect(queries[0]?.text).toContain("left join lateral")
	expect(queries[0]?.text).toContain('"team_members"."is_active"')
})
