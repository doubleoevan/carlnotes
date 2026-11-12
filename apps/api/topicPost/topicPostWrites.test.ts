// Topic Post write tests: what a delete releases and clears before the post's row goes
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as redis from "@carlnotes/db/redis"
import { deleteTopicPost } from "./topicPostWrites"

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

test("a deleted post leaves the home's pins and its author's profile pins before its row goes", async () => {
	// the post holds the second home position and the first of its author's pins, and a write returns no row
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.startsWith('select "home_order" from "topic_posts"')) {
			return [[2]]
		}
		if (text.startsWith('select "author_user_id" from "topic_posts"')) {
			return [["member-1"]]
		}

		// the post's place among its author's pins
		return text.startsWith('select "profile_order" from "topic_posts"') ? [[1]] : []
	})
	await deleteTopicPost("post-1")

	// each order is cleared and its gap closed, then the row is deleted
	const writes = sentQueries.map(({ text }) => text).filter((text) => /^(update|delete)/.test(text))
	expect(writes.map((text) => text.split(",")[0])).toEqual([
		'update "topic_posts" set "home_order" = $1',
		'update "topic_posts" set "home_order" = "topic_posts"."home_order" - 1',
		'update "topic_posts" set "profile_order" = $1',
		'update "topic_posts" set "profile_order" = "topic_posts"."profile_order" - 1',
		'delete from "topic_posts" where "topic_posts"."id" = $1',
	])
})

test("a deleted post clears the cached unseen Comment Mentions of the users its Comments mention", async () => {
	// the one user the post's Comments mention, read before the post's row is deleted
	const sentQueries = stubConnectionPool(({ text }) => (text.includes('from "comment_mentions"') ? [["user-ava"]] : []))
	const deleteRedisKeysSpy = spyOn(redis, "deleteRedisKeys").mockResolvedValue(0)
	await deleteTopicPost("post-1")

	// the read names the post, and the mentioned user's cached read is cleared
	const queryTexts = sentQueries.map(({ text }) => text)
	const mentionReadIndex = queryTexts.findIndex((text) => text.includes('from "comment_mentions"'))
	expect(sentQueries[mentionReadIndex]?.values).toEqual(["post-1"])
	expect(mentionReadIndex).toBeLessThan(queryTexts.findIndex((text) => text.startsWith('delete from "topic_posts"')))
	expect(deleteRedisKeysSpy).toHaveBeenCalledWith("unseen-comment-mentions:user-ava")
})
