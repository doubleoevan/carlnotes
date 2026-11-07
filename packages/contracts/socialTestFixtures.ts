// reactions and comments for stories and component tests
import {
	type Comment,
	type CommentReply,
	type CommentThreadResponse,
	EMPTY_COMMENT_THREAD,
	type ReactionSummary,
	type SharedComment,
	type SharedCommentSlots,
} from "./social"

/**
 * Returns a summary where two types were chosen, which the user has not reacted to.
 */
export function toTestReactionSummary(overrides: Partial<ReactionSummary> = {}): ReactionSummary {
	return {
		counts: [
			{ reactionType: "like", count: 4, users: [] },
			{ reactionType: "insightful", count: 2, users: [] },
		],
		ownReactionType: null,
		...overrides,
	}
}

/**
 * Returns another person's reply, past its edit time, for stories and component tests.
 */
export function toTestCommentReply(overrides: Partial<CommentReply> = {}): CommentReply {
	return {
		id: "reply-1",
		author: { userId: "user-roast", username: "roastmaster", avatarSource: null, avatarVersion: null },
		body: "It held up on a 3B model for me.",
		mentions: [],
		chapterPosition: null,
		parentCommentId: "comment-1",
		createdAt: "2026-11-05T12:05:00Z",
		reactions: { counts: [], ownReactionType: null },
		isSharedWithCarl: false,
		isAired: false,
		isReported: false,
		isAuthor: false,
		isEditable: false,
		canDelete: false,
		...overrides,
	}
}

/**
 * Returns another person's top-level comment with no replies, past its edit time, for stories and component tests.
 */
export function toTestComment(overrides: Partial<Comment> = {}): Comment {
	return {
		...toTestCommentReply({
			id: "comment-1",
			author: { userId: "user-vienna", username: "vienna", avatarSource: null, avatarVersion: null },
			body: "Has anyone tried this on a small model?",
			parentCommentId: null,
			createdAt: "2026-11-05T12:00:00Z",
		}),
		replyCount: 0,
		replies: [],
		...overrides,
	}
}

/**
 * Returns the user's own top-level comment inside its edit time, for stories and component tests.
 */
export function toTestOwnComment(overrides: Partial<Comment> = {}): Comment {
	return toTestComment({
		id: "comment-own",
		author: { userId: "user-carl", username: "carl", avatarSource: null, avatarVersion: null },
		body: "Trying this on the eval set tonight.",
		isAuthor: true,
		isEditable: true,
		canDelete: true,
		...overrides,
	})
}

/**
 * Returns a thread's first page: a comment that mentions someone and has a reply, and an older one by Carl.
 */
export function toTestCommentThread(overrides: Partial<CommentThreadResponse> = {}): CommentThreadResponse {
	return {
		...EMPTY_COMMENT_THREAD,
		comments: [
			toTestComment({
				body: "@roastmaster this matches what you saw last week.",
				mentions: [{ userId: "user-roast", username: "roastmaster" }],
				reactions: toTestReactionSummary(),
				replyCount: 1,
				replies: [toTestCommentReply()],
			}),
			toTestComment({ id: "comment-2", author: null, body: "Three of you bookmarked this one." }),
		],
		weekCommentCount: 3,
		...overrides,
	}
}

/**
 * Returns a Topic editor's first page: one comment shared with Carl, one not, and the given shared comment slots.
 */
export function toTestEditorCommentThread(sharedCommentSlots: SharedCommentSlots): CommentThreadResponse {
	return {
		...EMPTY_COMMENT_THREAD,
		comments: [toTestComment({ isSharedWithCarl: true }), toTestComment({ id: "comment-2", body: "Not shared yet." })],
		sharedCommentSlots,
	}
}

// a Podcast Episode's chapters, which a comment may name
export const TEST_COMMENT_CHAPTERS = [
	{ position: 0, title: "Cold open" },
	{ position: 1, title: "Replay sets for evals" },
]

/**
 * Returns a Podcast Episode's first page, with one comment that names its second chapter.
 */
export function toTestChapterCommentThread(): CommentThreadResponse {
	return {
		...EMPTY_COMMENT_THREAD,
		comments: [toTestComment({ body: "This chapter is the one to replay.", chapterPosition: 1 })],
	}
}

/**
 * Returns two Comments a Topic shares with Carl, a person's and his own, the page at the given path showing both.
 */
export function toTestSharedComments(path: string): SharedComment[] {
	return [
		{
			id: "shared-1",
			author: { userId: "user-roast", username: "roastmaster", avatarSource: null, avatarVersion: null },
			body: "The replay set is the part worth copying.",
			sharedAt: "2026-11-05T12:00:00Z",
			path,
		},
		{
			id: "shared-2",
			author: null,
			body: "Three of you bookmarked this one.",
			sharedAt: "2026-11-04T12:00:00Z",
			path,
		},
	]
}
