// Topic Post write tests: a save settles its body images on its own transaction, and what a delete releases and clears
// before the post's row goes
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { toTopicPostBodyImagePath } from "@carlnotes/contracts/topicPostBodyImages"
import { db } from "@carlnotes/db"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as redis from "@carlnotes/db/redis"
import { deleteTopicPost, saveTopicPost } from "./topicPostWrites"

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

test("a save settles its body images on its own transaction, and a save that loses the version settles none", async () => {
	// a post that shows a kept image and a dropped one, and a save that shows the kept one and a new upload
	const topicPostId = crypto.randomUUID()
	const [keptImageId, droppedImageId, addedImageId] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
	const toImageHtml = (imageIds: string[]): string =>
		imageIds.map((imageId) => `<img src="${toTopicPostBodyImagePath({ topicPostId, imageId })}" />`).join("")
	const topicPost = { id: topicPostId, publishedAt: null, html: toImageHtml([keptImageId, droppedImageId]) }
	const saveOptions = { topicPost, title: "Dialing in", html: toImageHtml([keptImageId, addedImageId]), wordCount: 1 }

	// the transaction, and an update that holds
	let isTransactionOpen = false
	const transactionQueries: string[] = []
	stubConnectionPool(({ text }) => {
		if (isTransactionOpen) {
			transactionQueries.push(text)
		}
		return text.startsWith('update "topic_posts"') ? [[4]] : []
	})
	const transactionSpy = spyOn(db, "transaction").mockImplementation(async (runTransaction) => {
		isTransactionOpen = true
		const result = await runTransaction(db as never)
		isTransactionOpen = false
		return result
	})

	// the update, the added image's cleared deletion, and the dropped image's queued one, all on one transaction
	expect(await saveTopicPost({ ...saveOptions, version: 3 })).toEqual({
		status: "saved",
		version: 4,
		droppedImageIds: [droppedImageId],
	})
	expect(transactionQueries.map((text) => text.split(" ").slice(0, 3).join(" "))).toEqual([
		'update "topic_posts" set',
		'delete from "pending_object_deletions"',
		'insert into "pending_object_deletions"',
	])

	// a save at a stale version writes nothing more and reads the stored version
	transactionSpy.mockRestore()
	const conflictQueries = stubConnectionPool(({ text }) => (text.startsWith("select") ? [[7]] : []))
	expect(await saveTopicPost({ ...saveOptions, version: 2 })).toEqual({ status: "conflict", version: 7 })
	expect(conflictQueries.some(({ text }) => text.includes("pending_object_deletions"))).toBe(false)
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
