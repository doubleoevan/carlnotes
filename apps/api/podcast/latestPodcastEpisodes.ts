// each topic's latest published podcast episode that the user may listen to, in the shape the player shows and in the
// shape a table row shows

import type { PodcastEpisode, PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import { db } from "@carlnotes/db"
import { memoizeInRequest, memoizeRowsById } from "@carlnotes/db/requestMemo"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { isAfterSubscriberActivation } from "@carlnotes/db/topicSubscriptions"
import { isPodcastEpisodeRecordingConfigured } from "@carlnotes/server/podcastEpisodeSettings"
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { topicSubscriptionStartDates } from "../topic/subscriptionStartDates"
import { podcastEpisodeColumns, type TopicRow } from "./podcastEpisodeRows"
import { loadPodcastEpisodeSummaries, loadPodcastEpisodes, type PodcastEpisodeRowTopic } from "./podcastEpisodeShapes"

// the topic fields that the latest podcast episode loaders read: the podcast episode's topic and its access check
type LatestPodcastEpisodeTopic = Pick<TopicRow, "id" | "name" | "ownerId" | "visibility" | "imageHash">

/**
 * Loads each topic's latest published podcast episode that the user may listen to, with its chapters, by topic id.
 */
export async function loadLatestPodcastEpisodes(
	topicRows: LatestPodcastEpisodeTopic[],
	userId: string | null,
): Promise<Map<string, PodcastEpisode>> {
	// load the chapters and the user's progress of each newest podcast episode the user may listen to, then key the
	// episodes by topic id
	const latestPodcastEpisodeRowTopics = await loadLatestPodcastEpisodeRowTopics(topicRows, userId)
	const latestPodcastEpisodes = await loadPodcastEpisodes({
		podcastEpisodeRowTopics: latestPodcastEpisodeRowTopics,
		userId,
	})
	return new Map(latestPodcastEpisodes.map((podcastEpisode) => [podcastEpisode.topicId, podcastEpisode]))
}

/**
 * Loads each topic's latest published podcast episode that the user may listen to, as a table row shows it with its
 * chapter count, by topic id. A request that asks again for the same user and topics, as a page's table and its cards
 * do, shares the first read.
 */
export function loadLatestPodcastEpisodeSummaries(
	topicRows: LatestPodcastEpisodeTopic[],
	userId: string | null,
): Promise<Map<string, PodcastEpisodeSummary>> {
	const topicIdsKey = topicRows
		.map((topicRow) => topicRow.id)
		.toSorted()
		.join(",")
	return memoizeInRequest(`latest-podcast-episode-summaries:${userId ?? ""}:${topicIdsKey}`, () =>
		readLatestPodcastEpisodeSummaries(topicRows, userId),
	)
}

// each topic's latest published podcast episode that the user may listen to, read for one request
async function readLatestPodcastEpisodeSummaries(
	topicRows: LatestPodcastEpisodeTopic[],
	userId: string | null,
): Promise<Map<string, PodcastEpisodeSummary>> {
	// count the chapters of each newest podcast episode the user may listen to, then key the summaries by topic id
	const latestPodcastEpisodeRowTopics = await loadLatestPodcastEpisodeRowTopics(topicRows, userId)
	const latestPodcastEpisodeSummaries = await loadPodcastEpisodeSummaries(latestPodcastEpisodeRowTopics)
	return new Map(
		latestPodcastEpisodeRowTopics.map(({ topic }, i) => [
			topic.id,
			latestPodcastEpisodeSummaries[i] as PodcastEpisodeSummary,
		]),
	)
}

// the names of a podcast episode's columns, which the subquery selects them under
const PODCAST_EPISODE_COLUMN_NAMES = Object.keys(podcastEpisodeColumns) as (keyof typeof podcastEpisodeColumns)[]

// a subquery's columns under the names its select gave them, as the query around it reads them
function toSubqueryColumns<Subquery extends Record<ColumnName, unknown>, ColumnName extends string>(
	subquery: Subquery,
	columnNames: readonly ColumnName[],
): Pick<Subquery, ColumnName> {
	return Object.fromEntries(columnNames.map((columnName) => [columnName, subquery[columnName]])) as Pick<
		Subquery,
		ColumnName
	>
}

/**
 * Loads each topic's newest published podcast episode that the user may listen to, with its topic. An older episode
 * never passes a gate that the newest episode fails, and a topic with no gate has no activation time.
 */
export async function loadLatestPodcastEpisodeRowTopics(
	topicRows: LatestPodcastEpisodeTopic[],
	userId: string | null,
): Promise<PodcastEpisodeRowTopic[]> {
	if (!isPodcastEpisodeRecordingConfigured() || topicRows.length === 0) {
		return []
	}

	// each topic's newest published podcast episode, each read once in a request, and when the user's subscription to
	// each gated topic activated
	const topicIds = topicRows.map((topicRow) => topicRow.id)
	const [latestPodcastEpisodeRows, subscriberActivatedAtByTopicId] = await Promise.all([
		memoizeRowsById("latest-podcast-episodes", topicIds, async (missingTopicIds) => {
			// the newest published podcast episode of each topic that no earlier read in the request read, by its topic,
			// read newest first on the topic's podcast episodes index and stopped at one row
			const latestPodcastEpisodes = db
				.select(podcastEpisodeColumns)
				.from(podcastEpisodes)
				.where(and(eq(podcastEpisodes.topicId, topics.id), eq(podcastEpisodes.status, "published")))
				.orderBy(desc(podcastEpisodes.publishedAt))
				.limit(1)
				.as("latest_podcast_episodes")

			// each asked-for topic joined to its newest published podcast episode, keyed by the topic
			const missingPodcastEpisodeRows = await db
				.select({ podcastEpisodeRow: toSubqueryColumns(latestPodcastEpisodes, PODCAST_EPISODE_COLUMN_NAMES) })
				.from(topics)
				.innerJoinLateral(latestPodcastEpisodes, sql`true`)
				.where(inArray(topics.id, missingTopicIds))
			return new Map(
				missingPodcastEpisodeRows.map(({ podcastEpisodeRow }) => [podcastEpisodeRow.topicId ?? "", podcastEpisodeRow]),
			)
		}).then((podcastEpisodeRowByTopicId) => [...podcastEpisodeRowByTopicId.values()]),
		topicSubscriptionStartDates(topicRows, userId),
	])

	// keep each newest podcast episode that the user may listen to, with its topic
	const topicById = new Map(topicRows.map((topicRow) => [topicRow.id, topicRow]))
	return latestPodcastEpisodeRows.flatMap((podcastEpisodeRow) => {
		// the episode's topic and the user's activation on it, which the episode's publish time has to pass
		const topic = podcastEpisodeRow.topicId ? topicById.get(podcastEpisodeRow.topicId) : undefined
		const subscriberActivatedAt = topic ? subscriberActivatedAtByTopicId.get(topic.id) : null
		return topic && isAfterSubscriberActivation(podcastEpisodeRow.publishedAt, subscriberActivatedAt)
			? [{ podcastEpisodeRow, topic }]
			: []
	})
}
