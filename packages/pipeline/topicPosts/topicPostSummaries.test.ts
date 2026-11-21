// stored Topic Post summary tests: a published post's summary is written on its author's key and kept while its words
// are the ones summarized, which clears its topic's visitor pages, and a draft or a missing post has none written
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as visitorPageCaches from "@carlnotes/db/visitorPageCaches"
import * as litellm from "@carlnotes/models/litellm"
import * as summarizeTopicPostModule from "./summarizeTopicPost"
import { writeStoredTopicPostSummary } from "./topicPostSummaries"

// put back the connection pool and the module mocks after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

test("a published post's summary is written on its author's key and stored on the post", async () => {
	// the post's title, body, author, and publish time, the author's key, and the summary the model writes
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.startsWith("select")) {
			return [["Light Roasts", "<p>Start light.</p>", "author-1", new Date()]]
		}
		return text.startsWith('update "topic_posts"') ? [["topic-1"]] : []
	})

	// the visitor pages' clear, the author's key, and the model's summary
	const clearVisitorPagesSpy = spyOn(visitorPageCaches, "clearVisitorPagesOfTopic").mockResolvedValue()
	spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockResolvedValue("author-key")
	const summarizeSpy = spyOn(summarizeTopicPostModule, "summarizeTopicPost").mockResolvedValue({
		summary: "A year of roasts.",
		costDollars: 0.0004,
	})
	await writeStoredTopicPostSummary("post-1")

	// the call reads the post's own words on the author's key, and the summary is the one stored
	expect(summarizeSpy).toHaveBeenCalledWith({
		title: "Light Roasts",
		html: "<p>Start light.</p>",
		litellmApiKey: "author-key",
	})
	const updateQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('update "topic_posts"'))
	expect(updateQuery?.values).toContain("A year of roasts.")

	// the summary is kept only while the post's title and body are the ones summarized
	expect(updateQuery?.text).toContain('case when "topic_posts"."title" = $')
	expect(updateQuery?.values).toEqual(expect.arrayContaining(["Light Roasts", "<p>Start light.</p>"]))

	// the call's cost adds to what the post's summaries cost before it
	expect(updateQuery?.text).toContain('"cost" = "topic_posts"."cost" +')
	expect(updateQuery?.values).toContain(0.0004)

	// the topic's visitor pages that show the summary leave the cache
	expect(clearVisitorPagesSpy.mock.calls).toEqual([["topic-1"]])
})

test("a draft and a missing post have no summary written", async () => {
	const summarizeSpy = spyOn(summarizeTopicPostModule, "summarizeTopicPost")

	// a draft has no publish time
	const sentQueries = stubConnectionPool(() => [["Draft", "<p>Not yet.</p>", "author-1", null]])
	await writeStoredTopicPostSummary("post-1")
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith("update"))).toBe(false)

	// a deleted post has no row
	stubConnectionPool()
	await writeStoredTopicPostSummary("post-1")
	expect(summarizeSpy).not.toHaveBeenCalled()
})
