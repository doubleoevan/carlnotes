// remove Source route tests: a Source is removed by the owner or an owning team member, and by nobody else. another
// topic's Source reads as missing, and web search and a topic's last source stay
import { afterEach, expect, mock, test } from "bun:test"
import {
	FREE_USER_ACCESS_ROW,
	restoreConnectionPool,
	type SentQuery,
	stubConnectionPool,
	toTableRow,
} from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { topics } from "@carlnotes/db/schema/topics"
import { toSignedInApp } from "../testSession"
import { topicsRoute } from "./topicsRoute"
import { TEAM_MEMBER_ROWS } from "./topicTestFixtures"

// put the spies, the connection pool, and the Redis client back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
	restoreRedisClient()
})

// stub the connection pool to return public topic-1, owned by owner-1 on team-1, every user as a free user, a Source
// of the given kind on the given topic, and the topic's source count. return each query sent
function stubTopicSourceRows(
	sourceTopicId: string,
	{ sourceKind = "reddit", sourceCount = 2 }: { sourceKind?: string; sourceCount?: number } = {},
): SentQuery[] {
	stubRedisClient()
	const topicRow = toTableRow(topics, { id: "topic-1", ownerId: "owner-1", visibility: "public", teamId: "team-1" })
	return stubConnectionPool(({ text, values }) => {
		// the topic, and each user's access row
		if (text.includes('from "topics"')) {
			return [topicRow]
		}
		if (text.includes('from "users"')) {
			return [FREE_USER_ACCESS_ROW]
		}

		// the owning team's members among the users the edit check names, and the topic's source count
		if (text.startsWith('select "user_id", "role" from "team_members"')) {
			return TEAM_MEMBER_ROWS.filter(([userId]) => values.includes(userId))
		}
		if (text.includes("count(")) {
			return [[sourceCount]]
		}

		// the Source row, and the same row read again under the topic row's lock
		if (text.startsWith('select "id" from "sources"')) {
			return [["source-1"]]
		}
		return text.startsWith('select "topic_id"') ? [[sourceTopicId, sourceKind, { subreddit: "startups" }]] : []
	})
}

// remove source-1 from topic-1 as the given user, or as a signed-out visitor for null
function sendRemoveTopicSource(userId: string | null): Promise<Response> {
	const app = userId ? toSignedInApp(topicsRoute, userId) : topicsRoute
	return Promise.resolve(app.request("/topics/topic-1/sources/source-1", { method: "DELETE" }))
}

// the Source delete among the sent queries
function findTopicSourceDelete(sentQueries: SentQuery[]): SentQuery | undefined {
	return sentQueries.find((sentQuery) => sentQuery.text.startsWith('delete from "sources"'))
}

// the owner and an active member of the owning team may both edit the topic, so both remove its Source
test("the owner and an owning team member each remove a Source with a 204", async () => {
	for (const userId of ["owner-1", "member-1"]) {
		const sentQueries = stubTopicSourceRows("topic-1")
		const response = await sendRemoveTopicSource(userId)
		expect(response.status).toBe(204)
		expect(findTopicSourceDelete(sentQueries)?.values).toEqual(["source-1", "topic-1"])
	}
})

// a user and a visitor who may see the public topic but not edit it are forbidden, and nothing is deleted
test("a user who may not edit the topic and a signed-out visitor get a 403", async () => {
	for (const userId of ["stranger-1", null]) {
		const sentQueries = stubTopicSourceRows("topic-1")
		const response = await sendRemoveTopicSource(userId)
		expect(response.status).toBe(403)
		expect(findTopicSourceDelete(sentQueries)).toBeUndefined()
	}
})

// another topic's Source reads as missing, so the route never says it exists
test("removing another topic's Source returns 404 and deletes nothing", async () => {
	const sentQueries = stubTopicSourceRows("topic-2")
	const response = await sendRemoveTopicSource("owner-1")
	expect(response.status).toBe(404)
	expect(findTopicSourceDelete(sentQueries)).toBeUndefined()
})

// web search and a topic's last source stay, each a conflict naming the rule, and nothing is deleted
test("removing web search or a topic's last source returns 409 with the rule", async () => {
	const webSearchQueries = stubTopicSourceRows("topic-1", { sourceKind: "search" })
	const webSearchResponse = await sendRemoveTopicSource("owner-1")
	expect(webSearchResponse.status).toBe(409)
	expect(await webSearchResponse.json()).toEqual({ error: "webSearch" })
	expect(findTopicSourceDelete(webSearchQueries)).toBeUndefined()

	// the last source of a topic
	const lastSourceQueries = stubTopicSourceRows("topic-1", { sourceCount: 1 })
	const lastSourceResponse = await sendRemoveTopicSource("owner-1")
	expect(lastSourceResponse.status).toBe(409)
	expect(await lastSourceResponse.json()).toEqual({ error: "lastSource" })
	expect(findTopicSourceDelete(lastSourceQueries)).toBeUndefined()
})
