// the topic list reads shared Sources alone
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { listTopics } from "./topicResults"

// put the connection pool back after each test
afterEach(() => {
	restoreConnectionPool()
})

test("a listed topic's Sources leave out personal Sources", async () => {
	// one public topic, and the shared Source that the filtered read returns
	const sentQueries = stubConnectionPool((query) => {
		if (query.text.includes('from "sources"')) {
			return [["source-1", "topic-1", "rss", { url: "https://example.test/feed" }]]
		}
		return [["topic-1", "Topic", "Prompt", "public", "daily", 3]]
	})
	const page = await listTopics({ kind: "visitor", clientName: "test" }, null, null)

	// the read names both personal kinds in its filter, for every caller
	const sourcesQuery = sentQueries.find((query) => query.text.includes('from "sources"'))
	expect(sourcesQuery?.text).toContain('"sources"."kind" not in')
	expect(sourcesQuery?.values).toEqual(expect.arrayContaining(["ai_agent", "email"]))
	expect(page.items[0]?.sources.map((source) => source.sourceId)).toEqual(["source-1"])
})
