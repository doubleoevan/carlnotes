// Topic Post page read tests: a signed-in reader of a public post shares the visitors' copy with their own part, which
// names the people in a user block with them and counts the thread without them, and the author's read is built for
// them alone
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import type { CommentThreadResponse } from "@carlnotes/contracts/social"
import type { TopicPostResponse } from "@carlnotes/contracts/topicPosts"
import * as dbAuthorization from "@carlnotes/db/authorization"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { toVisitorTopicPostPageKey } from "@carlnotes/db/visitorPageCaches"
import { toTestPageHead } from "../pageReadTestFixtures"
import * as pageHead from "../share/pageHead"
import * as commentRows from "../social/commentRows"
import * as reactionRows from "../social/reactionRows"
import * as userBlocks from "../userBlocks"
import * as topicPostBodyImages from "./topicPostBodyImages"
import { readTopicPostPageRead } from "./topicPostPageRead"
import * as topicPostResponse from "./topicPostResponse"
import * as topicPosts from "./topicPosts"

// a published post of a public Topic by its author
const TOPIC_POST_ROW = {
	topicPost: { id: "post-1", authorUserId: "author-1", publishedAt: new Date(), html: "<p>body</p>", imageHash: null },
	topic: { id: "topic-1", visibility: "public", ownerId: "owner-1" },
} as unknown as topicPosts.TopicPostRow

// a comment as the visitors' copy lists it
function toCopyComment(id: string, authorUserId: string): CommentThreadResponse["comments"][number] {
	return {
		id,
		author: { userId: authorUserId, username: authorUserId, avatarSource: "initials", avatarVersion: null },
		body: id,
		mentions: [],
		chapterPosition: null,
		parentCommentId: null,
		createdAt: new Date().toISOString(),
		reactions: { counts: [], ownReactionType: null },
		isSharedWithPodcast: false,
		isAired: false,
		isReported: false,
		isAuthor: false,
		isEditable: false,
		canDelete: false,
		replyCount: 0,
		replies: [],
	}
}

// the post as the visitors' copy holds it, with a comment by a person the reader blocked and one by someone else
const SHARED_TOPIC_POST = {
	id: "post-1",
	html: "<p>body</p>",
	image: null,
	reactions: { counts: [], ownReactionType: null },
	commentThread: {
		comments: [toCopyComment("comment-blocked", "blocked-1"), toCopyComment("comment-other", "other-1")],
		nextCursor: null,
		weekCommentCount: 2,
		commentCount: 2,
		sharedCommentSlots: null,
	},
} as unknown as TopicPostResponse

// the response builder's spy, which counts the page builds
let toTopicPostResponseSpy: ReturnType<typeof spyOn>

// a fresh Redis, the post's row, head, and page, and a reader who may not edit the Topic, before each test
beforeEach(() => {
	stubRedisClient()
	spyOn(topicPosts, "loadTopicPostRow").mockResolvedValue(TOPIC_POST_ROW)
	spyOn(topicPosts, "canReadTopicPost").mockResolvedValue(true)
	toTopicPostResponseSpy = spyOn(topicPostResponse, "toTopicPostResponse").mockResolvedValue(SHARED_TOPIC_POST)
	spyOn(pageHead, "loadTopicPostPageHead").mockResolvedValue(toTestPageHead("the post"))
	spyOn(dbAuthorization, "isAllowed").mockResolvedValue(false)
})

// the Redis client and every spy back after each test
afterEach(() => {
	restoreRedisClient()
	mock.restore()
})

test("a signed-in reader shares the copy, and their own part names the person they blocked and counts without them", async () => {
	// the reader blocked one commenter and reacted to nothing
	spyOn(userBlocks, "loadUserBlocksBetween").mockResolvedValue({
		blockedUserIds: new Set(["blocked-1"]),
		userBlockUserIds: new Set(["blocked-1"]),
	})
	spyOn(reactionRows, "loadReactionSummaries").mockResolvedValue(new Map())
	spyOn(commentRows, "loadReportedCommentIds").mockResolvedValue([])
	spyOn(commentRows, "loadCommentCounts").mockResolvedValue({ commentCount: 1, weekCommentCount: 1 })
	spyOn(commentRows, "loadReplyCounts").mockResolvedValue(new Map())
	spyOn(topicPosts, "isTopicPostImageReported").mockResolvedValue(false)
	spyOn(topicPostBodyImages, "loadTopicPostHtmlWithoutReportedImages").mockResolvedValue("<p>body</p>")

	// the read builds the copy once for no one, and stores it
	const topicPostPageRead = await readTopicPostPageRead({ userId: "reader-1", topicPostId: "post-1" })
	expect(toTopicPostResponseSpy.mock.calls.map(([userId]: [string | null]) => userId)).toEqual([null])
	expect(topicPostPageRead?.userState).toMatchObject({
		userId: "reader-1",
		blockedUserIds: ["blocked-1"],
		blockedCommentCounts: { commentCount: 1, weekCommentCount: 1, replyCountByCommentId: {} },
		html: null,
	})

	// the copy keeps every comment, the blocked person's included
	expect(topicPostPageRead?.topicPost?.commentThread?.comments).toHaveLength(2)
})

test("the author's read is built for them and stores nothing", async () => {
	const storedValueByKey = stubRedisClient()
	const topicPostPageRead = await readTopicPostPageRead({ userId: "author-1", topicPostId: "post-1" })
	expect(toTopicPostResponseSpy.mock.calls.map(([userId]: [string | null]) => userId)).toEqual(["author-1"])
	expect(topicPostPageRead?.userState).toBeNull()
	expect(storedValueByKey.has(toVisitorTopicPostPageKey("post-1"))).toBe(false)
})
