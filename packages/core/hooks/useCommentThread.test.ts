// a reload's first page joins the comments already loaded
import { expect, test } from "bun:test"
import { type Comment, type CommentThreadResponse, EMPTY_COMMENT_THREAD } from "@carlnotes/contracts/social"
import { toTestComment, toTestCommentReply } from "@carlnotes/contracts/socialTestFixtures"
import { isDetachedCommentPage, toReloadedComments } from "./useCommentThread"

// comments with the given ids
function toComments(...ids: string[]): Comment[] {
	return ids.map((id) => toTestComment({ id, replies: [], replyCount: 0 }))
}

// a first page of the given comments, with or without a next page
function toCommentPage(comments: Comment[], nextCursor: string | null = "next-page"): CommentThreadResponse {
	return { ...EMPTY_COMMENT_THREAD, comments, nextCursor }
}

// the ids of the given comments, in order
function toIds(comments: Comment[]): string[] {
	return comments.map((comment) => comment.id)
}

test("a reload keeps the older pages behind its first page, with a new comment in front", () => {
	const reloadedComments = toReloadedComments(
		toComments("c-1", "c-2", "c-3", "c-4"),
		toCommentPage(toComments("c-new", "c-1")),
	)
	expect(toIds(reloadedComments)).toEqual(["c-new", "c-1", "c-2", "c-3", "c-4"])
})

test("a reload drops a comment its page passed over, which means the comment is gone", () => {
	const reloadedComments = toReloadedComments(
		toComments("c-1", "c-2", "c-3", "c-4"),
		toCommentPage(toComments("c-1", "c-3")),
	)
	expect(toIds(reloadedComments)).toEqual(["c-1", "c-3", "c-4"])
})

test("a reload with no next page is the whole thread, so no older comment stays", () => {
	const reloadedComments = toReloadedComments(toComments("c-1", "c-2"), toCommentPage(toComments("c-1"), null))
	expect(toIds(reloadedComments)).toEqual(["c-1"])
})

test("a first page with more behind it and no comment in common is detached from the loaded ones", () => {
	expect(isDetachedCommentPage([], toCommentPage(toComments("c-new")))).toBe(true)
	expect(isDetachedCommentPage(toComments("c-1"), toCommentPage(toComments("c-new")))).toBe(true)
	expect(isDetachedCommentPage(toComments("c-1"), toCommentPage(toComments("c-new", "c-1")))).toBe(false)
	expect(isDetachedCommentPage(toComments("c-1"), toCommentPage(toComments("c-new"), null))).toBe(false)
})

test("a reload takes the page's fields and keeps the replies loaded past the page's first few", () => {
	// the thread holds two replies, and the page holds the first with new words
	const firstReply = toTestCommentReply({ id: "reply-1", body: "Old words" })
	const secondReply = toTestCommentReply({ id: "reply-2" })
	const loadedComment = toTestComment({
		id: "c-1",
		body: "Old body",
		replies: [firstReply, secondReply],
		replyCount: 2,
	})
	const reloadedReply = toTestCommentReply({ id: "reply-1", body: "New words" })
	const pageComment = toTestComment({ id: "c-1", body: "New body", replies: [reloadedReply], replyCount: 3 })

	// the page's fields win, and the second reply stays
	const [reloadedComment] = toReloadedComments([loadedComment], toCommentPage([pageComment]))
	expect(reloadedComment?.body).toBe("New body")
	expect(reloadedComment?.replyCount).toBe(3)
	expect(reloadedComment?.replies.map((reply) => [reply.id, reply.body])).toEqual([
		["reply-1", "New words"],
		["reply-2", secondReply.body],
	])
})

test("a reload takes the page's replies if the thread holds no more of them than the page", () => {
	const pageComment = toTestComment({ id: "c-1", replies: [toTestCommentReply({ id: "reply-1" })], replyCount: 1 })
	const [reloadedComment] = toReloadedComments(toComments("c-1"), toCommentPage([pageComment]))
	expect(reloadedComment).toBe(pageComment)
})
