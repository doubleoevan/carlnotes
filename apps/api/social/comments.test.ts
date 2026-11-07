// comment write tests: who may post, a reply's parent, the daily count, the chapter check, the classification, the
// editor's share with Carl, the delete, and the events
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import type { CommentTarget, PostCommentPayload } from "@carlnotes/contracts/social"
import {
	FREE_USER_ACCESS_ROW,
	restoreConnectionPool,
	stubConnectionPool,
	toTableRow,
} from "@carlnotes/db/connectionPoolStub"
import { comments } from "@carlnotes/db/schema/social"
import * as sharedComments from "@carlnotes/db/sharedComments"
import * as socialLimits from "@carlnotes/db/socialLimits"
import * as analytics from "@carlnotes/server/analytics"
import { TEST_ANALYTICS_PROPERTIES } from "../analyticsTestFixtures"
import * as authorization from "../authorization"
import * as moderation from "../moderation"
import * as commentRows from "./commentRows"
import { deleteComment, editComment, postComment, shareComment } from "./comments"
import * as reactionRows from "./reactionRows"
import type { SocialReader } from "./socialRows"
import * as socialTargets from "./socialTargets"
import { EDITOR_SHARED_COMMENT_SLOTS, RESOLVED_PODCAST_EPISODE } from "./socialTargetTestFixtures"

// a public Topic's Podcast Episode, as a post names it
const PODCAST_EPISODE_TARGET: CommentTarget = { kind: "podcastEpisode", id: "episode-1" }

// a reader who may neither moderate nor share
const PLAIN_READER: SocialReader = { userId: "user-1", canModerate: false, canShare: false }

// the collaborators every case spies on: the daily count, the classification, the share, the shared comment slots, and
// the event
let countSocialWriteToday: ReturnType<typeof spyOn<typeof socialLimits, "countSocialWriteToday">>
let toObjectionableCategory: ReturnType<typeof spyOn<typeof moderation, "toObjectionableCategory">>
let shareCommentInFreeSharedCommentSlot: ReturnType<
	typeof spyOn<typeof sharedComments, "shareCommentInFreeSharedCommentSlot">
>
let toSocialReader: ReturnType<typeof spyOn<typeof socialTargets, "toSocialReader">>
let trackEvent: ReturnType<typeof spyOn<typeof analytics, "trackEvent">>

// resolve the Podcast Episode, accept the count, find the body clean, and read as a plain user, unless a case says
// otherwise
beforeEach(() => {
	spyOn(socialTargets, "resolveSocialTarget").mockResolvedValue(RESOLVED_PODCAST_EPISODE)
	toSocialReader = spyOn(socialTargets, "toSocialReader").mockResolvedValue(PLAIN_READER)
	countSocialWriteToday = spyOn(socialLimits, "countSocialWriteToday").mockResolvedValue(true)
	toObjectionableCategory = spyOn(moderation, "toObjectionableCategory").mockResolvedValue(null)

	// a share finds a free shared comment slot, and the Topic has one shared comment slot used of three
	shareCommentInFreeSharedCommentSlot = spyOn(sharedComments, "shareCommentInFreeSharedCommentSlot").mockResolvedValue(
		true,
	)
	spyOn(sharedComments, "loadSharedCommentSlots").mockResolvedValue(EDITOR_SHARED_COMMENT_SLOTS)
	trackEvent = spyOn(analytics, "trackEvent").mockImplementation(() => {})

	// a saved comment has no reactions yet
	spyOn(reactionRows, "loadReactionSummaries").mockResolvedValue(new Map())
})

// put the spies and the connection pool back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
})

// a post on the Podcast Episode as one user
function post(body: string, options: Omit<PostCommentPayload, "target" | "body"> = {}): ReturnType<typeof postComment> {
	return postComment({
		userId: "user-1",
		payload: { target: PODCAST_EPISODE_TARGET, body, ...options },
		analyticsProperties: TEST_ANALYTICS_PROPERTIES,
	})
}

// the fixed rows a post reads, by the text that names each read: the inserted comment's id, the comment read back
// with its id, author, body, chapter, parent, shared time, and creation time, then the author's name and avatar, and
// whether the reader reported it, the comment's mention, the one user the body mentions, and the poster's access row
const POST_ROWS: [string, unknown[][]][] = [
	['insert into "comments"', [["comment-1"]]],
	[
		'"is_reported"',
		[["comment-1", "user-1", "hi @owner-1", 3, null, null, null, new Date(), "user-1", "generated", null, false]],
	],
	['from "comment_mentions"', [["comment-1", "owner-1", "owner-1"]]],
	['"username_normalized" in', [["owner-1", "owner-1"]]],
	['from "users"', [FREE_USER_ACCESS_ROW]],
]

// the connection pool's rows for a post: the chapter if the Podcast Episode has it, the parent a reply names, and the
// fixed rows
function stubCommentRows({
	hasChapter = true,
	parentRow,
}: {
	hasChapter?: boolean
	parentRow?: unknown[]
} = {}): ReturnType<typeof stubConnectionPool> {
	return stubConnectionPool(({ text }) => {
		if (text.includes('from "episode_chapters"')) {
			return hasChapter ? [[3]] : []
		}

		// the parent read is the one plain select from the comments table
		if (text.includes('from "comments"') && !text.includes('"is_reported"')) {
			return parentRow ? [parentRow] : []
		}
		return POST_ROWS.find(([readText]) => text.includes(readText))?.[1] ?? []
	})
}

test("a post stores the comment with its mention and sends a hot take event with no text", async () => {
	const sentQueries = stubCommentRows()
	const commentWriteResult = await post("hi @owner-1", { chapterPosition: 3 })
	expect(commentWriteResult.status).toBe("saved")

	// the comment and its one mention are written, and the comment comes back as its author reads it, unshared
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith('insert into "comment_mentions"'))).toBe(true)
	if (commentWriteResult.status === "saved") {
		expect(commentWriteResult.comment.mentions).toEqual([{ userId: "owner-1", username: "owner-1" }])
		expect(commentWriteResult.comment.chapterPosition).toBe(3)
		expect(commentWriteResult.comment.isEditable).toBe(true)
		expect(commentWriteResult.comment.isSharedWithCarl).toBe(false)
		expect(commentWriteResult.sharedCommentSlots).toBeNull()
	}

	// a plain user shares nothing
	expect(shareCommentInFreeSharedCommentSlot).not.toHaveBeenCalled()

	// the event names the Podcast Episode and its Topic, says it is no reply, and holds none of the body
	const [event, , properties] = trackEvent.mock.calls[0] ?? []
	expect(event).toBe("social_podcast_episode_hot_take")
	expect(properties).toMatchObject({ objectId: "episode-1", topicId: "topic-1", isOwner: false, isReply: false })
	expect(JSON.stringify(properties)).not.toContain("hi @")
})

test("an editor's top-level comment is shared with Carl, and the result holds the Topic's shared comment slots", async () => {
	toSocialReader.mockResolvedValue({ ...PLAIN_READER, canShare: true })
	stubCommentRows()
	const commentWriteResult = await post("worth a listen")
	expect(commentWriteResult.status).toBe("saved")
	expect(shareCommentInFreeSharedCommentSlot).toHaveBeenCalledWith({
		commentId: "comment-1",
		topic: RESOLVED_PODCAST_EPISODE.topic,
		body: "worth a listen",
	})
	if (commentWriteResult.status === "saved") {
		expect(commentWriteResult.sharedCommentSlots).toEqual(EDITOR_SHARED_COMMENT_SLOTS)
	}
})

test("an editor who turns the share off posts an unshared comment", async () => {
	toSocialReader.mockResolvedValue({ ...PLAIN_READER, canShare: true })
	stubCommentRows()
	expect((await post("just for the team", { isSharedWithCarl: false })).status).toBe("saved")
	expect(shareCommentInFreeSharedCommentSlot).not.toHaveBeenCalled()
})

test("an editor's reply is shared if the post asks", async () => {
	toSocialReader.mockResolvedValue({ ...PLAIN_READER, canShare: true })
	stubCommentRows({
		parentRow: toTableRow(comments, {
			id: "comment-0",
			authorUserId: "owner-1",
			podcastEpisodeId: "episode-1",
			body: "the first",
			createdAt: new Date(),
		}),
	})
	expect((await post("me too", { parentCommentId: "comment-0", isSharedWithCarl: true })).status).toBe("saved")
	expect(shareCommentInFreeSharedCommentSlot).toHaveBeenCalledTimes(1)
})

test("a follower who asks to share posts an unshared comment", async () => {
	stubCommentRows()
	expect((await post("share this", { isSharedWithCarl: true })).status).toBe("saved")
	expect(shareCommentInFreeSharedCommentSlot).not.toHaveBeenCalled()
})

test("a reply to a reply joins that reply's parent, and a post with no share choice leaves it unshared", async () => {
	// the reply the post names, itself a reply to comment-0 on the same Podcast Episode
	toSocialReader.mockResolvedValue({ ...PLAIN_READER, canShare: true })
	const sentQueries = stubCommentRows({
		parentRow: toTableRow(comments, {
			id: "reply-1",
			authorUserId: "owner-1",
			podcastEpisodeId: "episode-1",
			parentCommentId: "comment-0",
			body: "the first reply",
			createdAt: new Date(),
		}),
	})
	expect((await post("me too", { parentCommentId: "reply-1" })).status).toBe("saved")

	// the stored row names comment-0 as its parent, and the event says it is a reply
	const insertQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('insert into "comments"'))
	expect(insertQuery?.values).toContain("comment-0")
	expect(insertQuery?.values).not.toContain("reply-1")
	expect(shareCommentInFreeSharedCommentSlot).not.toHaveBeenCalled()
	expect(trackEvent.mock.calls[0]?.[2]).toMatchObject({ isReply: true })
})

test("a parent on another social target reads as not found, with nothing written", async () => {
	const sentQueries = stubCommentRows({
		parentRow: toTableRow(comments, {
			id: "comment-0",
			authorUserId: "owner-1",
			topicId: "topic-1",
			body: "on the topic",
			createdAt: new Date(),
		}),
	})
	expect(await post("me too", { parentCommentId: "comment-0" })).toEqual({ status: "notFound" })
	expect(await post("me too", { parentCommentId: "missing" })).toEqual({ status: "notFound" })
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith("insert"))).toBe(false)
	expect(countSocialWriteToday).not.toHaveBeenCalled()
})

test("a chapter the Podcast Episode lacks is rejected before the count", async () => {
	stubCommentRows({ hasChapter: false })
	expect(await post("a comment", { chapterPosition: 9 })).toEqual({ status: "invalidChapter" })
	expect(countSocialWriteToday).not.toHaveBeenCalled()
})

test("a post past the day's limit is rejected with no classification", async () => {
	countSocialWriteToday.mockResolvedValue(false)
	stubCommentRows()
	expect(await post("a comment")).toEqual({ status: "limitReached" })
	expect(toObjectionableCategory).not.toHaveBeenCalled()
})

test("a body that reads as a violation is rejected before it is stored", async () => {
	toObjectionableCategory.mockResolvedValue("hate")
	const sentQueries = stubCommentRows()
	expect(await post("mean words")).toEqual({ status: "objectionable", category: "hate" })
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith("insert"))).toBe(false)
})

test("a social target the user cannot open reads as not found", async () => {
	spyOn(socialTargets, "resolveSocialTarget").mockResolvedValue(null)
	stubCommentRows()
	expect(await post("a comment")).toEqual({ status: "notFound" })
})

// the connection pool's rows for a delete or a share: the user's access row, and the comment's own row on the Podcast
// Episode
function stubCommentRead(authorUserId: string): ReturnType<typeof stubConnectionPool> {
	spyOn(socialTargets, "loadSocialTarget").mockResolvedValue(RESOLVED_PODCAST_EPISODE)
	spyOn(commentRows, "loadWeekCommentCount").mockResolvedValue(2)
	return stubConnectionPool(({ text }) => {
		if (text.includes('from "users"')) {
			return [FREE_USER_ACCESS_ROW]
		}

		// the comment's own read
		return text.startsWith("select") && text.includes('from "comments"')
			? [
					toTableRow(comments, {
						id: "comment-9",
						authorUserId,
						podcastEpisodeId: "episode-1",
						body: "rude words",
						createdAt: new Date(),
					}),
				]
			: []
	})
}

// an edit of the user's own comment, and whether a query that changes it went out
type StubOwnCommentOptions = { sharedTopicId?: string; airedPodcastEpisodeId?: string }
function stubOwnComment({
	sharedTopicId,
	airedPodcastEpisodeId,
}: StubOwnCommentOptions = {}): ReturnType<typeof stubConnectionPool> {
	spyOn(socialTargets, "loadSocialTarget").mockResolvedValue(RESOLVED_PODCAST_EPISODE)
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	return stubConnectionPool(({ text }) => {
		// the update returns the edited row, and the read returns the comment as it stood
		if (text.startsWith('update "comments"')) {
			return [["comment-9"]]
		}
		return text.startsWith("select") && text.includes('from "comments"') && !text.includes('"is_reported"')
			? [
					toTableRow(comments, {
						id: "comment-9",
						authorUserId: "user-1",
						podcastEpisodeId: "episode-1",
						body: "the first words",
						sharedTopicId,
						sharedWithCarlAt: sharedTopicId ? new Date() : undefined,
						airedPodcastEpisodeId,
						createdAt: new Date(),
					}),
				]
			: []
	})
}

// an edit by the comment's author
function edit(body: string): ReturnType<typeof editComment> {
	return editComment({ userId: "user-1", commentId: "comment-9", body })
}

test("an edit that changes nothing makes no model call and no count", async () => {
	const sentQueries = stubOwnComment()
	await edit("the first words")
	expect(toObjectionableCategory).not.toHaveBeenCalled()
	expect(countSocialWriteToday).not.toHaveBeenCalled()
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith("update"))).toBe(false)
})

test("an edit past the day's limit stores nothing and makes no model call", async () => {
	const sentQueries = stubOwnComment()
	countSocialWriteToday.mockResolvedValue(false)
	expect(await edit("new words")).toEqual({ status: "limitReached" })
	expect(toObjectionableCategory).not.toHaveBeenCalled()
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith("update"))).toBe(false)
})

test("an author who may no longer post cannot edit", async () => {
	stubOwnComment()
	spyOn(authorization, "isAllowed").mockResolvedValue(false)
	expect(await edit("new words")).toEqual({ status: "notFound" })
	expect(countSocialWriteToday).not.toHaveBeenCalled()
})

test("a rewrite by an author who may not share takes the share back, and an editor's keeps it", async () => {
	const unshareComment = spyOn(sharedComments, "unshareComment").mockResolvedValue()
	const syncCommentLinks = spyOn(sharedComments, "syncCommentLinks").mockResolvedValue()

	// a follower's rewrite of a shared comment
	stubOwnComment({ sharedTopicId: "topic-1" })
	await edit("new words")
	expect(unshareComment).toHaveBeenCalledTimes(1)
	expect(syncCommentLinks).not.toHaveBeenCalled()

	// an editor's rewrite keeps the share, and its links follow the new body
	toSocialReader.mockResolvedValue({ ...PLAIN_READER, canShare: true })
	stubOwnComment({ sharedTopicId: "topic-1" })
	await edit("new words")
	expect(unshareComment).toHaveBeenCalledTimes(1)
	expect(syncCommentLinks).toHaveBeenCalledTimes(1)
})

test("a rewrite of a comment a Podcast Episode already read keeps the share", async () => {
	const unshareComment = spyOn(sharedComments, "unshareComment").mockResolvedValue()
	spyOn(sharedComments, "syncCommentLinks").mockResolvedValue()
	stubOwnComment({ sharedTopicId: "topic-1", airedPodcastEpisodeId: "episode-1" })
	await edit("new words")
	expect(unshareComment).not.toHaveBeenCalled()
})

test("a delete and a take back reach a comment on a Finding rated thumbs down, and a new share does not", async () => {
	stubCommentRead("user-1")
	const loadSocialTarget = spyOn(socialTargets, "loadSocialTarget").mockResolvedValue(RESOLVED_PODCAST_EPISODE)
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	const analyticsProperties = TEST_ANALYTICS_PROPERTIES
	const shareOptions = { userId: "user-1", commentId: "comment-9", analyticsProperties }

	// each write says whether its read includes the rated down Finding
	await deleteComment({ userId: "user-1", commentId: "comment-9", analyticsProperties })
	expect(loadSocialTarget.mock.lastCall?.[1]).toEqual({ isRatedDownIncluded: true })
	spyOn(sharedComments, "unshareComment").mockResolvedValue()
	await shareComment({ ...shareOptions, isSharedWithCarl: false })
	expect(loadSocialTarget.mock.lastCall?.[1]).toEqual({ isRatedDownIncluded: true })
	await shareComment({ ...shareOptions, isSharedWithCarl: true })
	expect(loadSocialTarget.mock.lastCall?.[1]).toEqual({ isRatedDownIncluded: false })
})

test("an author deletes their own comment, and the delete event names the comment with no text", async () => {
	const sentQueries = stubCommentRead("user-1")
	const commentWriteResult = await deleteComment({
		userId: "user-1",
		commentId: "comment-9",
		analyticsProperties: TEST_ANALYTICS_PROPERTIES,
	})
	expect(commentWriteResult).toEqual({ status: "deleted", weekCommentCount: 2, sharedCommentSlots: null })
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith('delete from "comments"'))).toBe(true)

	// the event holds ids and the owner flag, and none of the body
	const [event, userId, properties] = trackEvent.mock.calls[0] ?? []
	expect([event, userId]).toEqual(["social_hot_take_delete", "user-1"])
	expect(properties).toEqual({
		...TEST_ANALYTICS_PROPERTIES,
		objectId: "comment-9",
		topicId: "topic-1",
		isOwner: false,
	})
	expect(JSON.stringify(properties)).not.toContain("rude words")
})

test("a moderator's delete of another person's comment returns the shared comment slots they may share, and a stranger's reads as missing", async () => {
	toSocialReader.mockResolvedValue({ userId: "owner-1", canModerate: true, canShare: true })
	stubCommentRead("user-2")
	expect(
		await deleteComment({ userId: "owner-1", commentId: "comment-9", analyticsProperties: TEST_ANALYTICS_PROPERTIES }),
	).toEqual({ status: "deleted", weekCommentCount: 2, sharedCommentSlots: EDITOR_SHARED_COMMENT_SLOTS })

	// a stranger may not moderate
	toSocialReader.mockResolvedValue({ ...PLAIN_READER, userId: "user-3" })
	const sentQueries = stubCommentRead("user-2")
	expect(
		await deleteComment({ userId: "user-3", commentId: "comment-9", analyticsProperties: TEST_ANALYTICS_PROPERTIES }),
	).toEqual({ status: "notFound" })
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith("delete"))).toBe(false)
})

test("the Topic's owner shares a comment, takes it back, and is told when no shared comment slot is free", async () => {
	// the owner may edit the Topic, so the share runs
	stubCommentRead("user-2")
	const share = (isSharedWithCarl: boolean): ReturnType<typeof shareComment> =>
		shareComment({
			userId: "owner-1",
			commentId: "comment-9",
			isSharedWithCarl,
			analyticsProperties: TEST_ANALYTICS_PROPERTIES,
		})
	expect(await share(true)).toEqual({
		status: "saved",
		isSharedWithCarl: true,
		sharedCommentSlots: EDITOR_SHARED_COMMENT_SLOTS,
	})
	expect(shareCommentInFreeSharedCommentSlot).toHaveBeenCalledWith({
		commentId: "comment-9",
		topic: RESOLVED_PODCAST_EPISODE.topic,
		body: "rude words",
	})
	expect(trackEvent).toHaveBeenCalledWith(
		"social_hot_take_share",
		"owner-1",
		expect.objectContaining({ objectId: "comment-9", isShared: true }),
	)

	// a full Topic, then the share taken back
	shareCommentInFreeSharedCommentSlot.mockResolvedValue(false)
	expect(await share(true)).toEqual({ status: "noFreeSharedCommentSlot" })
	const unshareComment = spyOn(sharedComments, "unshareComment").mockResolvedValue(undefined)
	expect(await share(false)).toEqual({
		status: "saved",
		isSharedWithCarl: false,
		sharedCommentSlots: EDITOR_SHARED_COMMENT_SLOTS,
	})
	expect(unshareComment).toHaveBeenCalledWith("comment-9")
})

test("a share by a user who may not edit the Topic reads as missing", async () => {
	stubCommentRead("user-2")
	expect(
		await shareComment({
			userId: "user-1",
			commentId: "comment-9",
			isSharedWithCarl: true,
			analyticsProperties: TEST_ANALYTICS_PROPERTIES,
		}),
	).toEqual({ status: "notFound" })
	expect(shareCommentInFreeSharedCommentSlot).not.toHaveBeenCalled()
})
