// stored Topic Post summary tests: a published post's summary is written on its author's key and kept, a draft or
// a missing post has none written, and a text already summarized at its version is not summarized again
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
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
	const sentQueries = stubConnectionPool(({ text }) =>
		text.startsWith("select") ? [["Light Roasts", "<p>Start light.</p>", 4, "author-1", new Date()]] : [],
	)
	spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockResolvedValue("author-key")
	const summarizeSpy = spyOn(summarizeTopicPostModule, "summarizeTopicPost").mockResolvedValue({
		summary: "A year of roasts.",
		costDollars: 0.0004,
	})
	expect(await writeStoredTopicPostSummary("post-1")).toBe(4)

	// the call reads the post's own words on the author's key, and the summary is the one stored
	expect(summarizeSpy).toHaveBeenCalledWith({
		title: "Light Roasts",
		html: "<p>Start light.</p>",
		litellmApiKey: "author-key",
	})
	const updateQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('update "topic_posts"'))
	expect(updateQuery?.values).toContain("A year of roasts.")

	// the call's cost adds to what the post's summaries cost before it
	expect(updateQuery?.text).toContain('"cost" = "topic_posts"."cost" +')
	expect(updateQuery?.values).toContain(0.0004)
})

test("a draft and a missing post have no summary written", async () => {
	const summarizeSpy = spyOn(summarizeTopicPostModule, "summarizeTopicPost")

	// a draft has no publish time
	const sentQueries = stubConnectionPool(() => [["Draft", "<p>Not yet.</p>", 1, "author-1", null]])
	expect(await writeStoredTopicPostSummary("post-1")).toBeNull()
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith("update"))).toBe(false)

	// a deleted post has no row
	stubConnectionPool()
	expect(await writeStoredTopicPostSummary("post-1")).toBeNull()
	expect(summarizeSpy).not.toHaveBeenCalled()
})

test("a post still at the version its summary was written from keeps that summary, and an edited one gets a new one", async () => {
	// the post stands at its fourth version
	const sentQueries = stubConnectionPool(({ text }) =>
		text.startsWith("select") ? [["Light Roasts", "<p>Start light.</p>", 4, "author-1", new Date()]] : [],
	)
	spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockResolvedValue("author-key")
	const summarizeSpy = spyOn(summarizeTopicPostModule, "summarizeTopicPost").mockResolvedValue({
		summary: "A year of roasts.",
		costDollars: 0.0004,
	})

	// a summary written from the fourth version stands, with no model call and no write
	expect(await writeStoredTopicPostSummary("post-1", 4)).toBe(4)
	expect(summarizeSpy).not.toHaveBeenCalled()
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith("update"))).toBe(false)

	// a summary written from the third version is written again from the fourth
	expect(await writeStoredTopicPostSummary("post-1", 3)).toBe(4)
	expect(summarizeSpy).toHaveBeenCalledTimes(1)
})
