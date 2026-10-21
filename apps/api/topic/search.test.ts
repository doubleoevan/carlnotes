// topic search tests: the view rules in the statement for a visitor, a user, and an admin, and the short query
import { afterEach, expect, test } from "bun:test"
import {
	ADMIN_USER_ACCESS_ROW,
	FREE_USER_ACCESS_ROW,
	restoreConnectionPool,
	stubConnectionPool,
} from "@carlnotes/db/connectionPoolStub"
import { searchTopics } from "./search"

// put the pool back after each test
afterEach(restoreConnectionPool)

// a visitor's search names only a public topic with enough findings, and never an owner, a team, or an invite
test("a visitor searches public topics with enough findings alone", async () => {
	// one search, with the statement recorded
	const sentQueries = stubConnectionPool()
	expect(await searchTopics({ userId: null, query: "Agents" })).toEqual([])
	const statementText = sentQueries[0]?.text ?? ""

	// the name match and the shown-findings count, and none of a user's rules
	expect(statementText).toContain('lower("topics"."name") like $1')
	expect(statementText).toContain('(select count(*) from "findings"')
	expect(statementText).not.toContain('"owner_id"')
	expect(statementText).not.toContain('"team_members"')
	expect(statementText).not.toContain('"invites"')
	expect(sentQueries[0]?.values).toEqual(["%agents%", "public", 3, 5])
})

// a user's search also names their own topics, their teams' topics, and the invite topics they are invited to or
// subscribed to, before the limit
test("a user searches the topics the view rules allow, before the limit", async () => {
	// one search as a free user, whose access read comes first
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('"budget_override_cents"') ? [FREE_USER_ACCESS_ROW] : [],
	)
	expect(await searchTopics({ userId: "user-1", query: "Agents" })).toEqual([])
	const statement = sentQueries[1]?.text ?? ""

	// the owner, team, invite, and subscription rules in the one statement
	expect(statement).toContain('"topics"."owner_id" = $')
	expect(statement).toContain('"team_members"')
	expect(statement).toContain('"team_topics"')
	expect(statement).toContain('"invites"')
	expect(statement).toContain('"subscriptions"')
	expect(statement).toContain('"email_verified" = $')

	// the limit after the rules, and the invite visibility among the values
	expect(statement).toMatch(/order by length\("topics"\."name"\) limit \$\d+$/)
	expect(sentQueries[1]?.values).toContain("invite")
})

// an admin may open every topic, so only the name is matched
test("an admin searches every topic by name", async () => {
	// one search as an admin
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('"budget_override_cents"') ? [ADMIN_USER_ACCESS_ROW] : [],
	)
	expect(await searchTopics({ userId: "admin-1", query: "Agents" })).toEqual([])

	// no rule but the name
	const statementText = sentQueries[1]?.text ?? ""
	expect(statementText).not.toContain('"owner_id"')
	expect(statementText).not.toContain('"visibility"')
})

// a query under two characters searches nothing, and the typed characters never act as wildcards
test("a short query sends nothing, and a wildcard is escaped", async () => {
	// a short query sends nothing
	const sentQueries = stubConnectionPool()
	expect(await searchTopics({ userId: null, query: " a " })).toEqual([])
	expect(sentQueries).toHaveLength(0)

	// a wildcard is escaped
	await searchTopics({ userId: null, query: "100%" })
	expect(sentQueries[0]?.values[0]).toBe("%100\\%%")
})
