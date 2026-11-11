// the cached read of a user's unseen Comment Mentions: its Redis key, the delete of the cached read, and the users
// whose cached reads a delete of Comments or an author's admin block changes
import { eq, inArray, or, type SQL } from "drizzle-orm"
import { type DbHandle, db } from "./index"
import { deleteRedisKeys } from "./redis"
import { commentMentions, comments } from "./schema/social"

/**
 * Returns the Redis key that a user's unseen Comment Mentions are cached under.
 */
export function toUnseenCommentMentionsKey(userId: string): string {
	return `unseen-comment-mentions:${userId}`
}

/**
 * Deletes the cached unseen Comment Mentions of each user, after a write that changes what their read returns.
 */
export async function clearUnseenCommentMentions(userIds: (string | null)[]): Promise<void> {
	const cacheKeys = [...new Set(userIds)].flatMap((userId) => (userId ? [toUnseenCommentMentionsKey(userId)] : []))
	await deleteRedisKeys(...cacheKeys)
}

/**
 * Returns the users that a Comment and its replies mention, whose cached reads a delete of the Comment changes.
 */
export function loadThreadMentionedUserIds(commentId: string): Promise<string[]> {
	return loadMentionedUserIds(or(eq(comments.id, commentId), eq(comments.parentCommentId, commentId)))
}

/**
 * Returns the users that an author's Comments mention, whose cached reads an admin block of the author changes.
 */
export function loadAuthorMentionedUserIds(authorUserId: string): Promise<string[]> {
	return loadMentionedUserIds(eq(comments.authorUserId, authorUserId))
}

/**
 * Returns the users that the Comments on a Topic, its Findings, its Podcast Episodes, and its Topic Posts mention,
 * whose cached reads the Topic's delete changes.
 */
export function loadTopicMentionedUserIds(topicId: string): Promise<string[]> {
	return loadMentionedUserIds(eq(comments.targetTopicId, topicId))
}

/**
 * Returns the users that the Comments on a Topic Post mention, whose cached reads the Topic Post's delete changes.
 */
export function loadTopicPostMentionedUserIds(topicPostId: string): Promise<string[]> {
	return loadMentionedUserIds(eq(comments.postId, topicPostId))
}

/**
 * Returns the users that the Comments on the Podcast Episodes mention, whose cached reads the Podcast Episodes'
 * removal changes.
 */
export function loadPodcastEpisodeMentionedUserIds(
	podcastEpisodeIds: string[],
	handle: DbHandle = db,
): Promise<string[]> {
	return loadMentionedUserIds(inArray(comments.podcastEpisodeId, podcastEpisodeIds), handle)
}

// the distinct users mentioned by the Comments that the filter keeps
async function loadMentionedUserIds(commentFilter: SQL | undefined, handle: DbHandle = db): Promise<string[]> {
	const mentionRows = await handle
		.selectDistinct({ mentionedUserId: commentMentions.mentionedUserId })
		.from(commentMentions)
		.innerJoin(comments, eq(comments.id, commentMentions.commentId))
		.where(commentFilter)
	return mentionRows.map((mentionRow) => mentionRow.mentionedUserId)
}
