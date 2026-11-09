// the cards the home draws: topics and podcast episodes in the shape the shared cards read, with their images,
// bylines, reactions, and latest podcast episodes read in batches

import { type PodcastEpisodeCard, type TopicCard, toReactionCount } from "@carlnotes/contracts/home"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { toSocialTargetKey } from "@carlnotes/contracts/social"
import { toTopicImageUrlsOrNull } from "@carlnotes/contracts/topicImages"
import { db } from "@carlnotes/db"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { eq, inArray } from "drizzle-orm"
import { toProfileIdentity } from "../avatars"
import { podcastEpisodeColumns } from "../podcast/podcastEpisodeRows"
import { loadLatestPodcastEpisodeSummaries, loadPodcastEpisodeSummaries } from "../podcast/podcastEpisodeShapes"
import { loadReactionSummaries } from "../social/reactionRows"
import { loadTopicBylines } from "../topic/feedData"

// the topic row a card is built from
type TopicCardRow = typeof topics.$inferSelect

/**
 * Returns the topics' cards in the rows' order, for the user or a visitor.
 */
export async function toTopicCards(topicRows: TopicCardRow[], userId: string | null): Promise<TopicCard[]> {
	if (topicRows.length === 0) {
		return []
	}

	// each topic's owner, team, reactions, and latest podcast episode the user may listen to, read together
	const topicIds = topicRows.map((topicRow) => topicRow.id)
	const [{ ownerByTopic, teamLinkByTopic }, reactionSummaryByTarget, latestPodcastEpisodeByTopic] = await Promise.all([
		loadTopicBylines(topicIds, userId),
		loadReactionSummaries({ userId, targets: topicIds.map((id) => ({ kind: "topic" as const, id })) }),
		loadLatestPodcastEpisodeSummaries(topicRows, userId),
	])
	return topicRows.map((topicRow) => {
		const reactionSummary = reactionSummaryByTarget.get(toSocialTargetKey({ kind: "topic", id: topicRow.id }))
		return {
			id: topicRow.id,
			name: topicRow.name,
			path: toTopicPath(topicRow),
			image: toTopicImageUrlsOrNull(topicRow.id, topicRow.imageHash),
			tags: topicRow.tags,
			owner: toProfileIdentity(ownerByTopic.get(topicRow.id) ?? null),
			teamLink: teamLinkByTopic.get(topicRow.id) ?? null,
			reactionCount: reactionSummary ? toReactionCount(reactionSummary) : 0,
			latestPodcastEpisode: latestPodcastEpisodeByTopic.get(topicRow.id) ?? null,
		}
	})
}

/**
 * Returns the topics' cards in the ids' order, for the user or a visitor.
 */
export async function loadTopicCards(topicIds: string[], userId: string | null): Promise<TopicCard[]> {
	if (topicIds.length === 0) {
		return []
	}
	const topicRows = await db.select().from(topics).where(inArray(topics.id, topicIds))
	const topicRowById = new Map(topicRows.map((topicRow) => [topicRow.id, topicRow]))
	return toTopicCards(
		topicIds.flatMap((topicId) => topicRowById.get(topicId) ?? []),
		userId,
	)
}

/**
 * Returns the podcast episodes' cards in the ids' order, each with its topic's page and image.
 */
export async function loadPodcastEpisodeCards(podcastEpisodeIds: string[]): Promise<PodcastEpisodeCard[]> {
	if (podcastEpisodeIds.length === 0) {
		return []
	}

	// each episode's row with its topic, in the ids' order, then the summaries the player's rows show
	const podcastEpisodeRows = await db
		.select({
			podcastEpisodeRow: podcastEpisodeColumns,
			topic: { id: topics.id, name: topics.name, visibility: topics.visibility, imageHash: topics.imageHash },
		})
		.from(podcastEpisodes)
		.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.where(inArray(podcastEpisodes.id, podcastEpisodeIds))

	// the rows in the ids' order, then each summary with its topic's page and image
	const rowById = new Map(podcastEpisodeRows.map((row) => [row.podcastEpisodeRow.id, row]))
	const orderedRows = podcastEpisodeIds.flatMap((podcastEpisodeId) => rowById.get(podcastEpisodeId) ?? [])
	const podcastEpisodeSummaries = await loadPodcastEpisodeSummaries(orderedRows)
	return podcastEpisodeSummaries.map((podcastEpisode, index) => {
		const topic = orderedRows[index]?.topic
		return {
			podcastEpisode,
			topic: {
				id: topic?.id ?? "",
				name: topic?.name ?? "",
				path: topic ? toTopicPath(topic) : "",
				image: topic ? toTopicImageUrlsOrNull(topic.id, topic.imageHash) : null,
			},
		}
	})
}
