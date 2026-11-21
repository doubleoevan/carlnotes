// page user state tests: a Topic Post's thread drops the people in a user block with the user and takes their counts,
// reactions, reports, and own comments, and a profile's and a team's topics take the user's teams, email switches,
// and reaction counts
import { describe, expect, test } from "bun:test"
import type { TeamPageResult } from "@carlnotes/client/teamClient"
import type { TopicCard } from "@carlnotes/contracts/home"
import type { ProfilePageRead, TopicPostPageRead } from "@carlnotes/contracts/pageReads"
import type { TopicPostUserState, TopicsUserState } from "@carlnotes/contracts/pageUserStates"
import type { ProfileResponse } from "@carlnotes/contracts/profilePage"
import type { Topic } from "@carlnotes/contracts/profiles"
import { type Comment, type CommentReply, EMPTY_REACTION_SUMMARY } from "@carlnotes/contracts/social"
import type { TopicPostResponse } from "@carlnotes/contracts/topicPosts"
import { toProfileWithUserState, toTeamPageResultWithUserState, toTopicPostWithUserState } from "./pageUserStates"

// a reply by an author, as the visitors' copy lists it
function toReply(id: string, authorUserId: string | null): CommentReply {
	return {
		id,
		author: authorUserId
			? { userId: authorUserId, username: authorUserId, avatarSource: "initials", avatarVersion: null }
			: null,
		body: id,
		mentions: [],
		chapterPosition: null,
		parentCommentId: null,
		createdAt: new Date().toISOString(),
		reactions: { counts: [{ reactionType: "love", count: 1, users: [] }], ownReactionType: null },
		isSharedWithPodcast: false,
		isAired: false,
		isReported: false,
		isAuthor: false,
		isEditable: false,
		canDelete: false,
	}
}

// a top-level comment with its replies
function toComment(id: string, authorUserId: string | null, replies: CommentReply[]): Comment {
	return { ...toReply(id, authorUserId), replyCount: replies.length, replies }
}

// the visitors' copy of a post: comments by the reader, by a blocked person, and by Carl, a reply by the blocked person
const SHARED_TOPIC_POST = {
	id: "post-1",
	html: "<p>the saved body</p>",
	image: { url: "/image.webp" },
	reactionCount: 2,
	reactions: { counts: [{ reactionType: "love", count: 2, users: [] }], ownReactionType: null },
	commentThread: {
		comments: [
			toComment("comment-own", "reader-1", [toReply("reply-blocked", "blocked-1"), toReply("reply-other", "other-1")]),
			toComment("comment-blocked", "blocked-1", []),
			toComment("comment-carl", null, []),
		],
		nextCursor: null,
		weekCommentCount: 6,
		commentCount: 6,
		sharedCommentSlots: null,
	},
} as unknown as TopicPostResponse

// the user state: one reaction of theirs, one report, a reported image and body image, and one user block
const TOPIC_POST_USER_STATE: TopicPostUserState = {
	userId: "reader-1",
	reactionsByTargetKey: {
		"post:post-1": { counts: [{ reactionType: "love", count: 1, users: [] }], ownReactionType: "love" },
		"comment:comment-own": { counts: [{ reactionType: "love", count: 1, users: [] }], ownReactionType: null },
	},
	reportedCommentIds: ["reply-other"],
	isImageReported: true,
	html: "<p>the body without a reported image</p>",
	blockedUserIds: ["blocked-1"],
	blockedCommentCounts: { commentCount: 4, weekCommentCount: 3, replyCountByCommentId: { "comment-own": 1 } },
}

// a Topic Post page read of the visitors' copy with a user's part, or with none
function toTopicPostPageRead(userState: TopicPostUserState | null): TopicPostPageRead {
	return { head: null, topicPost: SHARED_TOPIC_POST, userState }
}

describe("toTopicPostWithUserState", () => {
	test("leaves the people in a user block with the reader out of the thread, with the reader's counts", () => {
		const commentThread = toTopicPostWithUserState(toTopicPostPageRead(TOPIC_POST_USER_STATE))?.commentThread
		expect(commentThread?.comments.map((comment) => comment.id)).toEqual(["comment-own", "comment-carl"])
		expect(commentThread?.comments[0]?.replies.map((reply) => reply.id)).toEqual(["reply-other"])
		expect(commentThread?.comments[0]?.replyCount).toBe(1)
		expect([commentThread?.commentCount, commentThread?.weekCommentCount]).toEqual([4, 3])
	})

	test("takes the reader's reactions, reports, image, body, and own comments", () => {
		const topicPost = toTopicPostWithUserState(toTopicPostPageRead(TOPIC_POST_USER_STATE))
		const [ownComment, carlComment] = topicPost?.commentThread?.comments ?? []

		// the post's reactions, image, and body as the reader sees them
		expect(topicPost?.reactions.ownReactionType).toBe("love")
		expect(topicPost?.reactionCount).toBe(1)
		expect(topicPost?.image).toBeNull()
		expect(topicPost?.html).toBe("<p>the body without a reported image</p>")

		// the reader's own comment, the reply they reported, and Carl's comment, whose reactions only the blocked person chose
		expect(ownComment).toMatchObject({ isAuthor: true, isEditable: true, canDelete: true })
		expect(ownComment?.replies[0]).toMatchObject({ isReported: true, isAuthor: false, canDelete: false })
		expect(carlComment?.reactions).toEqual(EMPTY_REACTION_SUMMARY)
	})

	test("returns null for no read or no post", () => {
		expect(toTopicPostWithUserState(null)).toBeNull()
		expect(toTopicPostWithUserState(undefined)).toBeNull()
		expect(toTopicPostWithUserState({ head: null, topicPost: null, userState: TOPIC_POST_USER_STATE })).toBeNull()
	})

	test("returns the copy as it is with no part, and keeps its counts for a reader in no user block", () => {
		expect(toTopicPostWithUserState(toTopicPostPageRead(null))).toBe(SHARED_TOPIC_POST)
		const commentThread = toTopicPostWithUserState(
			toTopicPostPageRead({ ...TOPIC_POST_USER_STATE, blockedUserIds: [], blockedCommentCounts: null, html: null }),
		)?.commentThread
		expect(commentThread?.comments).toHaveLength(3)
		expect(commentThread?.commentCount).toBe(6)
	})
})

// a topic row and a topic card that the copy leaves unnamed and unswitched
const TOPIC = { id: "topic-1", team: null, isEmailEnabled: null } as Topic
const TOPIC_CARD = { id: "topic-1", teamLink: null, reactionCount: 5 } as TopicCard
const TEAM = { teamId: "team-1", name: "the private team", avatarVersion: null }
const TOPICS_USER_STATE: TopicsUserState = {
	teamByTopicId: { "topic-1": TEAM },
	isEmailEnabledByTopicId: { "topic-1": true },
	reactionCountByTopicId: { "topic-1": 4 },
}

describe("toProfileWithUserState", () => {
	test("names the reader's team, switches their email, counts their reactions, and says they blocked the person", () => {
		const profile = { isBlocked: false, topics: [TOPIC], profileTopics: [TOPIC_CARD] } as unknown as ProfileResponse
		const userProfile = toProfileWithUserState({
			profile,
			userState: { ...TOPICS_USER_STATE, isBlocked: true },
		} as ProfilePageRead)

		// the block, the table row, and the card each take the reader's part
		expect(userProfile.isBlocked).toBe(true)
		expect(userProfile.topics[0]).toMatchObject({ team: TEAM, isEmailEnabled: true })
		expect(userProfile.profileTopics[0]).toMatchObject({ teamLink: TEAM, reactionCount: 4 })
	})

	test("returns the profile as it is with no part, and null for no read", () => {
		const profile = { isBlocked: false, topics: [TOPIC], profileTopics: [TOPIC_CARD] } as unknown as ProfileResponse
		expect(toProfileWithUserState({ profile, userState: null } as ProfilePageRead)).toBe(profile)
		expect(toProfileWithUserState(null)).toBeNull()
		expect(toProfileWithUserState(undefined)).toBeNull()
	})
})

describe("toTeamPageResultWithUserState", () => {
	test("lays the part a visible team page holds over it, and leaves a gated team as it is", () => {
		// a visible page with the reader's join request, chat mention, and topics' part
		const chatMention = { messageId: 1 } as never
		const teamPageResult = {
			status: "visible",
			team: {
				hasRequestedToJoin: false,
				chatMentions: [],
				topics: [TOPIC],
				topicCards: [TOPIC_CARD],
				userState: { ...TOPICS_USER_STATE, hasRequestedToJoin: true, chatMentions: [chatMention] },
			},
		} as unknown as TeamPageResult

		// the page takes the part, and a gated team stays as it is
		const userTeamPageResult = toTeamPageResultWithUserState(teamPageResult)
		expect(userTeamPageResult.status === "visible" && userTeamPageResult.team).toMatchObject({
			hasRequestedToJoin: true,
			chatMentions: [chatMention],
			topics: [{ team: TEAM, isEmailEnabled: true }],
			topicCards: [{ teamLink: TEAM, reactionCount: 4 }],
		})
		const gatedResult: TeamPageResult = { status: "gated", teamName: "team", hasRequestedToJoin: false }
		expect(toTeamPageResultWithUserState(gatedResult)).toBe(gatedResult)
	})
})
