// the social contracts: what a Reaction or a Comment hangs on, a social target's reaction summary, a Comment with its
// replies and its thread, the Comments shared with the podcast, and the bodies that write them
import { z } from "zod"
import type { CommentEventTarget, SocialEventTarget } from "./analyticsEvents"
import { commentTargetKinds, reactionTypes, socialTargetKinds } from "./enums"
import { PODCAST_EPISODE_CHAPTER_POSITION_MAX } from "./podcastEpisodes"
import { profileIdentity } from "./profiles"
import { commentBody, commentMention } from "./socialText"
import { MINUTE_MS } from "./time"

export type ReactionType = (typeof reactionTypes)[number]

// each reaction type's label
export const REACTION_TYPE_LABELS: Record<ReactionType, string> = {
	like: "Like",
	celebrate: "Celebrate",
	support: "Support",
	love: "Love",
	insightful: "Insightful",
	funny: "Funny",
}
export type SocialTargetKind = (typeof socialTargetKinds)[number]
export type CommentTargetKind = (typeof commentTargetKinds)[number]

// how each kind a Comment hangs on reads in an analytics event's name. a post reads as its Topic
const COMMENT_EVENT_TARGETS: Record<CommentTargetKind, CommentEventTarget> = {
	finding: "finding",
	podcastEpisode: "podcast_episode",
	topic: "topic",
	post: "topic",
}

/**
 * Returns how the kind a Comment hangs on reads in an analytics event's name.
 */
export function toCommentEventTarget(kind: CommentTargetKind): CommentEventTarget {
	return COMMENT_EVENT_TARGETS[kind]
}

/**
 * Whether a kind names a social target.
 */
export function isSocialTargetKind(kind: string): kind is SocialTargetKind {
	return (socialTargetKinds as readonly string[]).includes(kind)
}

/**
 * Returns how a social target's kind reads in an analytics event's name. A Comment reads as a hot take.
 */
export function toSocialEventTarget(kind: SocialTargetKind): SocialEventTarget {
	return kind === "comment" ? "hot_take" : COMMENT_EVENT_TARGETS[kind]
}

// how long after its creation a Comment can still be edited
export const SOCIAL_EDIT_MS = 15 * MINUTE_MS

// how many top-level Comments or replies one read returns, and how many replies come with a top-level Comment
export const SOCIAL_PAGE_SIZE = 20
export const COMMENT_REPLY_PREVIEW_COUNT = 3

// how many Comments a Topic shares with the podcast for its next Podcast Episode, by the Podcast Episode's length, and
// how many of the most recently shared a Scan's scoring reads
export const SHARED_COMMENT_SLOTS = { short: 3, full: 5 } as const
export const SHARED_COMMENT_CONTEXT_COUNT = 5

// how many users the mention suggestions return, and the longest prefix they take
export const MENTION_SUGGESTION_LIMIT = 8
const MENTION_PREFIX_MAX_CHARS = 40

// the id of a row that a social read or write names. a row id is short and holds no NUL, which Postgres text rejects
const SOCIAL_ID_MAX_CHARS = 64
export const socialId = z
	.string()
	.min(1)
	.max(SOCIAL_ID_MAX_CHARS)
	.regex(/^[\w-]+$/)

// a chapter's position in its Podcast Episode, from 0
export const commentChapterPosition = z.number().int().min(0).max(PODCAST_EPISODE_CHAPTER_POSITION_MAX)

// what a Reaction hangs on: the kind and the id of a Finding, a Podcast Episode, a Topic, a post, or a Comment
const socialTarget = z.object({ kind: z.enum(socialTargetKinds), id: socialId })
export type SocialTarget = z.infer<typeof socialTarget>

// what a Comment hangs on: every social target but a Comment, which a reply names as its parent instead
const commentTarget = z.object({ kind: z.enum(commentTargetKinds), id: socialId })
export type CommentTarget = z.infer<typeof commentTarget>

// how many of the users who chose a reaction type a summary names
export const REACTION_USER_PREVIEW_COUNT = 8

// a social target's reactions at a glance: how many chose each type, the newest of them, and the type the user chose
export const reactionSummary = z.object({
	// each type that anyone chose with its count, in the picker's order
	counts: z.array(
		z.object({ reactionType: z.enum(reactionTypes), count: z.number(), users: z.array(profileIdentity) }),
	),
	ownReactionType: z.enum(reactionTypes).nullable(),
})
export type ReactionSummary = z.infer<typeof reactionSummary>

// a summary of no reactions, which a read without one shows
export const EMPTY_REACTION_SUMMARY: ReactionSummary = { counts: [], ownReactionType: null }

// the body that saves the user's Reaction. no type removes it
export const saveReactionPayload = z.object({ target: socialTarget, reactionType: z.enum(reactionTypes).nullable() })
export type SaveReactionPayload = z.infer<typeof saveReactionPayload>

// what a save returns: the social target's summary as it stands now
export const reactionSummaryResponse = z.object({ summary: reactionSummary })

// one Comment as a user sees it, a top-level one or a reply. no author is Carl's
const commentReply = z.object({
	id: z.string(),
	author: profileIdentity.nullable(),
	body: z.string(),
	mentions: z.array(commentMention),
	// the chapter of its Podcast Episode that it names, by position
	chapterPosition: z.number().nullable(),
	// the top-level Comment a reply answers, null on a top-level Comment
	parentCommentId: z.string().nullable(),
	createdAt: z.string(),
	reactions: reactionSummary,
	// whether the Topic's editors shared it with the podcast
	isSharedWithPodcast: z.boolean(),
	// whether a Podcast Episode's script read it
	isAired: z.boolean(),
	// whether the user reported it
	isReported: z.boolean(),
	isAuthor: z.boolean(),
	isEditable: z.boolean(),
	canDelete: z.boolean(),
})
export type CommentReply = z.infer<typeof commentReply>

// a top-level Comment with how many replies it has and its first few, oldest first
const comment = commentReply.extend({ replyCount: z.number(), replies: z.array(commentReply) })
export type Comment = z.infer<typeof comment>

// how many of a Topic's shared Comments wait for its next Podcast Episode, and how many may
const sharedCommentSlots = z.object({ usedCount: z.number(), slotCount: z.number() })
export type SharedCommentSlots = z.infer<typeof sharedCommentSlots>

// one page of a comment thread, newest first, the cursor of the next page, how many comments and replies the last seven
// days added, and the shared comment slots for a user who may edit the Topic
export const commentThreadResponse = z.object({
	comments: z.array(comment),
	nextCursor: z.string().nullable(),
	weekCommentCount: z.number(),
	sharedCommentSlots: sharedCommentSlots.nullable(),
})
export type CommentThreadResponse = z.infer<typeof commentThreadResponse>

// a comment thread with nothing on it
export const EMPTY_COMMENT_THREAD: CommentThreadResponse = {
	comments: [],
	nextCursor: null,
	weekCommentCount: 0,
	sharedCommentSlots: null,
}

// one page of a Comment's replies, oldest first, and the cursor of the next page
export const commentRepliesResponse = z.object({ replies: z.array(commentReply), nextCursor: z.string().nullable() })
export type CommentRepliesResponse = z.infer<typeof commentRepliesResponse>
export const commentRepliesQuery = z.object({ cursor: z.string().optional() })

// the body that posts a Comment or a reply, and the body that edits one
export const postCommentPayload = z.object({
	target: commentTarget,
	body: commentBody,
	// the chapter's position in its Podcast Episode, from 0
	chapterPosition: commentChapterPosition.optional(),
	// the Comment a reply answers. a reply to a reply joins that reply's parent
	parentCommentId: socialId.optional(),
	// whether an editor's comment is shared with the podcast. left out, a top-level comment is shared and a reply is not
	isSharedWithPodcast: z.boolean().optional(),
})
export type PostCommentPayload = z.infer<typeof postCommentPayload>
export const editCommentPayload = z.object({ body: commentBody })

// what a post returns: the Comment, and the shared comment slots if the post changed them for an editor
export const postCommentResponse = z.object({ comment, sharedCommentSlots: sharedCommentSlots.nullable() })
export type PostCommentResponse = z.infer<typeof postCommentResponse>

// what a delete returns: the week's comment count, and the shared comment slots as they stand now for a user who may
// share
export const deleteCommentResponse = commentThreadResponse
	.pick({ weekCommentCount: true, sharedCommentSlots: true })
	.extend({ ok: z.literal(true) })
export type DeleteCommentResponse = z.infer<typeof deleteCommentResponse>

// the body that shares a Comment with the podcast or takes it back, and what it returns
export const shareCommentPayload = z.object({ isSharedWithPodcast: z.boolean() })
export const shareCommentResponse = z.object({ isSharedWithPodcast: z.boolean(), sharedCommentSlots })
export type ShareCommentResponse = z.infer<typeof shareCommentResponse>

// one Comment a Topic shares with the podcast, as the Topic's sources list shows it
const sharedComment = commentReply.pick({ id: true, author: true, body: true }).extend({
	sharedAt: z.string(),
	// the page that shows it
	path: z.string(),
})
export type SharedComment = z.infer<typeof sharedComment>
export const sharedCommentsResponse = z.object({ comments: z.array(sharedComment) })

// the query of a paged read: the social target, and the cursor a read before it returned
export const commentThreadQuery = commentTarget.extend({ cursor: z.string().optional() })
export const reactionSummaryQuery = socialTarget

// the mention suggestions: a username prefix in, and the users whose usernames start with it out
export const mentionSuggestionsQuery = z.object({ prefix: z.string().trim().min(1).max(MENTION_PREFIX_MAX_CHARS) })
export const mentionSuggestionsResponse = z.object({ users: z.array(profileIdentity) })

/**
 * Whether a Comment first saved at the given time is still inside its edit time.
 */
export function isInsideSocialEditTime(savedAt: Date): boolean {
	return Date.now() - savedAt.getTime() < SOCIAL_EDIT_MS
}

/**
 * Whether a Topic has a shared comment slot free for another Comment.
 */
export function hasFreeSharedCommentSlot({ usedCount, slotCount }: SharedCommentSlots): boolean {
	return usedCount < slotCount
}

/**
 * Returns a key that names one social target.
 */
export function toSocialTargetKey({ kind, id }: SocialTarget): string {
	return `${kind}:${id}`
}
