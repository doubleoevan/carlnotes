// the comment writes: a post or a reply, an edit inside the edit time, a delete, and the share with the podcast
import type { ModerationCategory } from "@carlnotes/contracts/moderation"
import {
	type Comment,
	isInsideSocialEditTime,
	type PostCommentPayload,
	type SharedCommentSlots,
	SOCIAL_EDIT_MS,
	toCommentEventTarget,
} from "@carlnotes/contracts/social"
import { type CommentMention, toMentionedUsernames } from "@carlnotes/contracts/socialText"
import { db } from "@carlnotes/db"
import { podcastEpisodeChapters } from "@carlnotes/db/schema/podcast"
import { commentMentions, comments } from "@carlnotes/db/schema/social"
import { users } from "@carlnotes/db/schema/users"
import {
	loadSharedCommentSlots,
	shareCommentInFreeSharedCommentSlot,
	syncCommentLinks,
	unshareComment,
} from "@carlnotes/db/sharedComments"
import { countSocialWriteToday } from "@carlnotes/db/socialLimits"
import { trackEvent } from "@carlnotes/server/analytics"
import { and, eq, gt, inArray } from "drizzle-orm"
import { isAllowed } from "../authorization"
import type { AnalyticsProperties } from "../currentUser"
import { toObjectionableCategory } from "../moderation"
import { loadComment, loadWeekCommentCount } from "./commentRows"
import { toSocialEventProperties } from "./reactions"
import { toRowCommentTarget, toSocialTargetValues } from "./socialTargetColumns"
import { loadCommentWithTarget, resolvePostableSocialTarget, toSocialReader } from "./socialTargets"

// how many users one comment mentions at most
const MAX_COMMENT_MENTIONS = 50

// how a write ended: the comment as it stands now, with the shared comment slots for a reader who may share, or why
// nothing was written
export type CommentWriteResult =
	| { status: "saved"; comment: Comment; sharedCommentSlots: SharedCommentSlots | null }
	| { status: "deleted"; weekCommentCount: number; sharedCommentSlots: SharedCommentSlots | null }
	| { status: "notFound" }
	| { status: "locked" }
	| { status: "limitReached" }
	| { status: "invalidChapter" }
	| { status: "objectionable"; category: ModerationCategory }

// how a post ended, which never finds a comment locked or deleted
export type CommentPostResult = Exclude<CommentWriteResult, { status: "deleted" | "locked" }>

// how a share ended: whether the comment is shared now with the Topic's shared comment slots, or why nothing changed
export type CommentShareResult =
	| { status: "saved"; isSharedWithPodcast: boolean; sharedCommentSlots: SharedCommentSlots }
	| { status: "notFound" }
	| { status: "noFreeSharedCommentSlot" }

// who posts, what they post, and the request's analytics properties
type PostCommentOptions = { userId: string; payload: PostCommentPayload; analyticsProperties: AnalyticsProperties }

/**
 * Posts a comment or a reply on a social target, for a user who may post there. A comment by a user who may edit the
 * Topic is shared with the podcast if the Topic has a free shared comment slot, by default for a top-level comment and
 * otherwise if the post asks.
 */
export async function postComment({
	userId,
	payload,
	analyticsProperties,
}: PostCommentOptions): Promise<CommentPostResult> {
	// the social target, for a user who may post on it. a missing one and a rejected post read the same
	const { target, body, chapterPosition } = payload
	const resolvedSocialTarget = await resolvePostableSocialTarget(userId, target)
	if (!resolvedSocialTarget) {
		return { status: "notFound" }
	}

	// a reply answers a comment on the same social target, and a chapter belongs to the Podcast Episode
	const parentCommentId = await toParentCommentId(payload)
	if (parentCommentId === undefined) {
		return { status: "notFound" }
	}
	if (chapterPosition !== undefined && !(await hasPodcastEpisodeChapter(payload))) {
		return { status: "invalidChapter" }
	}

	// a post counts against the day, and a body that reads as a violation is rejected before it is stored
	const commentTextRejection = await toCommentTextRejection({ userId, body, contentId: target.id })
	if (commentTextRejection) {
		return commentTextRejection
	}

	// store the comment with the users it mentions
	const mentions = await loadMentionedUsers(body)
	const commentRow = await db.transaction(async (transaction) => {
		const [insertedRow] = await transaction
			.insert(comments)
			.values({
				authorUserId: userId,
				...toSocialTargetValues(target),
				chapterPosition,
				parentCommentId,
				body,
				createdAt: new Date(),
			})
			.returning({ id: comments.id })

		// the users it mentions
		if (insertedRow && mentions.length > 0) {
			await transaction.insert(commentMentions).values(toCommentMentionRows(insertedRow.id, mentions))
		}
		return insertedRow
	})
	if (!commentRow) {
		return { status: "notFound" }
	}

	// an editor's comment is shared with the podcast if it is top-level or the post asks, and the Topic has a free shared
	// comment slot
	const { topic } = resolvedSocialTarget
	const reader = await toSocialReader(userId, topic)
	const { isSharedWithPodcast = parentCommentId === null } = payload
	if (reader.canShare && isSharedWithPodcast) {
		await shareCommentInFreeSharedCommentSlot({ commentId: commentRow.id, topic, body })
	}
	trackEvent(`social_${toCommentEventTarget(target.kind)}_hot_take`, userId, {
		...toSocialEventProperties({ analyticsProperties, userId, resolvedSocialTarget, objectId: target.id }),
		isReply: parentCommentId !== null,
	})
	return toSavedCommentResult(commentRow.id, reader, topic)
}

// the top-level comment a post answers: null for a top-level post, and undefined if the comment it names is missing
// or hangs on another social target. a reply to a reply joins that reply's parent
async function toParentCommentId({ target, parentCommentId }: PostCommentPayload): Promise<string | null | undefined> {
	if (!parentCommentId) {
		return null
	}

	// the comment the reply names, on this social target
	const [parentRow] = await db.select().from(comments).where(eq(comments.id, parentCommentId))
	const parentTarget = parentRow ? toRowCommentTarget(parentRow) : null
	if (!parentRow || parentTarget?.kind !== target.kind || parentTarget.id !== target.id) {
		return undefined
	}
	return parentRow.parentCommentId ?? parentRow.id
}

// the comment as its writer sees it now, with the Topic's shared comment slots for a writer who may share
async function toSavedCommentResult(
	commentId: string,
	reader: Awaited<ReturnType<typeof toSocialReader>>,
	topic: Parameters<typeof loadSharedCommentSlots>[0],
): Promise<Extract<CommentWriteResult, { status: "saved" | "notFound" }>> {
	const [comment, sharedCommentSlots] = await Promise.all([
		loadComment(commentId, reader),
		reader.canShare ? loadSharedCommentSlots(topic) : null,
	])
	return comment ? { status: "saved", comment, sharedCommentSlots } : { status: "notFound" }
}

// who edits, which comment, and its new body
type EditCommentOptions = { userId: string; commentId: string; body: string }

/**
 * Edits the user's own comment inside its edit time, and replaces the users it mentions.
 */
export async function editComment({ userId, commentId, body }: EditCommentOptions): Promise<CommentWriteResult> {
	// the user's own comment, on a social target that still exists
	const commentWithTarget = await loadCommentWithTarget(commentId)
	if (commentWithTarget?.commentRow.authorUserId !== userId) {
		return { status: "notFound" }
	}

	// an author who may no longer post on the Topic may no longer edit there
	const { commentRow: ownCommentRow, resolvedSocialTarget } = commentWithTarget
	const { topic } = resolvedSocialTarget
	if (!(await isAllowed(userId, "social:post", topic))) {
		return { status: "notFound" }
	}

	// the edit time starts at creation, so an edit never extends it
	if (!isInsideSocialEditTime(ownCommentRow.createdAt)) {
		return { status: "locked" }
	}

	// an unchanged body has nothing to check or store
	const reader = await toSocialReader(userId, topic)
	if (body === ownCommentRow.body) {
		return toSavedCommentResult(commentId, reader, topic)
	}

	// an edit counts against the day like a post, and a body that reads as a violation is rejected before it is stored
	const commentTextRejection = await toCommentTextRejection({ userId, body, contentId: commentId })
	if (commentTextRejection) {
		return commentTextRejection
	}

	// the update runs only inside the edit time, so a comment that locked since the read stays as it was
	const mentions = await loadMentionedUsers(body)
	const isEdited = await db.transaction(async (transaction) => {
		const editedRows = await transaction
			.update(comments)
			.set({ body })
			.where(and(eq(comments.id, commentId), gt(comments.createdAt, new Date(Date.now() - SOCIAL_EDIT_MS))))
			.returning({ id: comments.id })

		// nothing updated means the comment locked since the read
		if (editedRows.length === 0) {
			return false
		}

		// the new body's mentions replace the old ones
		await transaction.delete(commentMentions).where(eq(commentMentions.commentId, commentId))
		if (mentions.length > 0) {
			await transaction.insert(commentMentions).values(toCommentMentionRows(commentId, mentions))
		}

		// an editor approved the words they shared, so a rewrite by an author who may not share takes the share back
		// until a Podcast Episode reads it. any other shared comment's queued links follow its body
		const { sharedWithPodcastTopicId, airedPodcastEpisodeId } = ownCommentRow
		if (sharedWithPodcastTopicId && !reader.canShare && !airedPodcastEpisodeId) {
			await unshareComment(commentId, transaction)
		} else if (sharedWithPodcastTopicId) {
			await syncCommentLinks({ commentId, topicId: sharedWithPodcastTopicId, body, handle: transaction })
		}
		return true
	})

	// the comment as its author reads it now
	if (!isEdited) {
		return { status: "locked" }
	}
	return toSavedCommentResult(commentId, reader, topic)
}

// who deletes, which comment, and the request's analytics properties
type DeleteCommentOptions = { userId: string; commentId: string; analyticsProperties: AnalyticsProperties }

/**
 * Deletes a comment and its replies for its author, the owner of its Topic, or an admin.
 */
export async function deleteComment({
	userId,
	commentId,
	analyticsProperties,
}: DeleteCommentOptions): Promise<CommentWriteResult> {
	// the comment and the Topic that says who may moderate it, even on a Finding rated thumbs down
	const commentWithTarget = await loadCommentWithTarget(commentId, { isRatedDownIncluded: true })
	if (!commentWithTarget) {
		return { status: "notFound" }
	}

	// someone else's comment is deleted only by a user who may moderate. a rejection reads as a missing comment
	const { commentRow, resolvedSocialTarget } = commentWithTarget
	const { topic } = resolvedSocialTarget
	const reader = await toSocialReader(userId, topic)
	if (commentRow.authorUserId !== userId && !reader.canModerate) {
		return { status: "notFound" }
	}

	// delete it and record the event. a deleted comment frees the shared comment slot it was shared in
	await db.delete(comments).where(eq(comments.id, commentId))
	trackEvent(
		"social_hot_take_delete",
		userId,
		toSocialEventProperties({ analyticsProperties, userId, resolvedSocialTarget, objectId: commentId }),
	)
	const [weekCommentCount, sharedCommentSlots] = await Promise.all([
		loadWeekCommentCount(reader, toRowCommentTarget(commentRow)),
		reader.canShare ? loadSharedCommentSlots(topic) : null,
	])
	return { status: "deleted", weekCommentCount, sharedCommentSlots }
}

// who shares, which comment, whether to share it or take it back, and the request's analytics properties
type ShareCommentOptions = {
	userId: string
	commentId: string
	isSharedWithPodcast: boolean
	analyticsProperties: AnalyticsProperties
}

/**
 * Shares a comment with the podcast or takes it back, for a user who may edit its Topic. A share needs a free shared
 * comment slot.
 */
export async function shareComment({
	userId,
	commentId,
	isSharedWithPodcast,
	analyticsProperties,
}: ShareCommentOptions): Promise<CommentShareResult> {
	// the comment, for a user who may edit its Topic. a missing one and a rejected share read the same, and a share on
	// a Finding rated thumbs down can only be taken back
	const commentWithTarget = await loadCommentWithTarget(commentId, { isRatedDownIncluded: !isSharedWithPodcast })
	if (!commentWithTarget || !(await isAllowed(userId, "topic:edit", commentWithTarget.resolvedSocialTarget.topic))) {
		return { status: "notFound" }
	}

	// share it in a free shared comment slot, or take it back
	const { commentRow, resolvedSocialTarget } = commentWithTarget
	const { topic } = resolvedSocialTarget
	if (!isSharedWithPodcast) {
		await unshareComment(commentId)
	} else if (!(await shareCommentInFreeSharedCommentSlot({ commentId, topic, body: commentRow.body }))) {
		return { status: "noFreeSharedCommentSlot" }
	}
	trackEvent("social_hot_take_share", userId, {
		...toSocialEventProperties({ analyticsProperties, userId, resolvedSocialTarget, objectId: commentId }),
		isShared: isSharedWithPodcast,
	})
	return { status: "saved", isSharedWithPodcast, sharedCommentSlots: await loadSharedCommentSlots(topic) }
}

// whether a post names a chapter its Podcast Episode has
async function hasPodcastEpisodeChapter({ target, chapterPosition }: PostCommentPayload): Promise<boolean> {
	if (target.kind !== "podcastEpisode" || chapterPosition === undefined) {
		return false
	}

	// the Podcast Episode's chapter at that position
	const [chapterRow] = await db
		.select({ position: podcastEpisodeChapters.position })
		.from(podcastEpisodeChapters)
		.where(
			and(eq(podcastEpisodeChapters.podcastEpisodeId, target.id), eq(podcastEpisodeChapters.position, chapterPosition)),
		)
	return Boolean(chapterRow)
}

// the rejection for a Comment's text: its day's writes spent, or a body that reads as a violation
async function toCommentTextRejection({
	userId,
	body,
	contentId,
}: {
	userId: string
	body: string
	contentId: string
}): Promise<Extract<CommentWriteResult, { status: "limitReached" | "objectionable" }> | null> {
	// the write counts against the day before moderation runs
	if (!(await countSocialWriteToday(userId, "comment"))) {
		return { status: "limitReached" }
	}
	const objectionableCategory = await toObjectionableCategory({
		text: body,
		textKind: "a public comment on an article, a podcast episode, or a topic",
		subjectKind: "comment",
		subjectId: contentId,
	})
	return objectionableCategory ? { status: "objectionable", category: objectionableCategory } : null
}

// the users a body mentions who exist, each with their id and their name as stored
async function loadMentionedUsers(body: string): Promise<CommentMention[]> {
	const mentionedUsernames = toMentionedUsernames(body).slice(0, MAX_COMMENT_MENTIONS)
	if (mentionedUsernames.length === 0) {
		return []
	}

	// the accounts with those names
	return db
		.select({ userId: users.id, username: users.username })
		.from(users)
		.where(inArray(users.usernameNormalized, mentionedUsernames))
}

// the mention rows a comment stores
function toCommentMentionRows(commentId: string, mentions: CommentMention[]): (typeof commentMentions.$inferInsert)[] {
	return mentions.map((mention) => ({ commentId, mentionedUserId: mention.userId, username: mention.username }))
}
