// subscriber count tests: the recount locks the topic row first, as its own statement
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { updateTopicSubscriberCount } from "./subscriberCounts"

// put the connection pool back after each test
afterEach(() => {
	restoreConnectionPool()
})

// the lock comes before the recount, so the recount's statement starts after every blocked write commits
test("updateTopicSubscriberCount locks the topic row before the recount", async () => {
	const sentQueries = stubConnectionPool()
	await updateTopicSubscriberCount("topic-1")

	// a select for update of the topic row, then the update that stores the count
	expect(sentQueries.map(({ text }) => text.split(" ")[0])).toEqual(["select", "update"])
	expect(sentQueries[0]?.text).toContain('from "topics"')
	expect(sentQueries[0]?.text).toContain("for update")
	expect(sentQueries[0]?.values).toEqual(["topic-1"])
})
