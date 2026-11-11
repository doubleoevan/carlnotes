// the ids of the home's cards: the home topics, films, podcast episodes, and Topic Posts, the pinned ones first and
// then the trending or newest ones to fill, and the week's new films, podcast episodes, and Topic Posts, from one
// cached read every replica shares

import {
	HOME_PODCAST_EPISODE_COUNT,
	HOME_TOPIC_COUNT,
	HOME_TOPIC_POST_COUNT,
	NEW_PODCAST_EPISODE_DAYS,
	NEW_TOPIC_POST_DAYS,
} from "@carlnotes/contracts/home"
import { DAY_MS } from "@carlnotes/contracts/time"
import { db, isPublicAndShown } from "@carlnotes/db"
import { cacheJson } from "@carlnotes/db/redis"
import { podcastEpisodes, topicPodcastEpisodeVideos } from "@carlnotes/db/schema/podcast"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import { and, asc, desc, eq, gte, isNotNull, sql } from "drizzle-orm"
import { HOME_CARD_IDS_KEY } from "../topic/feedCaches"

// how long every replica serves the same ids before one reads them again
const HOME_CARD_IDS_TTL_MS = 60_000

// how many published podcast episodes and how many published Topic Posts the home read takes before keeping one per
// topic, and the most new podcast episodes and the most new Topic Posts of a week the home shows
const PODCAST_EPISODE_CANDIDATE_LIMIT = 60
const TOPIC_POST_CANDIDATE_LIMIT = 60
const NEW_PODCAST_EPISODE_LIMIT = 100
const NEW_TOPIC_POST_LIMIT = 100

// the home topic ids, the podcast episode ids of the home films and the newest films, the home and newest podcast
// episode ids, and the home and newest Topic Post ids, each in the order the home shows them. the film lists and the
// newest Topic Post ids are optional. ids cached before they were read have none
export type HomeCardIds = {
	homeTopicIds: string[]
	homeFilmPodcastEpisodeIds?: string[]
	newestFilmPodcastEpisodeIds?: string[]
	homePodcastEpisodeIds: string[]
	newestPodcastEpisodeIds: string[]
	// the pinned and newest Topic Posts, then the week's
	homeTopicPostIds?: string[]
	newestTopicPostIds?: string[]
}

/**
 * Returns the ids of the home's cards, read through the shared cache: the pinned topics in their order and then the trending
 * public shown topics until twelve, the pinned podcast episodes and then the most listened published ones of public
 * shown topics, one per topic, until twelve, the pinned Topic Posts and then the newest published ones of public shown
 * topics, one per topic, until twelve, and the podcast episodes and the Topic Posts of public shown topics published
 * in the last week. The films follow the podcast episodes' rules, over the podcast episodes that have a ready film.
 */
export function loadHomeCardIds(): Promise<HomeCardIds> {
	return cacheJson({ key: HOME_CARD_IDS_KEY, ttlMs: HOME_CARD_IDS_TTL_MS, load: loadHomeCardIdsFromDatabase })
}

// read the seven id lists from the database
async function loadHomeCardIdsFromDatabase(): Promise<HomeCardIds> {
	// the seven reads together, in the order the home shows their sections
	const [
		homeTopicIds,
		homeFilmPodcastEpisodeIds,
		newestFilmPodcastEpisodeIds,
		homePodcastEpisodeIds,
		newestPodcastEpisodeIds,
		homeTopicPostIds,
		newestTopicPostIds,
	] = await Promise.all([
		loadHomeTopicIds(),
		loadHomePodcastEpisodeIds({ isFilmRead: true }),
		loadNewestPodcastEpisodeIds({ isFilmRead: true }),
		loadHomePodcastEpisodeIds({ isFilmRead: false }),
		loadNewestPodcastEpisodeIds({ isFilmRead: false }),
		loadHomeTopicPostIds(),
		loadNewestTopicPostIds(),
	])

	// each list under its name
	return {
		homeTopicIds,
		homeFilmPodcastEpisodeIds,
		newestFilmPodcastEpisodeIds,
		homePodcastEpisodeIds,
		newestPodcastEpisodeIds,
		homeTopicPostIds,
		newestTopicPostIds,
	}
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

// whether a home read covers the podcast episodes that have a ready film, in their films' order, or all of them
type HomePodcastEpisodeReadOptions = { isFilmRead: boolean }

// the published podcast episodes of public shown topics
const isPublishedPodcastEpisodeOfShownTopic = and(
	eq(podcastEpisodes.status, "published"),
	isNotNull(podcastEpisodes.publishedAt),
	isPublicAndShown,
)

// the pinned published podcast episodes of public shown topics in their order, then the most listened, newest first
// among ties, one per topic. a film read keeps the ones with a ready film, in their films' order, each named by its
// podcast episode's id
async function loadHomePodcastEpisodeIds({ isFilmRead }: HomePodcastEpisodeReadOptions): Promise<string[]> {
	// a film read orders by the position the film's own row holds
	const homeOrderColumn = isFilmRead ? topicPodcastEpisodeVideos.homeOrder : podcastEpisodes.homeOrder
	const podcastEpisodeRows = await toHomePodcastEpisodeQuery({ isFilmRead })
		.where(isPublishedPodcastEpisodeOfShownTopic)
		.orderBy(
			sql`${homeOrderColumn} is null`,
			asc(homeOrderColumn),
			desc(podcastEpisodes.listenerCount),
			desc(podcastEpisodes.publishedAt),
		)
		.limit(PODCAST_EPISODE_CANDIDATE_LIMIT)
	return toFirstIdsPerTopic(podcastEpisodeRows, HOME_PODCAST_EPISODE_COUNT)
}

// the read of podcast episodes with their topics, joined to the ready films if the read is the films'
// biome-ignore lint/nursery/useExplicitReturnType: the query's type is drizzle's generated builder type
function toHomePodcastEpisodeQuery({ isFilmRead }: HomePodcastEpisodeReadOptions) {
	const podcastEpisodeQuery = db
		.select({ id: podcastEpisodes.id, topicId: podcastEpisodes.topicId })
		.from(podcastEpisodes)
		.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.$dynamic()

	// a film read reaches a podcast episode only through its ready film
	return isFilmRead
		? podcastEpisodeQuery.innerJoin(topicPodcastEpisodeVideos, isReadyFilmOfPodcastEpisode)
		: podcastEpisodeQuery
}

// a film row that is ready and belongs to the podcast episode
export const isReadyFilmOfPodcastEpisode = and(
	eq(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodes.id),
	eq(topicPodcastEpisodeVideos.status, "ready"),
)

// the pinned published Topic Posts of public shown topics in their order, then the newest, one per topic
async function loadHomeTopicPostIds(): Promise<string[]> {
	// the published posts of public shown topics, the pinned ones first
	const topicPostRows = await db
		.select({ id: topicPosts.id, topicId: topicPosts.topicId })
		.from(topicPosts)
		.innerJoin(topics, eq(topics.id, topicPosts.topicId))
		.where(and(isNotNull(topicPosts.publishedAt), isPublicAndShown))
		.orderBy(sql`${topicPosts.homeOrder} is null`, asc(topicPosts.homeOrder), desc(topicPosts.publishedAt))
		.limit(TOPIC_POST_CANDIDATE_LIMIT)

	// one Topic Post per topic, in the order read
	return toFirstIdsPerTopic(topicPostRows, HOME_TOPIC_POST_COUNT)
}

// the Topic Posts of public shown topics published in the last week, newest first, pinned or not
async function loadNewestTopicPostIds(): Promise<string[]> {
	// the week starts seven days back
	const publishedSince = new Date(Date.now() - NEW_TOPIC_POST_DAYS * DAY_MS)

	// the week's published posts of public shown topics
	const topicPostRows = await db
		.select({ id: topicPosts.id })
		.from(topicPosts)
		.innerJoin(topics, eq(topics.id, topicPosts.topicId))
		.where(and(gte(topicPosts.publishedAt, publishedSince), isPublicAndShown))
		.orderBy(desc(topicPosts.publishedAt))
		// ponytail: limits a burst week. page on the server past it
		.limit(NEW_TOPIC_POST_LIMIT)
	return topicPostRows.map((topicPostRow) => topicPostRow.id)
}

/**
 * Returns the ids of the first row read of each topic, in the order read, up to a count.
 */
export function toFirstIdsPerTopic(rows: { id: string; topicId: string | null }[], count: number): string[] {
	// the topics with a row shown, and the ids kept
	const shownTopicIds = new Set<string>()
	const rowIds: string[] = []
	for (const row of rows) {
		if (rowIds.length >= count) {
			break
		}
		// the first row read for a topic is the one the home shows
		if (row.topicId && !shownTopicIds.has(row.topicId)) {
			shownTopicIds.add(row.topicId)
			rowIds.push(row.id)
		}
	}
	return rowIds
}

// the podcast episodes of public shown topics published in the last week, newest first. a film read keeps the ones
// with a ready film, each named by its podcast episode's id
async function loadNewestPodcastEpisodeIds({ isFilmRead }: HomePodcastEpisodeReadOptions): Promise<string[]> {
	// the week starts seven days back
	const publishedSince = new Date(Date.now() - NEW_PODCAST_EPISODE_DAYS * DAY_MS)
	const podcastEpisodeRows = await toHomePodcastEpisodeQuery({ isFilmRead })
		.where(and(isPublishedPodcastEpisodeOfShownTopic, gte(podcastEpisodes.publishedAt, publishedSince)))
		.orderBy(desc(podcastEpisodes.publishedAt))
		// ponytail: limits a burst week. page on the server past it
		.limit(NEW_PODCAST_EPISODE_LIMIT)
	return podcastEpisodeRows.map((podcastEpisodeRow) => podcastEpisodeRow.id)
}
