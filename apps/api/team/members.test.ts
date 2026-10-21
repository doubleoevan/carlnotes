// team membership tests: the subscriptions a leaving or deleting member keeps on the team's topics
import { afterEach, expect, test } from "bun:test"
import { db } from "@carlnotes/db"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { deactivateTeamTopicSubscriptions } from "./members"

// put the connection pool's own query back after each test
afterEach(() => {
	restoreConnectionPool()
})

// the topic read returns the team's one owned topic, and every other query returns no rows
test("deactivateTeamTopicSubscriptions leaves out the topics the member owns themself", async () => {
	const sentQueries = stubConnectionPool(({ text }) =>
		text.startsWith("select") && text.includes('from "topics"') ? [["topic-1", "weekly"]] : [],
	)
	await db.transaction((transaction) => deactivateTeamTopicSubscriptions(transaction, "team-1", ["owner-1"]))

	// the deactivation leaves out the member's own topics, beside the ones their other teams reach or own
	const deactivation = sentQueries.find(({ text }) => text.startsWith('update "subscriptions"'))
	expect(deactivation?.text).toContain('"topics"."owner_id" = $')
	expect(deactivation?.values).toContain("owner-1")
})
