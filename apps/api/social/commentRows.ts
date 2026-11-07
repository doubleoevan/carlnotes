// the comment reads: a comment as a reader sees it, a thread's page of top-level comments with their first replies,
// and a comment's page of replies
import {
	COMMENT_REPLY_PREVIEW_COUNT,
	type Comment,
	type CommentRepliesResponse,
	type CommentReply,
	type CommentTarget,
	type CommentThreadResponse,
	EMPTY_REACTION_SUMMARY,
	SOCIAL_PAGE_SIZE,
	toSocialTargetKey,
} from "@carlnotes/contracts/social"
import type { CommentMention } from "@carlnotes/contracts/socialText"
import { DAY_MS } from "@carlnotes/contracts/time"
import { db } from "@carlnotes/db"
import { toVisibleAuthorFilter } from "@carlnotes/db/contentFilters"
import { commentMentions, comments } from "@carlnotes/db/schema/social"
import { users } from "@carlnotes/db/schema/users"
import { loadSharedCommentSlots } from "@carlnotes/db/sharedComments"
import type { NamedTopic } from "@carlnotes/db/topicPermissions"
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm"
import { toProfileIdentity } from "../avatars"
import { loadReactionSummaries } from "./reactionRows"
import {
	type SocialAuthorRow,
	type SocialReader,
	socialAuthorColumns,
	toAfterSocialCursorFilter,
	toCommentPermissions,
	toIsReportedColumn,
	toSocialCursor,
} from "./socialRows"
import { toCommentTargetFilter } from "./socialTargetColumns"

// how far back a thread's count of recent comments reaches
const WEEK_MS = 7 * DAY_MS

// a comment row with its author's name and avatar, as a read selects it
type CommentRow = SocialAuthorRow &
	Pick<
		typeof comments.$inferSelect,
		| "id"
		| "authorUserId"
		| "body"
		| "chapterPosition"
		| "parentCommentId"
		// when it was shared with Carl, and the Podcast Episode that read it
		| "sharedWithCarlAt"
		| "airedPodcastEpisodeId"
		| "createdAt"
	> & { isReported: boolean }

// the columns every comment read selects, with whether this reader reported the comment
// biome-ignore lint/nursery/useExplicitReturnType: drizzle's column types are generated, and naming them here would break on an upgrade
function toCommentColumns(reader: SocialReader) {
	return {
		id: comments.id,
		authorUserId: comments.authorUserId,
		body: comments.body,
		chapterPosition: comments.chapterPosition,
		parentCommentId: comments.parentCommentId,
		sharedWithCarlAt: comments.sharedWithCarlAt,
		airedPodcastEpisodeId: comments.airedPodcastEpisodeId,
		createdAt: comments.createdAt,
		...socialAuthorColumns,
		isReported: toIsReportedColumn(reader.userId, comments.id),
	}
}

/**
 * Loads the users each comment mentions, by the comment's id, with each name as the body wrote it.
 */
async function loadCommentMentions(commentIds: string[]): Promise<Map<string, CommentMention[]>> {
	if (commentIds.length === 0) {
		return new Map()
	}

	// every mention of every comment, in one read
	const mentionRows = await db
		.select({
			commentId: commentMentions.commentId,
			userId: commentMentions.mentionedUserId,
			username: commentMentions.username,
		})
		.from(commentMentions)
		.where(inArray(commentMentions.commentId, commentIds))

	// group them under their comment
	const mentionsByCommentId = new Map<string, CommentMention[]>()
	for (const { commentId, ...mention } of mentionRows) {
		mentionsByCommentId.set(commentId, [...(mentionsByCommentId.get(commentId) ?? []), mention])
	}
	return mentionsByCommentId
}

// comment rows as the reader sees them, each with its mentions and its reaction summary, in two reads for them all
async function toCommentReplies(commentRows: CommentRow[], reader: SocialReader): Promise<CommentReply[]> {
	// every comment's mentions and reactions
	const commentIds = commentRows.map((commentRow) => commentRow.id)
	const [mentionsByCommentId, reactionSummaries] = await Promise.all([
		loadCommentMentions(commentIds),
		loadReactionSummaries({
			userId: reader.userId,
			targets: commentIds.map((commentId) => ({ kind: "comment" as const, id: commentId })),
		}),
	])

	// a comment with no author is Carl's
	return commentRows.map((commentRow) => ({
		id: commentRow.id,
		author: toProfileIdentity({ ...commentRow, userId: commentRow.authorUserId }),
		body: commentRow.body,
		mentions: mentionsByCommentId.get(commentRow.id) ?? [],
		chapterPosition: commentRow.chapterPosition,
		parentCommentId: commentRow.parentCommentId,
		createdAt: commentRow.createdAt.toISOString(),
		reactions:
			reactionSummaries.get(toSocialTargetKey({ kind: "comment", id: commentRow.id })) ?? EMPTY_REACTION_SUMMARY,
		isSharedWithCarl: commentRow.sharedWithCarlAt !== null,
		isAired: commentRow.airedPodcastEpisodeId !== null,
		isReported: commentRow.isReported,
		...toCommentPermissions(commentRow, reader),
	}))
}

/**
 * Loads one comment as the reader sees it, with no replies listed, or null if it is gone.
 */
export async function loadComment(commentId: string, reader: SocialReader): Promise<Comment | null> {
	const commentRows = await db
		.select(toCommentColumns(reader))
		.from(comments)
		.leftJoin(users, eq(users.id, comments.authorUserId))
		.where(eq(comments.id, commentId))

	// the row as the reader sees it, with no replies listed
	const [commentReply] = await toCommentReplies(commentRows, reader)
	return commentReply ? { ...commentReply, replyCount: 0, replies: [] } : null
}

// who reads, the social target, the Topic it belongs to, and the cursor of the page before
type LoadCommentPageOptions = {
	reader: SocialReader
	target: CommentTarget
	topic: NamedTopic
	cursor?: string
}

/**
 * Counts the comments and replies on a social target that the last seven days added, of the authors the reader sees.
 */
export async function loadWeekCommentCount(reader: SocialReader, target: CommentTarget): Promise<number> {
	const [countRow] = await db
		.select({ commentCount: count() })
		.from(comments)
		.where(
			and(
				toCommentTargetFilter(target),
				gte(comments.createdAt, new Date(Date.now() - WEEK_MS)),
				toVisibleAuthorFilter(reader.userId, comments.authorUserId),
			),
		)
	return countRow?.commentCount ?? 0
}

// the Findings to count, and the user who reads them, null for a visitor
type LoadFindingCommentCountsOptions = { findingIds: string[]; userId: string | null }

/**
 * Counts the comments and replies on each Finding, of the authors the user sees, in one read.
 */
export async function loadFindingCommentCounts({
	findingIds,
	userId,
}: LoadFindingCommentCountsOptions): Promise<Map<string, number>> {
	if (findingIds.length === 0) {
		return new Map()
	}

	// each Finding's comments and replies that the user sees
	const countRows = await db
		.select({ findingId: comments.findingId, commentCount: count() })
		.from(comments)
		.where(and(inArray(comments.findingId, findingIds), toVisibleAuthorFilter(userId, comments.authorUserId)))
		.groupBy(comments.findingId)
	return new Map(countRows.map(({ findingId, commentCount }) => [findingId ?? "", commentCount]))
}

/**
 * Loads one page of a social target's top-level comments, newest first, each with its reply count and its first
 * replies, with the cursor of the next page, the week's comment count, and the shared comment slots for a reader who
 * may share.
 */
export async function loadCommentPage({
	reader,
	target,
	topic,
	cursor,
}: LoadCommentPageOptions): Promise<CommentThreadResponse> {
	// one row past the page says whether another page follows
	const topLevelRows = await db
		.select(toCommentColumns(reader))
		.from(comments)
		.leftJoin(users, eq(users.id, comments.authorUserId))
		.where(
			and(
				toCommentTargetFilter(target),
				isNull(comments.parentCommentId),
				toVisibleAuthorFilter(reader.userId, comments.authorUserId),
				toAfterSocialCursorFilter(comments, cursor),
			),
		)
		.orderBy(desc(comments.createdAt), desc(comments.id))
		.limit(SOCIAL_PAGE_SIZE + 1)

	// the page's first replies and reply counts, the week's count, and the shared comment slots for a reader who may
	// share
	const pageRows = topLevelRows.slice(0, SOCIAL_PAGE_SIZE)
	const [firstReplyRows, weekCommentCount, sharedCommentSlots] = await Promise.all([
		loadFirstReplyRows(
			reader,
			pageRows.map((pageRow) => pageRow.id),
		),
		loadWeekCommentCount(reader, target),
		reader.canShare ? loadSharedCommentSlots(topic) : null,
	])

	// every row as the reader sees it, in two reads for the page and its replies together
	const commentReplies = await toCommentReplies([...pageRows, ...firstReplyRows], reader)
	const replyCountByParentId = new Map(
		firstReplyRows.map((replyRow) => [replyRow.parentCommentId, replyRow.replyCount]),
	)
	const lastPageRow = pageRows.at(-1)
	return {
		comments: commentReplies.slice(0, pageRows.length).map((commentReply) => ({
			...commentReply,
			replyCount: replyCountByParentId.get(commentReply.id) ?? 0,
			replies: commentReplies.slice(pageRows.length).filter((reply) => reply.parentCommentId === commentReply.id),
		})),
		nextCursor: topLevelRows.length > SOCIAL_PAGE_SIZE && lastPageRow ? toSocialCursor(lastPageRow) : null,
		weekCommentCount,
		sharedCommentSlots,
	}
}

// the first replies of each top-level comment, oldest first, each with its parent's count of replies the reader sees
async function loadFirstReplyRows(
	reader: SocialReader,
	parentCommentIds: string[],
): Promise<(CommentRow & { replyCount: number })[]> {
	if (parentCommentIds.length === 0) {
		return []
	}

	// rank each parent's replies oldest first, and count them
	const rankedReplies = db
		.select({
			replyId: comments.id,
			position:
				sql<number>`row_number() over (partition by ${comments.parentCommentId} order by ${comments.createdAt}, ${comments.id})`
					.mapWith(Number)
					.as("position"),
			replyCount: sql<number>`count(*) over (partition by ${comments.parentCommentId})`
				.mapWith(Number)
				.as("reply_count"),
		})
		.from(comments)
		.where(
			and(
				inArray(comments.parentCommentId, parentCommentIds),
				toVisibleAuthorFilter(reader.userId, comments.authorUserId),
			),
		)
		.as("ranked_replies")

	// only each parent's first few read their columns
	return db
		.select({ ...toCommentColumns(reader), replyCount: rankedReplies.replyCount })
		.from(rankedReplies)
		.innerJoin(comments, eq(comments.id, rankedReplies.replyId))
		.leftJoin(users, eq(users.id, comments.authorUserId))
		.where(lte(rankedReplies.position, COMMENT_REPLY_PREVIEW_COUNT))
		.orderBy(comments.createdAt, comments.id)
}

// who reads, the top-level comment, and the cursor of the page before
type LoadCommentReplyPageOptions = { reader: SocialReader; parentCommentId: string; cursor?: string }

/**
 * Loads one page of a comment's replies, oldest first, with the cursor of the next page.
 */
export async function loadCommentReplyPage({
	reader,
	parentCommentId,
	cursor,
}: LoadCommentReplyPageOptions): Promise<CommentRepliesResponse> {
	// one row past the page says whether another page follows
	const replyRows = await db
		.select(toCommentColumns(reader))
		.from(comments)
		.leftJoin(users, eq(users.id, comments.authorUserId))
		.where(
			and(
				eq(comments.parentCommentId, parentCommentId),
				toVisibleAuthorFilter(reader.userId, comments.authorUserId),
				toAfterSocialCursorFilter(comments, cursor, "oldestFirst"),
			),
		)
		.orderBy(asc(comments.createdAt), asc(comments.id))
		.limit(SOCIAL_PAGE_SIZE + 1)

	// the page as the reader sees it
	const pageRows = replyRows.slice(0, SOCIAL_PAGE_SIZE)
	const lastPageRow = pageRows.at(-1)
	return {
		replies: await toCommentReplies(pageRows, reader),
		nextCursor: replyRows.length > SOCIAL_PAGE_SIZE && lastPageRow ? toSocialCursor(lastPageRow) : null,
	}
}
