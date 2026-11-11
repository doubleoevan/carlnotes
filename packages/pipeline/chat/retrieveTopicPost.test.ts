// Topic Post chat context tests: the post's text with its shared Comments the reader may see, and no context for a
// draft, a post that is gone, or a post of another topic
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { loadTopicPostChatContext } from "./retrieveTopicPost"

// put back the connection pool after each test
afterEach(() => {
	restoreConnectionPool()
})

// the question's topic, post, and reader
const QUESTION = { topicId: "topic-1", topicPostId: "post-1", userId: "reader-1" }

test("the context holds the post's text and each shared Comment under its author's username", async () => {
	// the post's row, then its shared Comments, one by an account that closed
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "topic_posts"')) {
			return [["Dialing in", "<h1>Start</h1><p>Start light.</p>"]]
		}
		return [
			["roastfan", "The pancake part is right."],
			[null, "a Comment with nobody to credit"],
		]
	})
	expect(await loadTopicPostChatContext(QUESTION)).toEqual({
		topicPostId: "post-1",
		title: "Dialing in",
		text: "Start Start light.",
		comments: [{ username: "roastfan", body: "The pancake part is right." }],
	})

	// the post is read by its id on this topic, published
	const topicPostQuery = sentQueries.find((sentQuery) => sentQuery.text.includes('from "topic_posts"'))
	expect(topicPostQuery?.values).toEqual(expect.arrayContaining(["post-1", "topic-1"]))
	expect(topicPostQuery?.text).toContain('"topic_posts"."published_at" is not null')

	// an unshared Comment, one by an author under an admin block, and one by an author in a block with the reader are
	// each left out by the read itself
	const commentQuery = sentQueries.find((sentQuery) => sentQuery.text.includes('from "comments"'))
	expect(commentQuery?.text).toContain('"comments"."shared_with_podcast_topic_id" is not null')
	expect(commentQuery?.text).toContain('"admin_blocked_at"')
	expect(commentQuery?.text).toContain('"user_blocks"')
	expect(commentQuery?.values).toContain("reader-1")
})

test("a draft, a post that is gone, and a post of another topic have no context", async () => {
	stubConnectionPool()
	expect(await loadTopicPostChatContext(QUESTION)).toBeNull()
})
