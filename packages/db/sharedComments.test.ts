// the shared comments' writes, against a stubbed connection pool
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "./connectionPoolStub"
import {
	considerCommentLinks,
	loadSharedCommentTexts,
	loadWaitingCommentLinkUrls,
	loadWaitingSharedComments,
	releasePodcastEpisodeSharedComments,
} from "./sharedComments"

afterEach(() => {
	restoreConnectionPool()
})

test("a release of named comments gives back only those", async () => {
	const queries = stubConnectionPool(() => [])
	await releasePodcastEpisodeSharedComments("episode-1", ["comment-1"])
	expect(queries[0]?.values).toContain("comment-1")
	expect(queries[0]?.text).toContain('"comments"."id" in')
})

test("a failed Podcast Episode gives its shared comments back", async () => {
	const queries = stubConnectionPool(() => [])
	await releasePodcastEpisodeSharedComments("episode-1")

	// one update clears the Podcast Episode's mark on its comments alone
	expect(queries).toHaveLength(1)
	expect(queries[0]?.text).toContain('update "comments" set "aired_podcast_episode_id" = $1')
	expect(queries[0]?.text).toContain('where "comments"."aired_podcast_episode_id" = $3')
	expect(queries[0]?.values[0]).toBeNull()
	expect(queries[0]?.values[2]).toBe("episode-1")
})

test("considering links marks the Topic's waiting rows for those urls, and none for no url", async () => {
	const queries = stubConnectionPool(() => [])
	await considerCommentLinks("topic-1", [])
	expect(queries).toHaveLength(0)

	// the update names the topic and the urls, and only rows no Scan considered yet
	await considerCommentLinks("topic-1", ["https://example.org/a"])
	expect(queries).toHaveLength(1)
	expect(queries[0]?.text).toContain('"comment_links"."considered_at" is null')
	expect(queries[0]?.values).toContain("https://example.org/a")
})

test("the pending links read is distinct by url for one Topic", async () => {
	const queries = stubConnectionPool(() => [["https://example.org/a"]])
	expect(await loadWaitingCommentLinkUrls("topic-1")).toEqual(["https://example.org/a"])
	expect(queries[0]?.text).toContain('select distinct "comment_links"."url" from "comment_links"')
	expect(queries[0]?.values).toEqual(["topic-1"])
})

test("every read of the shared comments leaves out a rated down Finding, an admin block, and a block with the owner", async () => {
	const queries = stubConnectionPool(() => [])
	await Promise.all([
		loadSharedCommentTexts("topic-1"),
		loadWaitingSharedComments("topic-1"),
		loadWaitingCommentLinkUrls("topic-1"),
	])
	expect(queries).toHaveLength(3)
	for (const { text } of queries) {
		expect(text).toContain("is distinct from 'down'")
		expect(text).toContain('"admin_blocked_at" is not null')
		expect(text).toContain('from "user_blocks"')
	}
})
