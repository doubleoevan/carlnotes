// the Comments a Topic's editors share with the podcast: the shared comment slots a Topic has for its next Podcast
// Episode, the share and its taking back, what a Scan and a podcast script read, and the links a shared Comment holds
import {
	hasFreeSharedCommentSlot,
	SHARED_COMMENT_CONTEXT_COUNT,
	SHARED_COMMENT_SLOTS,
	type SharedCommentSlots,
} from "@carlnotes/contracts/social"
import { toCommentLinkUrls } from "@carlnotes/contracts/socialText"
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, notInArray, type SQL, sql } from "drizzle-orm"
import { toVisibleAuthorFilter } from "./contentFilters"
import { type DbHandle, db, isFindingShown } from "./index"
import { hasFullPodcastEpisodes } from "./quotas"
import { findings } from "./schema/scans"
import { commentLinks, comments, reactions } from "./schema/social"
import { topics } from "./schema/topics"
import { users } from "./schema/users"

// the Topic whose shared comment slots are counted: its id, and the owner whose plan sets how many it has
type SharedCommentTopic = { id: string; ownerId: string }

// a shared Comment as a model reads it: who wrote it, null for Carl, and what it says
export type SharedCommentText = { username: string | null; body: string }

// a shared Comment as a Podcast Episode's script reads it, with the Finding it was written on, if any
export type PodcastSharedComment = SharedCommentText & { commentId: string; findingId: string | null }

// the columns a model reads of a shared Comment
const sharedCommentTextColumns = { username: users.username, body: comments.body }

// the owner of the Topic a shared Comment went to, read beside the Comment
const sharedCommentOwnerId = sql`(select ${topics.ownerId} from ${topics}
	where ${topics.id} = ${comments.sharedWithPodcastTopicId})`

/**
 * Returns the filter for a shared Comment that counts: its Finding is not rated thumbs down, its author is under no
 * admin block, and no user block stands between its author and the Topic's owner. One that fails takes no shared
 * comment slot, and no model or Scan reads it.
 */
export const isSharedCommentShown = and(
	sql`not exists (select 1 from ${findings} where ${findings.id} = ${comments.findingId} and not ${isFindingShown})`,
	toVisibleAuthorFilter(sharedCommentOwnerId, comments.authorUserId),
)

/**
 * Loads how many of a Topic's shared Comments wait for its next Podcast Episode, and how many may: five if the
 * Topic's owner gets full Podcast Episodes, three otherwise.
 */
export async function loadSharedCommentSlots(
	topic: SharedCommentTopic,
	handle: DbHandle = db,
): Promise<SharedCommentSlots> {
	const [isOwnerOnFullPodcastEpisodes, [usedRow]] = await Promise.all([
		hasFullPodcastEpisodes(topic.ownerId),
		handle
			.select({ usedCount: count() })
			.from(comments)
			.where(
				and(
					eq(comments.sharedWithPodcastTopicId, topic.id),
					isNull(comments.airedPodcastEpisodeId),
					isSharedCommentShown,
				),
			),
	])
	return {
		usedCount: usedRow?.usedCount ?? 0,
		slotCount: isOwnerOnFullPodcastEpisodes ? SHARED_COMMENT_SLOTS.full : SHARED_COMMENT_SLOTS.short,
	}
}

/**
 * Shares a Comment with the podcast if its Topic has a free shared comment slot, and queues the links in its body for
 * the Topic's next Scan. Returns whether the Comment is shared now. One already shared stays shared and takes no second
 * shared comment slot.
 */
export function shareCommentInFreeSharedCommentSlot({
	commentId,
	topic,
	body,
}: {
	commentId: string
	topic: SharedCommentTopic
	body: string
}): Promise<boolean> {
	return db.transaction(async (transaction) => {
		// one share at a time per Topic, so two editors never take the last shared comment slot together
		await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`shared-comments:${topic.id}`}))`)
		const [commentRow] = await transaction
			.select({ sharedWithPodcastAt: comments.sharedWithPodcastAt })
			.from(comments)
			.where(eq(comments.id, commentId))
		if (!commentRow || commentRow.sharedWithPodcastAt) {
			return Boolean(commentRow)
		}

		// a full Topic shares nothing more until an editor takes one back or the next Podcast Episode reads them
		if (!hasFreeSharedCommentSlot(await loadSharedCommentSlots(topic, transaction))) {
			return false
		}

		// share it, and queue its links
		await transaction
			.update(comments)
			.set({ sharedWithPodcastAt: new Date(), sharedWithPodcastTopicId: topic.id })
			.where(eq(comments.id, commentId))
		await syncCommentLinks({ commentId, topicId: topic.id, body, handle: transaction })
		return true
	})
}

/**
 * Takes a shared Comment back: it leaves every model context, its shared comment slot frees, and its links leave the
 * queue.
 */
export async function unshareComment(commentId: string, handle: DbHandle = db): Promise<void> {
	await handle.transaction(async (transaction) => {
		// the comment, then its queued links
		await transaction
			.update(comments)
			.set({ sharedWithPodcastAt: null, sharedWithPodcastTopicId: null, airedPodcastEpisodeId: null })
			.where(eq(comments.id, commentId))
		await transaction.delete(commentLinks).where(eq(commentLinks.commentId, commentId))
	})
}

/**
 * Makes a shared Comment's queued links match the urls in its body: a url the body dropped leaves the queue if no
 * Scan reviewed it yet, and a new url joins it.
 */
export async function syncCommentLinks({
	commentId,
	topicId,
	body,
	handle,
}: {
	commentId: string
	topicId: string
	body: string
	handle: DbHandle
}): Promise<void> {
	// drop the waiting links the body no longer holds
	const urls = toCommentLinkUrls(body)
	await handle
		.delete(commentLinks)
		.where(
			and(
				eq(commentLinks.commentId, commentId),
				isNull(commentLinks.consideredAt),
				urls.length > 0 ? notInArray(commentLinks.url, urls) : undefined,
			),
		)

	// queue each url once
	if (urls.length > 0) {
		await handle
			.insert(commentLinks)
			.values(urls.map((url) => ({ commentId, topicId, url })))
			.onConflictDoNothing()
	}
}

/**
 * Loads the Comments a Topic most recently shared with the podcast, newest first, for a Scan's scoring context.
 */
export function loadSharedCommentTexts(topicId: string): Promise<SharedCommentText[]> {
	// the newest few shared, with each author's name
	return db
		.select(sharedCommentTextColumns)
		.from(comments)
		.leftJoin(users, eq(users.id, comments.authorUserId))
		.where(and(eq(comments.sharedWithPodcastTopicId, topicId), isSharedCommentShown))
		.orderBy(desc(comments.sharedWithPodcastAt))
		.limit(SHARED_COMMENT_CONTEXT_COUNT)
}

/**
 * Loads the Topic's waiting shared Comments, most reactions first and then oldest shared.
 */
export function loadWaitingSharedComments(topicId: string): Promise<PodcastSharedComment[]> {
	return selectRankedSharedComments(
		and(eq(comments.sharedWithPodcastTopicId, topicId), isNull(comments.airedPodcastEpisodeId)),
	)
}

/**
 * Loads the shared Comments a Podcast Episode's script reads, most reactions first and then oldest shared.
 */
export function loadAiredSharedComments(podcastEpisodeId: string): Promise<PodcastSharedComment[]> {
	return selectRankedSharedComments(eq(comments.airedPodcastEpisodeId, podcastEpisodeId))
}

/**
 * Marks waiting shared Comments as read by a Podcast Episode's script, which frees their shared comment slots.
 */
export async function markSharedCommentsAired({
	commentIds,
	podcastEpisodeId,
}: {
	commentIds: string[]
	podcastEpisodeId: string
}): Promise<void> {
	if (commentIds.length === 0) {
		return
	}

	// a Comment an editor took back since the read stays out
	await db
		.update(comments)
		.set({ airedPodcastEpisodeId: podcastEpisodeId })
		.where(
			and(
				inArray(comments.id, commentIds),
				isNotNull(comments.sharedWithPodcastTopicId),
				isNull(comments.airedPodcastEpisodeId),
			),
		)
}

// the shared Comments that match, each with its author's name and its Finding, ranked by their reactions
function selectRankedSharedComments(filter: SQL | undefined): Promise<PodcastSharedComment[]> {
	return (
		db
			.select({ ...sharedCommentTextColumns, commentId: comments.id, findingId: comments.findingId })
			.from(comments)
			.leftJoin(users, eq(users.id, comments.authorUserId))
			// the join counts each Comment's reactions
			.leftJoin(reactions, eq(reactions.commentId, comments.id))
			.where(and(filter, isSharedCommentShown))
			.groupBy(comments.id, users.username)
			.orderBy(desc(count(reactions.id)), asc(comments.sharedWithPodcastAt))
	)
}

/**
 * Gives a Podcast Episode's shared Comments back, so they wait for the next one: all of them, or only the ones named.
 */
export async function releasePodcastEpisodeSharedComments(
	podcastEpisodeId: string,
	commentIds?: string[],
): Promise<void> {
	await db
		.update(comments)
		.set({ airedPodcastEpisodeId: null })
		.where(
			and(
				eq(comments.airedPodcastEpisodeId, podcastEpisodeId),
				commentIds ? inArray(comments.id, commentIds) : undefined,
			),
		)
}

/**
 * Loads the urls of a Topic's shared Comments that no Scan reviewed yet.
 */
export async function loadWaitingCommentLinkUrls(topicId: string): Promise<string[]> {
	const linkRows = await db
		.selectDistinct({ url: commentLinks.url })
		.from(commentLinks)
		.innerJoin(comments, eq(comments.id, commentLinks.commentId))
		.where(and(eq(commentLinks.topicId, topicId), isNull(commentLinks.consideredAt), isSharedCommentShown))
	return linkRows.map((linkRow) => linkRow.url)
}

/**
 * Marks a Topic's waiting Comment links as reviewed, so the next Scan leaves them alone.
 */
export async function considerCommentLinks(topicId: string, urls: string[]): Promise<void> {
	if (urls.length === 0) {
		return
	}

	// the waiting rows that hold those urls
	await db
		.update(commentLinks)
		.set({ consideredAt: new Date() })
		.where(and(eq(commentLinks.topicId, topicId), isNull(commentLinks.consideredAt), inArray(commentLinks.url, urls)))
}
