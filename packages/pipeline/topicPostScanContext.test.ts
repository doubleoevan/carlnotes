// scan context tests for Topic Posts: a review reads each published post inside the context under its title, a long
// post is cut and marked, a draft is never read, and a search reads none
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { buildTopicScanContext } from "./attach"

// put the connection pool back after each test
afterEach(() => {
	restoreConnectionPool()
})

// the Topic's name and prompt, no attachment, and the given published posts' titles and bodies
function stubTopicPosts(topicPostRows: [string, string][]): ReturnType<typeof stubConnectionPool> {
	return stubConnectionPool(({ text }) => {
		if (text.includes('from "topic_posts"')) {
			return topicPostRows
		}
		return text.includes('from "topics"') ? [["Coffee", "Roasts worth the trip."]] : []
	})
}

test("a review reads a published post under its title, after the topic's prompt", async () => {
	const sentQueries = stubTopicPosts([["Light\nRoasts", "<h1>Start light.</h1><p>Stay curious.</p>"]])
	const topicScanContext = await buildTopicScanContext({ topicId: "topic-1", purpose: "review" })

	// the post's title on one line, then its text with no markup
	expect(topicScanContext.context).toBe(
		"Roasts worth the trip.\n\n[topic post: Light Roasts]\nStart light. Stay curious.",
	)

	// the read keeps published posts alone, newest first
	const topicPostQuery = sentQueries.find((sentQuery) => sentQuery.text.includes('from "topic_posts"'))
	expect(topicPostQuery?.text).toContain('"topic_posts"."published_at" is not null')
	expect(topicPostQuery?.text).toContain('order by "topic_posts"."published_at" desc')
})

test("a long post is cut at the extract length, and the cut is marked", async () => {
	stubTopicPosts([["Long", `<p>${"word ".repeat(3000)}</p>`]])
	const { context } = await buildTopicScanContext({ topicId: "topic-1", purpose: "review" })
	expect(context).toContain("[The post is cut here. It runs 14,999 characters and only the first 8,000 are included.]")
	expect(context.length).toBeLessThan(8400)
})

test("a search reads no Topic Post", async () => {
	const sentQueries = stubTopicPosts([["Light Roasts", "<p>Start light.</p>"]])
	const { context } = await buildTopicScanContext({ topicId: "topic-1", purpose: "search" })
	expect(context).toBe("Roasts worth the trip.")
	expect(sentQueries.some((sentQuery) => sentQuery.text.includes('from "topic_posts"'))).toBe(false)
})
