// a topic's, a podcast episode's, and a film's position among the rows their topic's owner pinned to their profile,
// and a Topic Post's among the ones its author pinned to theirs: the writes, each within its limit except a Topic
// Post's, which has none, and the releases that a visibility change, a delete, a removed podcast episode, and a
// deleted Topic Post share

import {
	PROFILE_PODCAST_EPISODE_LIMIT,
	PROFILE_TOPIC_LIMIT,
	PROFILE_TOPIC_PODCAST_EPISODE_VIDEO_LIMIT,
} from "@carlnotes/contracts/profilePage"
import { and, eq, inArray, isNotNull, type SQL } from "drizzle-orm"
import { type DbHandle, type DbTransaction, db } from "./index"
import { type PinnedOrder, releasePinnedOrder, setPinnedOrder } from "./pinnedOrder"
import { podcastEpisodes, topicPodcastEpisodeVideos } from "./schema/podcast"
import { topicPosts } from "./schema/topicPosts"
import { topics } from "./schema/topics"

// a row to pin, the owner whose profile order it joins, and the position, inside the caller's transaction
type SetProfileOrderOptions = { id: string; ownerId: string; position: number; transaction: DbTransaction }

/**
 * Sets a topic's position among the topics its owner pinned to their profile. Position 0 clears it. Returns false and
 * changes nothing if the owner's pins are at their limit and the topic is not pinned yet.
 */
export function setTopicProfileOrder({ id, ownerId, position, transaction }: SetProfileOrderOptions): Promise<boolean> {
	return setPinnedOrder({
		pinnedOrder: toTopicProfileOrder(ownerId),
		id,
		position,
		limit: PROFILE_TOPIC_LIMIT,
		transaction,
	})
}

/**
 * Sets a podcast episode's position among the podcast episodes its topic's owner pinned to their profile, with the
 * topic's rules.
 */
export function setPodcastEpisodeProfileOrder({
	id,
	ownerId,
	position,
	transaction,
}: SetProfileOrderOptions): Promise<boolean> {
	return setPinnedOrder({
		pinnedOrder: toPodcastEpisodeProfileOrder(ownerId),
		id,
		position,
		limit: PROFILE_PODCAST_EPISODE_LIMIT,
		transaction,
	})
}

/**
 * Sets a film's position among the films its topic's owner pinned to their profile, with the topic's rules. The id
 * is the film's own.
 */
export function setTopicPodcastEpisodeVideoProfileOrder({
	id,
	ownerId,
	position,
	transaction,
}: SetProfileOrderOptions): Promise<boolean> {
	return setPinnedOrder({
		pinnedOrder: toTopicPodcastEpisodeVideoProfileOrder(ownerId),
		id,
		position,
		limit: PROFILE_TOPIC_PODCAST_EPISODE_VIDEO_LIMIT,
		transaction,
	})
}

/**
 * Sets a Topic Post's position among the Topic Posts its author pinned to their profile, with the topic's rules and
 * no limit. The owner is the post's author.
 */
export function setTopicPostProfileOrder({
	id,
	ownerId,
	position,
	transaction,
}: SetProfileOrderOptions): Promise<boolean> {
	return setPinnedOrder({ pinnedOrder: toTopicPostProfileOrder(ownerId), id, position, transaction })
}

/**
 * Clears a topic's profile order and the profile orders of its podcast episodes, their films, and its Topic Posts,
 * closing each gap among the pins of the topic's owner and of each post's author. Returns the ids of the users whose
 * pins changed.
 */
export async function releaseTopicProfileOrders(topicId: string, handle: DbHandle = db): Promise<string[]> {
	// the topic's owner, whose pins the topic, its podcast episodes, and their films sit among
	const [topicRow] = await handle.select({ ownerId: topics.ownerId }).from(topics).where(eq(topics.id, topicId))
	if (!topicRow) {
		return []
	}

	// the topic's pinned Topic Posts, each released among its own author's pins
	const pinnedTopicPostRows = await handle
		.select({ id: topicPosts.id, authorUserId: topicPosts.authorUserId })
		.from(topicPosts)
		.where(and(eq(topicPosts.topicId, topicId), isNotNull(topicPosts.profileOrder)))
	for (const { id, authorUserId } of pinnedTopicPostRows) {
		await releasePinnedOrder({ pinnedOrder: toTopicPostProfileOrder(authorUserId), id, handle })
	}

	// the topic's pinned podcast episodes, each released on its own so the gap closes each time
	const pinnedPodcastEpisodeRows = await handle
		.select({ id: podcastEpisodes.id })
		.from(podcastEpisodes)
		.where(and(eq(podcastEpisodes.topicId, topicId), isNotNull(podcastEpisodes.profileOrder)))
	const podcastEpisodeProfileOrder = toPodcastEpisodeProfileOrder(topicRow.ownerId)
	for (const { id } of pinnedPodcastEpisodeRows) {
		await releasePinnedOrder({ pinnedOrder: podcastEpisodeProfileOrder, id, handle })
	}

	// the pinned films of the topic's podcast episodes
	const filmOwnerIds = await releasePinnedTopicPodcastEpisodeVideos(eq(podcastEpisodes.topicId, topicId), handle)

	// then the topic's own pin
	const isTopicOrderReleased = await releasePinnedOrder({
		pinnedOrder: toTopicProfileOrder(topicRow.ownerId),
		id: topicId,
		handle,
	})
	const isOwnerOrderReleased = isTopicOrderReleased || pinnedPodcastEpisodeRows.length > 0 || filmOwnerIds.length > 0

	// the owner if their pins changed, and each author whose post was released, each named once
	return [
		...new Set([
			...(isOwnerOrderReleased ? [topicRow.ownerId] : []),
			...pinnedTopicPostRows.map((pinnedTopicPostRow) => pinnedTopicPostRow.authorUserId),
		]),
	]
}

/**
 * Clears a podcast episode's profile order and closes the gap among its topic's owner's pins. Returns the owner's id
 * if it had one, or null.
 */
export async function releasePodcastEpisodeProfileOrder(
	podcastEpisodeId: string,
	handle: DbHandle = db,
): Promise<string | null> {
	// the owner of the podcast episode's topic. an episode whose topic is gone holds no pin
	const [ownerRow] = await handle
		.select({ ownerId: topics.ownerId })
		.from(podcastEpisodes)
		.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.where(eq(podcastEpisodes.id, podcastEpisodeId))
	if (!ownerRow) {
		return null
	}

	// release its pin among that owner's pinned podcast episodes
	const isReleased = await releasePinnedOrder({
		pinnedOrder: toPodcastEpisodeProfileOrder(ownerRow.ownerId),
		id: podcastEpisodeId,
		handle,
	})
	return isReleased ? ownerRow.ownerId : null
}

/**
 * Clears the profile order of the films of the given podcast episodes, closing each gap among the pinned films of its
 * topic's owner. Returns the ids of the owners whose pins changed.
 */
export function releaseTopicPodcastEpisodeVideoProfileOrders(
	podcastEpisodeIds: string[],
	handle: DbHandle = db,
): Promise<string[]> {
	return releasePinnedTopicPodcastEpisodeVideos(
		inArray(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodeIds),
		handle,
	)
}

// release the pinned films a filter keeps, each among the pinned films of its topic's owner, one at a time so each
// gap closes. returns the ids of the owners whose pins changed, each named once
async function releasePinnedTopicPodcastEpisodeVideos(filmFilter: SQL, handle: DbHandle): Promise<string[]> {
	// the pinned films with the owners of their topics
	const pinnedFilmRows = await handle
		.select({ id: topicPodcastEpisodeVideos.id, ownerId: topics.ownerId })
		.from(topicPodcastEpisodeVideos)
		.innerJoin(podcastEpisodes, eq(podcastEpisodes.id, topicPodcastEpisodeVideos.podcastEpisodeId))
		.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.where(and(filmFilter, isNotNull(topicPodcastEpisodeVideos.profileOrder)))

	// release each in turn
	for (const { id, ownerId } of pinnedFilmRows) {
		await releasePinnedOrder({ pinnedOrder: toTopicPodcastEpisodeVideoProfileOrder(ownerId), id, handle })
	}
	return [...new Set(pinnedFilmRows.map((pinnedFilmRow) => pinnedFilmRow.ownerId))]
}

/**
 * Clears a Topic Post's profile order and closes the gap among its author's pins. Returns the author's id if it had
 * one, or null.
 */
export async function releaseTopicPostProfileOrder(topicPostId: string, handle: DbHandle = db): Promise<string | null> {
	// the post's author, whose pins it sits among
	const [topicPostRow] = await handle
		.select({ authorUserId: topicPosts.authorUserId })
		.from(topicPosts)
		.where(eq(topicPosts.id, topicPostId))
	if (!topicPostRow) {
		return null
	}

	// release its pin among that author's pinned Topic Posts
	const isReleased = await releasePinnedOrder({
		pinnedOrder: toTopicPostProfileOrder(topicPostRow.authorUserId),
		id: topicPostId,
		handle,
	})
	return isReleased ? topicPostRow.authorUserId : null
}

// the order of the topics one owner pinned to their profile
function toTopicProfileOrder(ownerId: string): PinnedOrder {
	return { table: topics, columnKey: "profileOrder", scopeFilter: eq(topics.ownerId, ownerId) }
}

// the order of the podcast episodes one owner pinned to their profile, which are episodes of that owner's topics
function toPodcastEpisodeProfileOrder(ownerId: string): PinnedOrder {
	return { table: podcastEpisodes, columnKey: "profileOrder", scopeFilter: toOwnerPodcastEpisodeFilter(ownerId) }
}

// the order of the films one owner pinned to their profile, which are films of the podcast episodes of that owner's
// topics
function toTopicPodcastEpisodeVideoProfileOrder(ownerId: string): PinnedOrder {
	const ownerPodcastEpisodeIds = db
		.select({ id: podcastEpisodes.id })
		.from(podcastEpisodes)
		.where(toOwnerPodcastEpisodeFilter(ownerId))
	return {
		table: topicPodcastEpisodeVideos,
		columnKey: "profileOrder",
		scopeFilter: inArray(topicPodcastEpisodeVideos.podcastEpisodeId, ownerPodcastEpisodeIds),
	}
}

// the filter for the podcast episodes of one owner's topics
function toOwnerPodcastEpisodeFilter(ownerId: string): SQL {
	const ownerTopicIds = db.select({ id: topics.id }).from(topics).where(eq(topics.ownerId, ownerId))
	return inArray(podcastEpisodes.topicId, ownerTopicIds)
}

// the order of the Topic Posts one author pinned to their profile
function toTopicPostProfileOrder(authorUserId: string): PinnedOrder {
	return { table: topicPosts, columnKey: "profileOrder", scopeFilter: eq(topicPosts.authorUserId, authorUserId) }
}
