// the ids of the home's cards: the home topics and podcast episodes, the pinned ones first and then the trending
// ones to fill, and the newest podcast episodes, from one cached read every replica shares

import { HOME_PODCAST_EPISODE_COUNT, HOME_TOPIC_COUNT, NEW_PODCAST_EPISODE_DAYS } from "@carlnotes/contracts/home"
import { DAY_MS } from "@carlnotes/contracts/time"
import { db, isPublicAndShown } from "@carlnotes/db"
import { cacheJson } from "@carlnotes/db/redis"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { and, asc, desc, eq, gte, isNotNull, sql } from "drizzle-orm"
import { HOME_CARD_IDS_KEY } from "../topic/feedCaches"

// how long every replica serves the same ids before one reads them again
const HOME_CARD_IDS_TTL_MS = 60_000

// how many published podcast episodes the home read takes before keeping one per topic, and the most new podcast episodes
// of a week the home shows
const PODCAST_EPISODE_CANDIDATE_LIMIT = 60
const NEW_PODCAST_EPISODE_LIMIT = 100

// the home topic ids, the home podcast episode ids, and the newest podcast episode ids, each in the order the
// home shows them
export type HomeCardIds = {
	homeTopicIds: string[]
	homePodcastEpisodeIds: string[]
	newestPodcastEpisodeIds: string[]
}

/**
 * Returns the ids of the home's cards, read through the shared cache: the pinned topics in their order and then the trending
 * public shown topics until twelve, and the pinned podcast episodes and then the most listened published ones of public
 * shown topics, one per topic, until twelve, and the podcast episodes of public shown topics published in the last week.
 */
export function loadHomeCardIds(): Promise<HomeCardIds> {
	return cacheJson({ key: HOME_CARD_IDS_KEY, ttlMs: HOME_CARD_IDS_TTL_MS, load: loadHomeCardIdsFromDatabase })
}

// read the three id lists from the database
async function loadHomeCardIdsFromDatabase(): Promise<HomeCardIds> {
	const [homeTopicIds, homePodcastEpisodeIds, newestPodcastEpisodeIds] = await Promise.all([
		loadHomeTopicIds(),
		loadHomePodcastEpisodeIds(),
		loadNewestPodcastEpisodeIds(),
	])
	return { homeTopicIds, homePodcastEpisodeIds, newestPodcastEpisodeIds }
}

// the pinned public shown topics in their order, then the trending ones: most viewed, then most followed, then newest
async function loadHomeTopicIds(): Promise<string[]> {
	const topicRows = await db
		.select({ id: topics.id })
		.from(topics)
		.where(isPublicAndShown)
		.orderBy(
			sql`${topics.homeOrder} is null`,
			asc(topics.homeOrder),
			desc(topics.viewerCount),
			desc(topics.subscriberCount),
			desc(topics.createdAt),
		)
		.limit(HOME_TOPIC_COUNT)
	return topicRows.map((topicRow) => topicRow.id)
}

// the pinned published podcast episodes of public shown topics in their order, then the most listened, newest first
// among ties, one per topic
async function loadHomePodcastEpisodeIds(): Promise<string[]> {
	const podcastEpisodeRows = await db
		.select({ id: podcastEpisodes.id, topicId: podcastEpisodes.topicId })
		.from(podcastEpisodes)
		.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.where(and(eq(podcastEpisodes.status, "published"), isNotNull(podcastEpisodes.publishedAt), isPublicAndShown))
		.orderBy(
			sql`${podcastEpisodes.homeOrder} is null`,
			asc(podcastEpisodes.homeOrder),
			desc(podcastEpisodes.listenerCount),
			desc(podcastEpisodes.publishedAt),
		)
		.limit(PODCAST_EPISODE_CANDIDATE_LIMIT)

	// one podcast episode per topic, in the order read
	const podcastEpisodeTopicIds = new Set<string>()
	const podcastEpisodeIds: string[] = []
	for (const podcastEpisodeRow of podcastEpisodeRows) {
		if (podcastEpisodeIds.length >= HOME_PODCAST_EPISODE_COUNT) {
			break
		}
		// the first podcast episode read for a topic is the one the home shows
		if (podcastEpisodeRow.topicId && !podcastEpisodeTopicIds.has(podcastEpisodeRow.topicId)) {
			podcastEpisodeTopicIds.add(podcastEpisodeRow.topicId)
			podcastEpisodeIds.push(podcastEpisodeRow.id)
		}
	}
	return podcastEpisodeIds
}

// the podcast episodes of public shown topics published in the last week, newest first
async function loadNewestPodcastEpisodeIds(): Promise<string[]> {
	const publishedSince = new Date(Date.now() - NEW_PODCAST_EPISODE_DAYS * DAY_MS)
	const podcastEpisodeRows = await db
		.select({ id: podcastEpisodes.id })
		.from(podcastEpisodes)
		.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.where(
			and(eq(podcastEpisodes.status, "published"), gte(podcastEpisodes.publishedAt, publishedSince), isPublicAndShown),
		)
		.orderBy(desc(podcastEpisodes.publishedAt))
		// ponytail: limits a burst week. page on the server past it
		.limit(NEW_PODCAST_EPISODE_LIMIT)
	return podcastEpisodeRows.map((podcastEpisodeRow) => podcastEpisodeRow.id)
}
