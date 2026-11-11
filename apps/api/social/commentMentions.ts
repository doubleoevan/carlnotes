// a user's unseen Comment Mentions: the one cached read their badges and their list share, the seen mark, and the
// mention rows a comment's post and edit write. the clears of the cached read are in
// @carlnotes/db/unseenCommentMentions

import type { CommentMentionsSeenPayload, UnseenCommentMention } from "@carlnotes/contracts/commentMentions"
import { toCommentPath, toSocialTargetPath, toTopicPostPath } from "@carlnotes/contracts/seo"
import { type CommentMention, toCommentFirstLine, toMentionedUsernames } from "@carlnotes/contracts/socialText"
import { type DbHandle, db } from "@carlnotes/db"
import { toVisibleAuthorFilter } from "@carlnotes/db/contentFilters"
import { cacheJson } from "@carlnotes/db/redis"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { commentMentions, comments } from "@carlnotes/db/schema/social"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { toTopicAccessFilter } from "@carlnotes/db/topicPermissions"
import { clearUnseenCommentMentions, toUnseenCommentMentionsKey } from "@carlnotes/db/unseenCommentMentions"
import { trackEvent } from "@carlnotes/server/analytics"
import { and, desc, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm"
import type { AnalyticsProperties } from "../currentUser"
import { toRowCommentTarget } from "./socialTargetColumns"
import { toOpenSocialTargetFilter, withSocialTargetJoins } from "./socialTargetJoins"

// how long a user's cached read lasts if nothing clears it. a Finding's rating and a closed account change what the
// read returns without clearing it, so the read is at most this stale
const UNSEEN_COMMENT_MENTIONS_TTL_MS = 5 * 60_000

// the most unseen mentions one read returns, newest first
const MAX_UNSEEN_COMMENT_MENTIONS = 100

/**
 * Loads a user's unseen Comment Mentions, newest first, from the cached read or from one query on a miss.
 */
export function loadUnseenCommentMentions(userId: string): Promise<UnseenCommentMention[]> {
	return cacheJson({
		key: toUnseenCommentMentionsKey(userId),
		ttlMs: UNSEEN_COMMENT_MENTIONS_TTL_MS,
		load: () => readUnseenCommentMentions(userId),
	})
}

// the user's unseen mentions in Comments they may read: by another author they see, on a page they may open, and never
// on a Finding the Topic's Feed leaves out for them
async function readUnseenCommentMentions(userId: string): Promise<UnseenCommentMention[]> {
	const mentionRows = await withSocialTargetJoins(
		db
			.select({
				// the Comment, its author, and the columns that say what it hangs on
				commentId: comments.id,
				body: comments.body,
				createdAt: comments.createdAt,
				authorUserId: users.id,
				authorUsername: users.username,
				topicId: comments.topicId,
				findingId: comments.findingId,
				podcastEpisodeId: comments.podcastEpisodeId,
				postId: comments.postId,
				// the Topic, and the Podcast Episode or the Topic Post that the page is
				targetTopicId: topics.id,
				topicName: topics.name,
				podcastEpisodeTitle: podcastEpisodes.title,
				season: podcastEpisodes.season,
				episodeNumber: podcastEpisodes.episodeNumber,
				topicPostTitle: topicPosts.title,
			})
			.from(commentMentions)
			.innerJoin(comments, eq(comments.id, commentMentions.commentId))
			.leftJoin(users, eq(users.id, comments.authorUserId))
			.$dynamic(),
		comments,
	)
		.where(
			and(
				eq(commentMentions.mentionedUserId, userId),
				isNull(commentMentions.seenAt),
				sql`${comments.authorUserId} is distinct from ${userId}`,
				toVisibleAuthorFilter(userId, comments.authorUserId),
				or(toTopicAccessFilter(userId), eq(topics.visibility, "public")),
				toOpenSocialTargetFilter(userId),
			),
		)
		.orderBy(desc(comments.createdAt), desc(comments.id))
		.limit(MAX_UNSEEN_COMMENT_MENTIONS)
	return mentionRows.map(toUnseenCommentMention)
}

// a mention's row as the read selects it
type UnseenCommentMentionRow = {
	commentId: string
	body: string
	createdAt: Date | string
	authorUserId: string | null
	authorUsername: string | null
	// the one social target column the Comment sets
	topicId: string | null
	findingId: string | null
	podcastEpisodeId: string | null
	postId: string | null
	// the Topic, and the Podcast Episode or the Topic Post that the page is
	targetTopicId: string
	topicName: string
	podcastEpisodeTitle: string | null
	season: number | null
	episodeNumber: number | null
	topicPostTitle: string | null
}

/**
 * Returns a mention as the badges and the list read it: the thread it sits in, the page that shows the thread, and the
 * path that opens the Comment there. A Finding's thread sits on its Topic's page.
 */
export function toUnseenCommentMention(mentionRow: UnseenCommentMentionRow): UnseenCommentMention {
	const topic = { id: mentionRow.targetTopicId, name: mentionRow.topicName }
	const { authorUserId, authorUsername, podcastEpisodeId, postId } = mentionRow

	// the page: the Topic Post's own, the Podcast Episode's own, or the Topic's
	const page = postId
		? { kind: "post" as const, id: postId, name: mentionRow.topicPostTitle ?? topic.name }
		: podcastEpisodeId
			? { kind: "podcastEpisode" as const, id: podcastEpisodeId, name: mentionRow.podcastEpisodeTitle ?? topic.name }
			: { kind: "topic" as const, id: topic.id, name: topic.name }

	// the page's path, with the Finding in the query if the Comment hangs on one
	const pagePath = postId
		? toTopicPostPath(topic, { id: postId, title: mentionRow.topicPostTitle ?? "" })
		: toSocialTargetPath(topic, mentionRow)
	return {
		commentId: mentionRow.commentId,
		author: authorUserId && authorUsername ? { userId: authorUserId, username: authorUsername } : null,
		text: toCommentFirstLine(mentionRow.body),
		createdAt: new Date(mentionRow.createdAt).toISOString(),
		topicId: topic.id,
		target: toRowCommentTarget(mentionRow),
		page,
		path: toCommentPath(pagePath, mentionRow.commentId),
	}
}

// who saw the mentions, which ones, and the request's analytics properties
type SaveSeenCommentMentionsOptions = {
	userId: string
	payload: CommentMentionsSeenPayload
	analyticsProperties: AnalyticsProperties
}

/**
 * Marks the user's unseen mentions in the Comments named, or every one of them, as seen, and returns how many it
 * marked. Each one marked reports its event with the Comment's id and its Topic's id.
 */
export async function saveSeenCommentMentions({
	userId,
	payload,
	analyticsProperties,
}: SaveSeenCommentMentionsOptions): Promise<number> {
	const seenRows = await db
		.update(commentMentions)
		.set({ seenAt: new Date() })
		.where(
			and(
				eq(commentMentions.mentionedUserId, userId),
				isNull(commentMentions.seenAt),
				"commentIds" in payload ? inArray(commentMentions.commentId, payload.commentIds) : undefined,
			),
		)
		.returning({ commentId: commentMentions.commentId })
	if (seenRows.length === 0) {
		return 0
	}

	// the next read counts without them
	await clearUnseenCommentMentions([userId])

	// report each one by its Comment and its Topic
	const seenCommentIds = seenRows.map((seenRow) => seenRow.commentId)
	const commentRows = await db
		.select({ id: comments.id, targetTopicId: comments.targetTopicId })
		.from(comments)
		.where(inArray(comments.id, seenCommentIds))
	for (const commentRow of commentRows) {
		trackEvent("social_mention_seen", userId, {
			...analyticsProperties,
			objectId: commentRow.id,
			...(commentRow.targetTopicId ? { topicId: commentRow.targetTopicId } : {}),
		})
	}
	return seenRows.length
}

// how many users one comment mentions at most
const MAX_COMMENT_MENTIONS = 50

/**
 * Loads the users a body mentions who exist, each with their id and their name as stored.
 */
export async function loadMentionedUsers(body: string): Promise<CommentMention[]> {
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

// the comment a write stores mentions for, its author, and the users its body mentions
type SaveCommentMentionsOptions = {
	transaction: DbHandle
	commentId: string
	authorUserId: string
	mentions: CommentMention[]
}

/**
 * Stores a new comment's mention rows.
 */
export async function saveCommentMentions({
	transaction,
	commentId,
	authorUserId,
	mentions,
}: SaveCommentMentionsOptions): Promise<void> {
	if (mentions.length === 0) {
		return
	}
	await transaction.insert(commentMentions).values(toCommentMentionRows({ commentId, authorUserId, mentions }))
}

/**
 * Replaces an edited comment's mention rows and returns every user whose unseen read changes: the ones the new body
 * mentions and the ones it dropped. A mention the new body keeps holds its seen time, and one it adds starts unseen.
 */
export async function replaceCommentMentions({
	transaction,
	commentId,
	authorUserId,
	mentions,
}: SaveCommentMentionsOptions): Promise<string[]> {
	// a mention the new body dropped is deleted
	const mentionedUserIds = mentions.map((mention) => mention.userId)
	const droppedMentionRows = await transaction
		.delete(commentMentions)
		.where(
			and(
				eq(commentMentions.commentId, commentId),
				mentionedUserIds.length > 0 ? notInArray(commentMentions.mentionedUserId, mentionedUserIds) : undefined,
			),
		)
		.returning({ mentionedUserId: commentMentions.mentionedUserId })

	// the new body's mentions, each keeping the seen time it had
	if (mentions.length > 0) {
		await transaction
			.insert(commentMentions)
			.values(toCommentMentionRows({ commentId, authorUserId, mentions }))
			.onConflictDoUpdate({
				target: [commentMentions.commentId, commentMentions.mentionedUserId],
				set: { username: sql`excluded.username` },
			})
	}
	return [...mentionedUserIds, ...droppedMentionRows.map((droppedMentionRow) => droppedMentionRow.mentionedUserId)]
}

// the mention rows a comment stores. an author's mention of themself starts seen, so their own unseen count skips
// it
function toCommentMentionRows({
	commentId,
	authorUserId,
	mentions,
}: Omit<SaveCommentMentionsOptions, "transaction">): (typeof commentMentions.$inferInsert)[] {
	const seenAt = new Date()
	return mentions.map((mention) => ({
		commentId,
		mentionedUserId: mention.userId,
		username: mention.username,
		seenAt: mention.userId === authorUserId ? seenAt : null,
	}))
}
