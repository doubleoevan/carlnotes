// removing a Podcast Episode clears the cached unseen Comment Mentions of the users its deleted comments mentioned
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as redis from "@carlnotes/db/redis"
import * as store from "@carlnotes/db/store"
import { removePodcastEpisode } from "./removePodcastEpisode"

// put the connection pool and the spies back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

test("a removed Podcast Episode clears the cached reads of the users its comments mentioned", async () => {
	// the published Podcast Episode with no script and no image, and the two users its comments mention
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "comment_mentions"')) {
			return [["user-ava"], ["user-ben"]]
		}
		return text.startsWith("select") && text.includes('"status"') ? [["episode-1", "published", null, null]] : []
	})

	// no key is deleted from Redis and no object from storage
	const deleteRedisKeysSpy = spyOn(redis, "deleteRedisKeys").mockResolvedValue(0)
	spyOn(store, "deleteStoredObjects").mockResolvedValue()
	expect(await removePodcastEpisode("episode-1")).toBe(true)

	// the mentioned users are read before the comments are deleted, and their cached reads are cleared
	const queryTexts = sentQueries.map((sentQuery) => sentQuery.text)
	const mentionReadIndex = queryTexts.findIndex((queryText) => queryText.includes('from "comment_mentions"'))
	const commentDeleteIndex = queryTexts.findIndex((queryText) => queryText.startsWith('delete from "comments"'))
	expect(mentionReadIndex).toBeGreaterThan(-1)
	expect(mentionReadIndex).toBeLessThan(commentDeleteIndex)
	expect(deleteRedisKeysSpy).toHaveBeenCalledWith(
		"unseen-comment-mentions:user-ava",
		"unseen-comment-mentions:user-ben",
	)
})
