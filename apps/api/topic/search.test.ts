// topic reader tests: the view rules in the statement for a visitor, a user, and an admin, the escaped wildcard, and a
// signed-in user's subscriptions
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { searchTopics } from "./search"

// put the pool back after each test
afterEach(restoreConnectionPool)

// a visitor's search names only a public topic with enough findings, and never an owner, a team, or an invite
test("a visitor searches public topics with enough findings alone", async () => {
	// one search, with the statement recorded
	const sentQueries = stubConnectionPool()
	expect(await searchTopics({ userId: null, isAdmin: false, query: "Agents", limit: 50 })).toEqual([])
	const statementText = sentQueries[0]?.text ?? ""

	// the name match and the shown-findings count, and none of a user's rules
	expect(statementText).toContain('lower("topics"."name") like $1')
	expect(statementText).toContain('(select count(*) from "findings"')
	expect(statementText).not.toContain('"owner_id" = $')
	expect(statementText).not.toContain('"team_members"')
	expect(statementText).not.toContain('"invites"')
	expect(sentQueries[0]?.values).toEqual(["%agents%", "public", 3, 50])
})

// a user's search also names their own topics, their teams' topics, and the invite topics they are invited to or
// subscribed to, before the limit
test("a user searches the topics the view rules allow, before the limit", async () => {
	// one search as a user
	const sentQueries = stubConnectionPool()
	expect(await searchTopics({ userId: "user-1", isAdmin: false, query: "Agents", limit: 50 })).toEqual([])
	const statement = sentQueries[0]?.text ?? ""

	// the owner, team, invite, and subscription rules in the one statement
	expect(statement).toContain('"topics"."owner_id" = $')
	expect(statement).toContain('"team_members"')
	expect(statement).toContain('"team_topics"')
	expect(statement).toContain('"invites"')
	expect(statement).toContain('"subscriptions"')
	expect(statement).toContain('"email_verified" = $')

	// the limit after the rules, and the invite visibility among the values
	expect(statement).toMatch(/order by length\("topics"\."name"\), "topics"\."id" limit \$\d+$/)
	expect(sentQueries[0]?.values).toContain("invite")
})

// an admin may open every topic, so only the name is matched
test("an admin searches every topic by name", async () => {
	const sentQueries = stubConnectionPool()
	await searchTopics({ userId: "admin-1", isAdmin: true, query: "Agents", limit: 50 })
	const statementText = sentQueries[0]?.text ?? ""
	expect(statementText).not.toContain('"owner_id" = $')
	expect(statementText).not.toContain('"visibility" = $')
})

// the typed characters never act as wildcards
test("a wildcard is escaped", async () => {
	const sentQueries = stubConnectionPool()
	await searchTopics({ userId: null, isAdmin: false, query: "100%", limit: 50 })
	expect(sentQueries[0]?.values[0]).toBe("%100\\%%")
})

// a signed-in user's rows say which topics they subscribe to, and a visitor's say nothing
test("a user's topic rows say whether they subscribe to each topic", async () => {
	// two matching topics, and a subscription to the first
	const createdAt = "2026-01-01T00:00:00Z"
	const topicRows = [
		["topic-1", "Agents", "user-2", "public", createdAt, 7, 3],
		["topic-2", "Agents at work", "user-2", "public", createdAt, 2, 0],
	]
	stubConnectionPool(({ text }) => {
		if (text.includes('from "topics"')) {
			return topicRows
		}
		return text.includes('from "subscriptions"') ? [["topic-1"]] : []
	})

	// the user subscribes to the first topic only, and a visitor's rows leave the subscription out
	const userRows = await searchTopics({ userId: "user-1", isAdmin: false, query: "agents", limit: 50 })
	expect(userRows.map((topicSearchRow) => topicSearchRow.isSubscribed)).toEqual([true, false])
	expect(userRows[0]).toEqual(
		expect.objectContaining({
			kind: "topic",
			name: "Agents",
			path: "/topics/topic-1/agents",
			count: 7,
			subscriberCount: 3,
		}),
	)
	const visitorRows = await searchTopics({ userId: null, isAdmin: false, query: "agents", limit: 50 })
	expect(visitorRows.map((topicSearchRow) => topicSearchRow.isSubscribed)).toEqual([null, null])
})
