// Topic Post viewer counts tests: the counts read and the view count read the post's access columns alone, never its
// body
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { loadTopicPostAccessRow } from "./topicPosts"
import { loadTopicPostViewerCounts } from "./topicPostViewerCounts"

// put the connection pool back after each test
afterEach(() => {
	restoreConnectionPool()
})

test("the counts read and the view count's access row select no body, and a missing post has no counts", async () => {
	const sentQueries = stubConnectionPool(() => [])
	expect(await loadTopicPostViewerCounts(null, "post-1")).toBeNull()
	expect(await loadTopicPostAccessRow("post-1")).toBeNull()

	// one read each, of the post's access columns and its Topic
	expect(sentQueries).toHaveLength(2)
	for (const sentQuery of sentQueries) {
		expect(sentQuery.text).toContain('"topic_posts"."viewer_count"')
		expect(sentQuery.text).not.toContain('"topic_posts"."html"')
	}
})
