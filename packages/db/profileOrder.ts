// a topic's, a podcast episode's, and a film's position among the rows their topic's owner featured on their profile,
// and a Topic Post's among the ones its author featured on theirs: the writes, each within its limit except a Topic
// Post's, which has none, and the releases that a visibility change, a delete, a removed podcast episode, and a
// deleted Topic Post share

import {
	PROFILE_PODCAST_EPISODE_LIMIT,
	PROFILE_TOPIC_LIMIT,
	PROFILE_TOPIC_VIDEO_LIMIT,
} from "@carlnotes/contracts/profilePage"
import { and, eq, inArray, isNotNull, type SQL } from "drizzle-orm"
import { type FeaturedOrder, releaseFeaturedOrder, setFeaturedOrder } from "./featuredOrder"
import { type DbHandle, type DbTransaction, db } from "./index"
import { podcastEpisodes, topicVideos } from "./schema/podcast"
import { topicPosts } from "./schema/topicPosts"
import { topics } from "./schema/topics"

// a row to feature, the owner whose profile order it joins, and the position, inside the caller's transaction
type SetProfileOrderOptions = { id: string; ownerId: string; position: number; transaction: DbTransaction }

/**
 * Sets a topic's position among the topics its owner featured on their profile. Position 0 clears it. Returns false and
 * changes nothing if the owner's featured items are at their limit and the topic is not featured yet.
 */
export function setTopicProfileOrder({ id, ownerId, position, transaction }: SetProfileOrderOptions): Promise<boolean> {
	return setFeaturedOrder({
		featuredOrder: toTopicProfileOrder(ownerId),
		id,
		position,
		limit: PROFILE_TOPIC_LIMIT,
		transaction,
	})
}

/**
 * Sets a podcast episode's position among the podcast episodes its topic's owner featured on their profile, with the
 * topic's rules.
 */
export function setPodcastEpisodeProfileOrder({
	id,
	ownerId,
	position,
	transaction,
}: SetProfileOrderOptions): Promise<boolean> {
	return setFeaturedOrder({
		featuredOrder: toPodcastEpisodeProfileOrder(ownerId),
		id,
		position,
		limit: PROFILE_PODCAST_EPISODE_LIMIT,
		transaction,
	})
}

/**
 * Sets a film's position among the films its topic's owner featured on their profile, with the topic's rules. The id
 * is the film's own.
 */
export function setTopicVideoProfileOrder({
	id,
	ownerId,
	position,
	transaction,
}: SetProfileOrderOptions): Promise<boolean> {
	return setFeaturedOrder({
		featuredOrder: toTopicVideoProfileOrder(ownerId),
		id,
		position,
		limit: PROFILE_TOPIC_VIDEO_LIMIT,
		transaction,
	})
}

/**
 * Sets a Topic Post's position among the Topic Posts its author featured on their profile, with the topic's rules and
 * no limit. The owner is the post's author.
 */
export function setTopicPostProfileOrder({
	id,
	ownerId,
	position,
	transaction,
}: SetProfileOrderOptions): Promise<boolean> {
	return setFeaturedOrder({ featuredOrder: toTopicPostProfileOrder(ownerId), id, position, transaction })
}

/**
 * Clears a topic's profile order and the profile orders of its podcast episodes, their films, and its Topic Posts,
 * closing each gap among the featured items of the topic's owner and of each post's author. Returns the ids of the users whose
 * featured items changed.
 */
export async function releaseTopicProfileOrders(topicId: string, handle: DbHandle = db): Promise<string[]> {
	// the topic's owner, whose featured items the topic, its podcast episodes, and their films sit among
	const [topicRow] = await handle.select({ ownerId: topics.ownerId }).from(topics).where(eq(topics.id, topicId))
	if (!topicRow) {
		return []
	}

	// the topic's featured Topic Posts, each released among its own author's featured items
	const featuredTopicPostRows = await handle
		.select({ id: topicPosts.id, authorUserId: topicPosts.authorUserId })
		.from(topicPosts)
		.where(and(eq(topicPosts.topicId, topicId), isNotNull(topicPosts.profileOrder)))
	for (const { id, authorUserId } of featuredTopicPostRows) {
		await releaseFeaturedOrder({ featuredOrder: toTopicPostProfileOrder(authorUserId), id, handle })
	}

	// the topic's featured podcast episodes, each released on its own so the gap closes each time
	const featuredPodcastEpisodeRows = await handle
		.select({ id: podcastEpisodes.id })
		.from(podcastEpisodes)
		.where(and(eq(podcastEpisodes.topicId, topicId), isNotNull(podcastEpisodes.profileOrder)))
	const podcastEpisodeProfileOrder = toPodcastEpisodeProfileOrder(topicRow.ownerId)
	for (const { id } of featuredPodcastEpisodeRows) {
		await releaseFeaturedOrder({ featuredOrder: podcastEpisodeProfileOrder, id, handle })
	}

	// the featured films of the topic's podcast episodes
	const filmOwnerIds = await releaseFeaturedTopicVideos(eq(podcastEpisodes.topicId, topicId), handle)

	// then the topic's own featured position
	const isTopicOrderReleased = await releaseFeaturedOrder({
		featuredOrder: toTopicProfileOrder(topicRow.ownerId),
		id: topicId,
		handle,
	})
	const isOwnerOrderReleased = isTopicOrderReleased || featuredPodcastEpisodeRows.length > 0 || filmOwnerIds.length > 0

	// the owner if their featured items changed, and each author whose post was released, each named once
	return [
		...new Set([
			...(isOwnerOrderReleased ? [topicRow.ownerId] : []),
			...featuredTopicPostRows.map((featuredTopicPostRow) => featuredTopicPostRow.authorUserId),
		]),
	]
}

/**
 * Clears a podcast episode's profile order and closes the gap among its topic's owner's featured items. Returns the owner's id
 * if it had one, or null.
 */
export async function releasePodcastEpisodeProfileOrder(
	podcastEpisodeId: string,
	handle: DbHandle = db,
): Promise<string | null> {
	// the owner of the podcast episode's topic. an episode whose topic is gone is not featured
	const [ownerRow] = await handle
		.select({ ownerId: topics.ownerId })
		.from(podcastEpisodes)
		.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.where(eq(podcastEpisodes.id, podcastEpisodeId))
	if (!ownerRow) {
		return null
	}

	// release its featured position among that owner's featured podcast episodes
	const isReleased = await releaseFeaturedOrder({
		featuredOrder: toPodcastEpisodeProfileOrder(ownerRow.ownerId),
		id: podcastEpisodeId,
		handle,
	})
	return isReleased ? ownerRow.ownerId : null
}

/**
 * Clears the profile order of the films of the given podcast episodes, closing each gap among the featured films of its
 * topic's owner. Returns the ids of the owners whose featured items changed.
 */
export function releaseTopicVideoProfileOrders(podcastEpisodeIds: string[], handle: DbHandle = db): Promise<string[]> {
	return releaseFeaturedTopicVideos(inArray(topicVideos.podcastEpisodeId, podcastEpisodeIds), handle)
}

// release the featured films a filter keeps, each among the featured films of its topic's owner, one at a time so each
// gap closes. returns the ids of the owners whose featured items changed, each named once
async function releaseFeaturedTopicVideos(filmFilter: SQL, handle: DbHandle): Promise<string[]> {
	// the featured films with the owners of their topics
	const featuredFilmRows = await handle
		.select({ id: topicVideos.id, ownerId: topics.ownerId })
		.from(topicVideos)
		.innerJoin(podcastEpisodes, eq(podcastEpisodes.id, topicVideos.podcastEpisodeId))
		.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.where(and(filmFilter, isNotNull(topicVideos.profileOrder)))

	// release each in turn
	for (const { id, ownerId } of featuredFilmRows) {
		await releaseFeaturedOrder({ featuredOrder: toTopicVideoProfileOrder(ownerId), id, handle })
	}
	return [...new Set(featuredFilmRows.map((featuredFilmRow) => featuredFilmRow.ownerId))]
}

/**
 * Clears a Topic Post's profile order and closes the gap among its author's featured items. Returns the author's id if it had
 * one, or null.
 */
export async function releaseTopicPostProfileOrder(topicPostId: string, handle: DbHandle = db): Promise<string | null> {
	// the post's author, whose featured items it sits among
	const [topicPostRow] = await handle
		.select({ authorUserId: topicPosts.authorUserId })
		.from(topicPosts)
		.where(eq(topicPosts.id, topicPostId))
	if (!topicPostRow) {
		return null
	}

	// release its featured position among that author's featured Topic Posts
	const isReleased = await releaseFeaturedOrder({
		featuredOrder: toTopicPostProfileOrder(topicPostRow.authorUserId),
		id: topicPostId,
		handle,
	})
	return isReleased ? topicPostRow.authorUserId : null
}

// the order of the topics one owner featured on their profile
function toTopicProfileOrder(ownerId: string): FeaturedOrder {
	return { table: topics, columnKey: "profileOrder", scopeFilter: eq(topics.ownerId, ownerId) }
}

// the order of the podcast episodes one owner featured on their profile, which are episodes of that owner's topics
function toPodcastEpisodeProfileOrder(ownerId: string): FeaturedOrder {
	return { table: podcastEpisodes, columnKey: "profileOrder", scopeFilter: toOwnerPodcastEpisodeFilter(ownerId) }
}

// the order of the films one owner featured on their profile, which are films of the podcast episodes of that owner's
// topics
function toTopicVideoProfileOrder(ownerId: string): FeaturedOrder {
	const ownerPodcastEpisodeIds = db
		.select({ id: podcastEpisodes.id })
		.from(podcastEpisodes)
		.where(toOwnerPodcastEpisodeFilter(ownerId))
	return {
		table: topicVideos,
		columnKey: "profileOrder",
		scopeFilter: inArray(topicVideos.podcastEpisodeId, ownerPodcastEpisodeIds),
	}
}

// the filter for the podcast episodes of one owner's topics
function toOwnerPodcastEpisodeFilter(ownerId: string): SQL {
	const ownerTopicIds = db.select({ id: topics.id }).from(topics).where(eq(topics.ownerId, ownerId))
	return inArray(podcastEpisodes.topicId, ownerTopicIds)
}

// the order of the Topic Posts one author featured on their profile
function toTopicPostProfileOrder(authorUserId: string): FeaturedOrder {
	return { table: topicPosts, columnKey: "profileOrder", scopeFilter: eq(topicPosts.authorUserId, authorUserId) }
}
