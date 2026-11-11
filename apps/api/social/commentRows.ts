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
		// when it was shared with the podcast, and the Podcast Episode that read it
		| "sharedWithPodcastAt"
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
		sharedWithPodcastAt: comments.sharedWithPodcastAt,
		airedPodcastEpisodeId: comments.airedPodcastEpisodeId,
		createdAt: comments.createdAt,
		...socialAuthorColumns,
		isReported: toIsReportedColumn(reader.userId, comments.id),
	}
}

// a read of comment rows with each author's name and avatar, which a caller filters and orders
// biome-ignore lint/nursery/useExplicitReturnType: the query's type is drizzle's generated builder type
function toCommentRowQuery(reader: SocialReader) {
	return db.select(toCommentColumns(reader)).from(comments).leftJoin(users, eq(users.id, comments.authorUserId))
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
		isSharedWithPodcast: commentRow.sharedWithPodcastAt !== null,
		isAired: commentRow.airedPodcastEpisodeId !== null,
		isReported: commentRow.isReported,
		...toCommentPermissions(commentRow, reader),
	}))
}

/**
 * Loads one comment as the reader sees it, with no replies listed, or null if it is gone.
 */
export async function loadComment(commentId: string, reader: SocialReader): Promise<Comment | null> {
	const commentRows = await toCommentRowQuery(reader).where(eq(comments.id, commentId))

	// the row as the reader sees it, with no replies listed
	const [commentReply] = await toCommentReplies(commentRows, reader)
	return commentReply ? { ...commentReply, replyCount: 0, replies: [] } : null
}

// who reads, the social target, the Topic it belongs to, the cursor of the page before, and the Comment a link names
type LoadCommentPageOptions = {
	reader: SocialReader
	target: CommentTarget
	topic: NamedTopic
	cursor?: string
	commentId?: string
}

// a thread's counts: every comment and reply, and the ones the last seven days added
export type CommentCounts = { commentCount: number; weekCommentCount: number }

/**
 * Counts the comments and replies on a social target, of the authors the reader sees, in all and in the last seven
 * days, in one read.
 */
export async function loadCommentCounts(reader: SocialReader, target: CommentTarget): Promise<CommentCounts> {
	const weekStart = new Date(Date.now() - WEEK_MS)
	const [countRow] = await db
		.select({
			commentCount: count(),
			weekCommentCount: sql<number>`count(*) filter (where ${gte(comments.createdAt, weekStart)})`.mapWith(Number),
		})
		.from(comments)
		.where(and(toCommentTargetFilter(target), toVisibleAuthorFilter(reader.userId, comments.authorUserId)))
	return { commentCount: countRow?.commentCount ?? 0, weekCommentCount: countRow?.weekCommentCount ?? 0 }
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
 * replies, with the cursor of the next page, the week's comment count, the thread's whole count, and the shared
 * comment slots for a reader who may share. A first page that names a Comment leads with that Comment's top-level Comment and its replies up to the
 * one named, however old it is. A Comment that is gone, or one the reader may not read, changes nothing.
 */
export async function loadCommentPage({
	reader,
	target,
	topic,
	cursor,
	commentId,
}: LoadCommentPageOptions): Promise<CommentThreadResponse> {
	// the Comment a link names, which only a first page leads with
	const linkedCommentRows = commentId && !cursor ? await loadLinkedCommentRows({ reader, target, commentId }) : null

	// one row past the page says whether another page follows
	const topLevelRows = await toCommentRowQuery(reader)
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

	// the page's first replies and reply counts, the week's count, the thread's whole count, and the shared comment
	// slots for a reader who may share
	const listedRows = topLevelRows.slice(0, SOCIAL_PAGE_SIZE)
	const pageRows = toPageRows(listedRows, linkedCommentRows)
	const [firstReplyRows, { commentCount, weekCommentCount }, sharedCommentSlots] = await Promise.all([
		loadFirstReplyRows(
			reader,
			pageRows.map((pageRow) => pageRow.id),
		),
		loadCommentCounts(reader, target),
		reader.canShare ? loadSharedCommentSlots(topic) : null,
	])

	// the replies each comment shows: its first few, or the linked Comment's thread up to the reply a link names
	const linkedReplyRows = linkedCommentRows?.replyRows ?? []
	const linkedParentCommentId = linkedReplyRows[0]?.parentCommentId
	const shownReplyRows = [
		...firstReplyRows.filter((replyRow) => replyRow.parentCommentId !== linkedParentCommentId),
		...linkedReplyRows,
	]

	// every row as the reader sees it, in two reads for the page and its replies together
	const commentReplies = await toCommentReplies([...pageRows, ...shownReplyRows], reader)
	const replyCountByParentId = new Map(
		firstReplyRows.map((replyRow) => [replyRow.parentCommentId, replyRow.replyCount]),
	)
	const lastPageRow = listedRows.at(-1)
	return {
		comments: commentReplies.slice(0, pageRows.length).map((commentReply) => ({
			...commentReply,
			replyCount: replyCountByParentId.get(commentReply.id) ?? 0,
			replies: commentReplies.slice(pageRows.length).filter((reply) => reply.parentCommentId === commentReply.id),
		})),
		nextCursor: topLevelRows.length > SOCIAL_PAGE_SIZE && lastPageRow ? toSocialCursor(lastPageRow) : null,
		weekCommentCount,
		commentCount,
		sharedCommentSlots,
	}
}

// the most replies a linked Comment's thread returns, from the first to the reply a link names
// ponytail: limits a very long reply thread. page to the linked reply past it
const LINKED_REPLY_LIMIT = 200

// the Comment a link names, as its top-level Comment and that Comment's replies up to the one named
type LinkedCommentRows = { topLevelRow: CommentRow; replyRows: CommentRow[] }

// a page's rows with the linked Comment's top-level Comment first, and never twice
function toPageRows(listedRows: CommentRow[], linkedCommentRows: LinkedCommentRows | null): CommentRow[] {
	if (!linkedCommentRows) {
		return listedRows
	}
	const { topLevelRow } = linkedCommentRows
	return [topLevelRow, ...listedRows.filter((listedRow) => listedRow.id !== topLevelRow.id)]
}

// the Comment a link names on this thread, or null if it is gone or its author is one the reader does not see
async function loadLinkedCommentRows({
	reader,
	target,
	commentId,
}: Pick<LoadCommentPageOptions, "reader" | "target"> & { commentId: string }): Promise<LinkedCommentRows | null> {
	// one comment of this thread by its id, with its author's columns
	const loadCommentRow = async (id: string): Promise<CommentRow | undefined> => {
		const [commentRow] = await toCommentRowQuery(reader).where(
			and(
				eq(comments.id, id),
				toCommentTargetFilter(target),
				toVisibleAuthorFilter(reader.userId, comments.authorUserId),
			),
		)
		return commentRow
	}

	// a top-level Comment leads by itself, and a reply leads with its top-level Comment
	const linkedRow = await loadCommentRow(commentId)
	if (!linkedRow?.parentCommentId) {
		return linkedRow ? { topLevelRow: linkedRow, replyRows: [] } : null
	}
	const topLevelRow = await loadCommentRow(linkedRow.parentCommentId)
	if (!topLevelRow) {
		return null
	}

	// the replies from the first to the linked one, oldest first
	const replyRows = await toCommentRowQuery(reader)
		.where(
			and(
				eq(comments.parentCommentId, topLevelRow.id),
				toVisibleAuthorFilter(reader.userId, comments.authorUserId),
				sql`(${comments.createdAt}, ${comments.id}) <= (select linked.created_at, linked.id from ${comments} linked where linked.id = ${linkedRow.id})`,
			),
		)
		.orderBy(asc(comments.createdAt), asc(comments.id))
		.limit(LINKED_REPLY_LIMIT)
	return { topLevelRow, replyRows }
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
	const replyRows = await toCommentRowQuery(reader)
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
