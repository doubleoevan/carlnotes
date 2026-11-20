import { afterEach, expect, test } from "bun:test"
import { topicMemoriesQuery, topicMemoryFeedbackPayload } from "@carlnotes/contracts/topicMemories"
import {
	FREE_USER_ACCESS_ROW,
	restoreConnectionPool,
	stubConnectionPool,
	toTableRow,
} from "@carlnotes/db/connectionPoolStub"
import { canRateTopicMemories } from "@carlnotes/db/findingPermissions"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { topics } from "@carlnotes/db/schema/topics"
import type { Hono } from "hono"
import type { AppEnv } from "../currentUser"
import { toJsonRequest, toSignedInApp } from "../testSession"
import { readTopicMemories, topicMemoriesRoute } from "./topicMemoriesRoute"

afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
})

// any user can share a public Topic with a team they lead, so a share gives no authority over what Carl remembers
test("only the Topic's owner and a leader of its owning team may rate its memories", async () => {
	// the owning team's active members: the owner, a leader, and a plain member
	const owningTeamRoles: Record<string, string> = { "owner-1": "leader", "lead-1": "leader", "member-1": "member" }
	const queries = stubConnectionPool(({ text, values }) =>
		text.includes('from "team_members"')
			? Object.entries(owningTeamRoles).filter(([userId]) => values.includes(userId))
			: [],
	)
	const teamTopic = { ownerId: "owner-1", teamId: "team-1" }
	const toRaters = (userIds: (string | null)[]): Promise<boolean[]> =>
		Promise.all(userIds.map((userId) => canRateTopicMemories(userId, teamTopic)))

	// the owner and the owning team's leader rate, and a member, a share team's leader, and a visitor do not
	expect(await toRaters(["owner-1", "lead-1", "member-1", "share-lead-1", null])).toEqual([
		true,
		true,
		false,
		false,
		false,
	])

	// a Topic on no team is its owner's alone, and the read never asks for a share
	expect(await canRateTopicMemories("share-lead-1", { ownerId: "owner-1", teamId: null })).toBe(false)
	expect(queries.some(({ text }) => text.includes('"team_topics"'))).toBe(false)
})

test("a leader stops rating once the Topic's owner has left the owning team", async () => {
	stubConnectionPool(({ text }) => (text.includes('from "team_members"') ? [["lead-1", "leader"]] : []))
	expect(await canRateTopicMemories("lead-1", { ownerId: "owner-1", teamId: "team-1" })).toBe(false)
})

test("feedback validation rejects control characters before storage", () => {
	expect(topicMemoryFeedbackPayload.safeParse({ rating: "down", note: "A\u0000B" }).success).toBe(false)
})

test("a page number past the first twenty pages parses from the query string", () => {
	expect(topicMemoriesQuery.parse({ page: "21" })).toEqual({ page: 21 })
})

test("a private Topic's Journal never queries topic memories for a visitor", async () => {
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

test("MCP withholds private topic memories from an admin who has no Topic membership", async () => {
	const queries = stubConnectionPool(() => [])
	expect(
		await readTopicMemories({ topicId: "topic-1", userId: "admin-1", page: 1, requiresPrivateMembership: true }),
	).toBeNull()
	expect(queries).toHaveLength(1)
	expect(queries[0]?.text).toContain("left join lateral")
	expect(queries[0]?.text).toContain('"team_members"."is_active"')

	// the Topic's own row is read only if the Topic is not private or the caller holds a role on it
	expect(queries[0]?.text).toMatch(/"topics"\."id" = \$\d+ and \("topics"\."visibility" <> \$\d+ or /)
	expect(queries[0]?.values).toContain("private")
})

// the Journal's routes as a signed-in user's requests, with the rate limiters' Redis stubbed
function toUserApp(userId: string): Hono<AppEnv> {
	stubRedisClient()
	return toSignedInApp(topicMemoriesRoute, userId)
}

test("a private Topic's Journal is not found for a signed-in user with no role on it", async () => {
	// the Topic is private and the caller is neither its owner nor on its team
	const queries = stubConnectionPool(({ text }) => {
		if (text.startsWith('select "id", "owner_id", "visibility"')) {
			return [["topic-1", "owner-1", "private", null]]
		}
		return text.includes('"budget_override_cents" from "users"') ? [FREE_USER_ACCESS_ROW] : []
	})
	const response = await toUserApp("stranger-1").request("/topics/topic-1/journal")

	// a hidden Topic reads as a missing one, no topic memory is read, and the response is never shared
	expect(response.status).toBe(404)
	expect(response.headers.get("cache-control")).toBe("private, no-store")
	expect(queries.some(({ text }) => text.includes('from "topic_memories"'))).toBe(false)
})

test("a plain member of the owning team may not rate a topic memory", async () => {
	// a private Topic on a team whose owner and one plain member are active
	const queries = stubConnectionPool(({ text }) => {
		if (text.includes('from "topics"')) {
			return text.startsWith('select "id", "owner_id", "visibility"')
				? [["topic-1", "owner-1", "private", "team-1"]]
				: [toTableRow(topics, { id: "topic-1", ownerId: "owner-1", visibility: "private", teamId: "team-1" })]
		}
		// the member's access row is a free plan's
		if (text.includes('"budget_override_cents" from "users"')) {
			return [FREE_USER_ACCESS_ROW]
		}
		// the role read returns the caller's role alone, and the edit rule reads the owner's membership beside it
		if (text.includes('from "team_members"')) {
			return text.includes('"user_id"')
				? [
						["owner-1", "leader"],
						["member-1", "member"],
					]
				: [["member"]]
		}
		return []
	})
	const app = toUserApp("member-1")
	const feedback = toJsonRequest({ rating: "down" }, "PUT")
	const response = await app.request("/topics/topic-1/journal/memory-1/feedback", feedback)

	// the write is rejected before any topic memory or rating is touched
	expect(response.status).toBe(403)
	expect(queries.some(({ text }) => text.includes('"topic_memory_feedback"'))).toBe(false)
	expect(queries.some(({ text }) => text.startsWith('update "topic_memories"'))).toBe(false)
})

test("a visitor's rating is rejected before any read", async () => {
	stubRedisClient()
	const queries = stubConnectionPool(() => [])
	const feedback = toJsonRequest({ rating: "up" }, "PUT")
	const response = await topicMemoriesRoute.request("/topics/topic-1/journal/memory-1/feedback", feedback)
	expect(response.status).toBe(401)
	expect(queries).toEqual([])
})

test("a rating with a note past the limit or with no rating field is rejected as a bad request", async () => {
	// a note of 401 characters, then a body with no rating
	const queries = stubConnectionPool(() => [])
	const app = toUserApp("owner-1")
	const path = "/topics/topic-1/journal/memory-1/feedback"
	for (const body of [{ rating: "down", note: "x".repeat(401) }, { note: "no rating" }]) {
		expect((await app.request(path, toJsonRequest(body, "PUT"))).status).toBe(400)
	}
	expect(queries).toEqual([])
})
