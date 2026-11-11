// the Podcast Episodes a page of the news plays: each Podcast Episode row's own, and the latest one of each Finding
// row's Topic, whose chapters put a play button on the Findings they narrate

import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { db } from "@carlnotes/db"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { inArray } from "drizzle-orm"
import { podcastEpisodeColumns } from "../podcast/podcastEpisodeRows"
import { loadLatestPodcastEpisodes, loadPodcastEpisodes } from "../podcast/podcastEpisodeShapes"
import type { NewsEventRow } from "./newsEventRows"

// what the loader reads of a row: its kind, its Topic, and the Podcast Episode it is about
type NewsPodcastEpisodeRow = Pick<NewsEventRow, "kind" | "topicId" | "podcastEpisodeId">

/**
 * Loads the Podcast Episodes a page's rows play, each once, with its chapters and the reader's progress. The read
 * that returned the rows already left out what the reader may not open.
 */
export async function loadNewsPodcastEpisodes(
	newsEventRows: NewsPodcastEpisodeRow[],
	userId: string | null,
): Promise<PodcastEpisode[]> {
	// the Podcast Episodes of the page's Podcast Episode rows, and the Topics of its Finding rows
	const { podcastEpisodeIds, findingTopicIds } = toNewsPodcastEpisodeIds(newsEventRows)
	const topicIds = [...new Set(newsEventRows.map((newsEventRow) => newsEventRow.topicId))]
	if (podcastEpisodeIds.length === 0 && findingTopicIds.length === 0) {
		return []
	}

	// the page's Topics, and the rows of the Podcast Episodes its rows are about
	const [topicRows, podcastEpisodeRows] = await Promise.all([
		db.select().from(topics).where(inArray(topics.id, topicIds)),
		podcastEpisodeIds.length > 0
			? db.select(podcastEpisodeColumns).from(podcastEpisodes).where(inArray(podcastEpisodes.id, podcastEpisodeIds))
			: [],
	])
	const topicsById = new Map(topicRows.map((topicRow) => [topicRow.id, topicRow]))

	// each row's own Podcast Episode, and the latest one of each Finding row's Topic
	const podcastEpisodeRowTopics = podcastEpisodeRows.flatMap((podcastEpisodeRow) => {
		const topic = topicsById.get(podcastEpisodeRow.topicId ?? "")
		return topic ? [{ podcastEpisodeRow, topic }] : []
	})
	const [rowPodcastEpisodes, latestPodcastEpisodes] = await Promise.all([
		loadPodcastEpisodes({ podcastEpisodeRowTopics, userId }),
		loadLatestPodcastEpisodes(
			topicRows.filter((topicRow) => findingTopicIds.includes(topicRow.id)),
			userId,
		),
	])

	// a Podcast Episode that is both a row's own and its Topic's latest returns once
	const podcastEpisodesById = new Map(
		[...rowPodcastEpisodes, ...latestPodcastEpisodes.values()].map((podcastEpisode) => [
			podcastEpisode.id,
			podcastEpisode,
		]),
	)
	return [...podcastEpisodesById.values()]
}

/**
 * Returns the ids of the Podcast Episodes a page's Podcast Episode rows are about, and of the Topics of its Finding
 * rows, each once.
 */
export function toNewsPodcastEpisodeIds(newsEventRows: NewsPodcastEpisodeRow[]): {
	podcastEpisodeIds: string[]
	findingTopicIds: string[]
} {
	const podcastEpisodeIds = newsEventRows.flatMap((newsEventRow) =>
		newsEventRow.kind === "podcastEpisode" && newsEventRow.podcastEpisodeId ? [newsEventRow.podcastEpisodeId] : [],
	)
	const findingTopicIds = newsEventRows.flatMap((newsEventRow) =>
		newsEventRow.kind === "finding" ? [newsEventRow.topicId] : [],
	)
	return { podcastEpisodeIds: [...new Set(podcastEpisodeIds)], findingTopicIds: [...new Set(findingTopicIds)] }
}
