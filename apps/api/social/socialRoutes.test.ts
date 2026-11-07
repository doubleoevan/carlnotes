// reaction and comment route tests: who may write, which bodies parse, the status each write result maps to, and
// what the reads pass on
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { EMPTY_REACTION_SUMMARY } from "@carlnotes/contracts/social"
import { toTestComment, toTestCommentThread } from "@carlnotes/contracts/socialTestFixtures"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { Hono } from "hono"
import type { AppEnv } from "../currentUser"
import { toJsonRequest, toSignedInApp } from "../testSession"
import * as commentRows from "./commentRows"
import * as comments from "./comments"
import { commentsRoute } from "./commentsRoute"
import * as reactions from "./reactions"
import { reactionsRoute } from "./reactionsRoute"
import * as socialTargets from "./socialTargets"
import { EDITOR_SHARED_COMMENT_SLOTS, RESOLVED_FINDING } from "./socialTargetTestFixtures"

// a Finding as a request names it, a save and a post on it, and a share of a comment
const TARGET = { kind: "finding", id: "finding-1" }
const SAVE_BODY = { target: TARGET, reactionType: "like" }
const POST_BODY = { target: TARGET, body: "a comment" }
const SHARE_BODY = { isSharedWithPodcast: true }

// put the spies and the connection pool back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
})

// each request signs in as its own user, so no case meets another's rate limit count
let signedInUserCount = 0
function toNextUserId(): string {
	signedInUserCount += 1
	return `route-test-user-${signedInUserCount}`
}

test("a visitor's write is a 401 before any query", async () => {
	const sentQueries = stubConnectionPool()
	const visitorReactions = new Hono<AppEnv>().route("/", reactionsRoute)
	const visitorComments = new Hono<AppEnv>().route("/", commentsRoute)

	// a save, a post, an edit, a delete, a share, and the mention suggestions all need an account
	const responses = await Promise.all([
		visitorReactions.request("/reactions", toJsonRequest(SAVE_BODY, "PUT")),
		visitorComments.request("/comments", toJsonRequest(POST_BODY)),
		visitorComments.request("/comments/comment-1", toJsonRequest({ body: "new" }, "PATCH")),
		visitorComments.request("/comments/comment-1", { method: "DELETE" }),
		visitorComments.request("/comments/comment-1/share", toJsonRequest(SHARE_BODY, "PUT")),
		visitorComments.request("/usernames?prefix=roa"),
	])
	expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401, 401, 401])
	expect(sentQueries).toHaveLength(0)
})

test("a body outside the payload is a 400 before any write", async () => {
	const saveReaction = spyOn(reactions, "saveReaction")
	const postComment = spyOn(comments, "postComment")
	const shareComment = spyOn(comments, "shareComment")
	const signedInReactions = toSignedInApp(reactionsRoute, toNextUserId())
	const signedInComments = toSignedInApp(commentsRoute, toNextUserId())

	// an unknown type, an unknown kind, a body past 2,000, a chapter before the first, an empty parent, and a share
	// that is no boolean
	const responses = await Promise.all([
		signedInReactions.request("/reactions", toJsonRequest({ ...SAVE_BODY, reactionType: "dislike" }, "PUT")),
		signedInReactions.request(
			"/reactions",
			toJsonRequest({ ...SAVE_BODY, target: { kind: "team", id: "team-1" } }, "PUT"),
		),
		signedInComments.request("/comments", toJsonRequest({ ...POST_BODY, body: "x".repeat(2001) })),
		signedInComments.request("/comments", toJsonRequest({ ...POST_BODY, chapterPosition: -1 })),
		signedInComments.request("/comments", toJsonRequest({ ...POST_BODY, parentCommentId: "" })),
		signedInComments.request("/comments/comment-1/share", toJsonRequest({ isSharedWithPodcast: "yes" }, "PUT")),
	])
	expect(responses.map((response) => response.status)).toEqual([400, 400, 400, 400, 400, 400])
	expect(saveReaction).not.toHaveBeenCalled()
	expect(postComment).not.toHaveBeenCalled()
	expect(shareComment).not.toHaveBeenCalled()
})

test.each([
	[{ status: "saved", summary: EMPTY_REACTION_SUMMARY } as const, 200],
	[{ status: "notFound" } as const, 404],
	[{ status: "limitReached" } as const, 429],
])("a save that ended %j is a %i", async (reactionWriteResult, status) => {
	spyOn(reactions, "saveReaction").mockResolvedValue(reactionWriteResult)
	const response = await toSignedInApp(reactionsRoute, toNextUserId()).request(
		"/reactions",
		toJsonRequest(SAVE_BODY, "PUT"),
	)
	expect(response.status).toBe(status)

	// a save returns the summary as it stands now
	if (reactionWriteResult.status === "saved") {
		expect(await response.json()).toEqual({ summary: EMPTY_REACTION_SUMMARY })
	}
	expect(reactions.saveReaction).toHaveBeenCalledWith(expect.objectContaining({ payload: SAVE_BODY }))
})

test("a save with no type passes the removal on, and a comment is a social target", async () => {
	const saveReaction = spyOn(reactions, "saveReaction").mockResolvedValue({
		status: "saved",
		summary: EMPTY_REACTION_SUMMARY,
	})
	const removalBody = { target: { kind: "comment", id: "comment-1" }, reactionType: null }
	const response = await toSignedInApp(reactionsRoute, toNextUserId()).request(
		"/reactions",
		toJsonRequest(removalBody, "PUT"),
	)
	expect(response.status).toBe(200)
	expect(saveReaction).toHaveBeenCalledWith(expect.objectContaining({ payload: removalBody }))
})

test("an edit past its edit time is a 409, and a delete returns the week's count", async () => {
	spyOn(comments, "editComment").mockResolvedValue({ status: "locked" })
	spyOn(comments, "deleteComment").mockResolvedValue({
		status: "deleted",
		weekCommentCount: 2,
		sharedCommentSlots: null,
	})

	// the same comment edited and deleted
	const signedInComments = toSignedInApp(commentsRoute, toNextUserId())
	const editResponse = await signedInComments.request("/comments/comment-1", toJsonRequest({ body: "new" }, "PATCH"))
	const deleteResponse = await signedInComments.request("/comments/comment-1", { method: "DELETE" })
	expect([editResponse.status, deleteResponse.status]).toEqual([409, 200])
	expect(await deleteResponse.json()).toEqual({ ok: true, weekCommentCount: 2, sharedCommentSlots: null })
})

test.each([
	[{ status: "saved", comment: toTestComment(), sharedCommentSlots: EDITOR_SHARED_COMMENT_SLOTS } as const, 200],
	[{ status: "notFound" } as const, 404],
	[{ status: "limitReached" } as const, 429],
	[{ status: "invalidChapter" } as const, 400],
	[{ status: "objectionable", category: "harassment" } as const, 422],
])("a post that ended %j is a %i", async (commentWriteResult, status) => {
	spyOn(comments, "postComment").mockResolvedValue(commentWriteResult)
	const response = await toSignedInApp(commentsRoute, toNextUserId()).request("/comments", toJsonRequest(POST_BODY))
	expect(response.status).toBe(status)

	// a post returns the comment with the shared comment slots
	if (commentWriteResult.status === "saved") {
		expect(await response.json()).toEqual({ comment: toTestComment(), sharedCommentSlots: EDITOR_SHARED_COMMENT_SLOTS })
	}
})

test("a reply passes its parent on", async () => {
	const postComment = spyOn(comments, "postComment").mockResolvedValue({ status: "notFound" })
	await toSignedInApp(commentsRoute, toNextUserId()).request(
		"/comments",
		toJsonRequest({ ...POST_BODY, parentCommentId: "comment-1" }),
	)
	expect(postComment).toHaveBeenCalledWith(
		expect.objectContaining({ payload: { target: TARGET, body: "a comment", parentCommentId: "comment-1" } }),
	)
})

test.each([
	[{ status: "saved", isSharedWithPodcast: true, sharedCommentSlots: EDITOR_SHARED_COMMENT_SLOTS } as const, 200],
	[{ status: "noFreeSharedCommentSlot" } as const, 409],
	[{ status: "notFound" } as const, 404],
])("a share that ended %j is a %i", async (commentShareResult, status) => {
	const shareComment = spyOn(comments, "shareComment").mockResolvedValue(commentShareResult)
	const response = await toSignedInApp(commentsRoute, toNextUserId()).request(
		"/comments/comment-1/share",
		toJsonRequest(SHARE_BODY, "PUT"),
	)
	expect(response.status).toBe(status)
	expect(shareComment).toHaveBeenCalledWith(
		expect.objectContaining({ commentId: "comment-1", isSharedWithPodcast: true }),
	)

	// a share returns whether the comment is shared now, with the Topic's shared comment slots
	if (commentShareResult.status === "saved") {
		expect(await response.json()).toEqual({
			isSharedWithPodcast: true,
			sharedCommentSlots: EDITOR_SHARED_COMMENT_SLOTS,
		})
	}
})

test("a read of a social target the caller cannot open is a 404", async () => {
	spyOn(socialTargets, "resolveSocialTarget").mockResolvedValue(null)
	const summaryResponse = await toSignedInApp(reactionsRoute, toNextUserId()).request(
		"/reactions/summary?kind=topic&id=topic-1",
	)
	const signedInComments = toSignedInApp(commentsRoute, toNextUserId())
	const commentsResponse = await signedInComments.request("/comments?kind=topic&id=topic-1")
	const repliesResponse = await signedInComments.request("/comments/comment-1/replies")
	expect([summaryResponse.status, commentsResponse.status, repliesResponse.status]).toEqual([404, 404, 404])

	// a missing Topic has no shared comments
	stubConnectionPool()
	expect((await signedInComments.request("/topics/topic-1/shared-comments")).status).toBe(404)
})

test("a thread read names a kind a comment hangs on, and a summary read any social target", async () => {
	const signedInComments = toSignedInApp(commentsRoute, toNextUserId())
	expect((await signedInComments.request("/comments?kind=team&id=team-1")).status).toBe(400)
	expect((await signedInComments.request("/comments?kind=comment&id=comment-1")).status).toBe(400)

	// a comment's own summary resolves the comment as a social target
	const resolveSocialTarget = spyOn(socialTargets, "resolveSocialTarget").mockResolvedValue(null)
	await toSignedInApp(reactionsRoute, toNextUserId()).request("/reactions/summary?kind=comment&id=comment-1")
	expect(resolveSocialTarget).toHaveBeenCalledWith(expect.any(String), { kind: "comment", id: "comment-1" })
})

test("a thread read passes the reader, the target, its Topic, and the cursor on, and returns the page", async () => {
	spyOn(socialTargets, "resolveSocialTarget").mockResolvedValue(RESOLVED_FINDING)
	const reader = { userId: "user-1", canModerate: false, canShare: true }
	spyOn(socialTargets, "toSocialReader").mockResolvedValue(reader)
	const loadCommentPage = spyOn(commentRows, "loadCommentPage").mockResolvedValue(toTestCommentThread())
	const response = await toSignedInApp(commentsRoute, "user-1").request(
		"/comments?kind=finding&id=finding-1&cursor=123_abc",
	)
	expect(await response.json()).toEqual(JSON.parse(JSON.stringify(toTestCommentThread())))
	expect(loadCommentPage).toHaveBeenCalledWith({
		reader,
		target: { kind: "finding", id: "finding-1" },
		topic: RESOLVED_FINDING.topic,
		cursor: "123_abc",
	})
})

test("the mention suggestions return ids, usernames, and avatars, and nothing for a prefix of only symbols", async () => {
	// one matching user row: id, username, avatar source, and avatar key
	const sentQueries = stubConnectionPool(() => [["user-2", "RoastFan", "generated", null]])
	const signedInComments = toSignedInApp(commentsRoute, toNextUserId())
	const response = await signedInComments.request("/usernames?prefix=Roa")
	expect(await response.json()).toEqual({
		users: [{ userId: "user-2", username: "RoastFan", avatarSource: "generated", avatarVersion: null }],
	})

	// the one query matches the normalized prefix, leaves the user out, and returns eight at most
	expect(sentQueries).toHaveLength(1)
	expect(sentQueries[0]?.values).toContain("roa%")
	expect(sentQueries[0]?.values).toContain(8)
	expect(await (await signedInComments.request("/usernames?prefix=%25%25")).json()).toEqual({ users: [] })
	expect(sentQueries).toHaveLength(1)
})
