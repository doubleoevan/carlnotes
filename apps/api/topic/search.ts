// the site search's topic reader: the topics whose name contains the query, under the topic view rules in SQL
import type { TopicSearchRow } from "@carlnotes/contracts/search"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { db } from "@carlnotes/db"
import { topics } from "@carlnotes/db/schema/topics"
import { and, like, type SQL, sql } from "drizzle-orm"
import { toContainsLikePattern } from "../likePattern"
import { loadLatestPodcastEpisodeSummaries } from "../podcast/podcastEpisodeShapes"
import { loadSubscribedTopicIds, toTopicViewFilter } from "./permissions"

// who is searching, whether they are an admin, the trimmed query, the most rows to read, and the filter a topic's tags
// must pass
type SearchTopicsOptions = {
	userId: string | null
	isAdmin: boolean
	query: string
	limit: number
	topicTagFilter?: SQL
}

/**
 * Returns the topics whose name contains the query and that the user may open, shortest name first, each with its
 * latest podcast episode the user may listen to and whether the user subscribes to it.
 */
export async function searchTopics(searchTopicsOptions: SearchTopicsOptions): Promise<TopicSearchRow[]> {
	const topicRows = await toTopicSearchQuery(searchTopicsOptions)
	if (topicRows.length === 0) {
		return []
	}

	// each topic's latest podcast episode, and the topics a signed-in user subscribes to
	const { userId } = searchTopicsOptions
	const [latestPodcastEpisodeByTopicId, subscribedTopicIds] = await Promise.all([
		loadLatestPodcastEpisodeSummaries(topicRows, userId),
		userId
			? loadSubscribedTopicIds(
					userId,
					topicRows.map((topicRow) => topicRow.id),
				)
			: Promise.resolve(null),
	])

	// shape each topic as a search row
	return topicRows.map((topicRow) => ({
		kind: "topic",
		id: topicRow.id,
		name: topicRow.name,
		path: toTopicPath(topicRow),
		date: topicRow.createdAt.toISOString(),
		count: topicRow.viewerCount,
		topic: {
			id: topicRow.id,
			name: topicRow.name,
			latestPodcastEpisode: latestPodcastEpisodeByTopicId.get(topicRow.id) ?? null,
		},
		subscriberCount: topicRow.subscriberCount,
		isSubscribed: subscribedTopicIds ? subscribedTopicIds.has(topicRow.id) : null,
	}))
}

/**
 * Returns the topic search's query: the name match under the view rules, shorter names first.
 */
// biome-ignore lint/nursery/useExplicitReturnType: drizzle's select builder type is generated, and naming it here would break on an upgrade
export function toTopicSearchQuery({ userId, isAdmin, query, limit, topicTagFilter }: SearchTopicsOptions) {
	// the name match, with the typed characters escaped so none acts as a wildcard
	const isNameMatch = like(sql`lower(${topics.name})`, toContainsLikePattern(query))

	// an admin may open every topic, and everyone else the topics the view rules allow
	return db
		.select({
			id: topics.id,
			name: topics.name,
			ownerId: topics.ownerId,
			visibility: topics.visibility,
			createdAt: topics.createdAt,
			viewerCount: topics.viewerCount,
			subscriberCount: topics.subscriberCount,
		})
		.from(topics)
		.where(and(isNameMatch, isAdmin ? undefined : toTopicViewFilter(userId), topicTagFilter))
		.orderBy(sql`length(${topics.name})`, topics.id)
		.limit(limit)
}
