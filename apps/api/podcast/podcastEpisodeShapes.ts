// a podcast episode in the shape the player shows, with its chapters and the user's progress, and in the shape a table
// row shows, with its chapter count, and each topic's latest of either, limited to what the user may listen to
import type { PodcastEpisode, PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import { isPublishedPodcastEpisode } from "@carlnotes/contracts/podcast"
import { FULL_PODCAST_COVER_SIZE, SMALL_PODCAST_COVER_SIZE } from "@carlnotes/contracts/podcastEpisodes"
import { toPodcastEpisodePath } from "@carlnotes/contracts/seo"
import { db } from "@carlnotes/db"
import { podcastEpisodeChapters, podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { toPodcastCoverPath } from "@carlnotes/server/podcastCoverPaths"
import { isPodcastEpisodeRecordingConfigured } from "@carlnotes/server/podcastEpisodeSettings"
import { isVoiceChatConfigured } from "@carlnotes/server/voiceChat"
import { and, count, desc, eq, inArray } from "drizzle-orm"
import { topicSubscriptionStartDates } from "../topic/helpers"
import {
	isAfterSubscriberActivation,
	loadPodcastEpisodeListenRows,
	type PodcastEpisodeListenRow,
	type PodcastEpisodeRow,
	type PodcastEpisodeTopic,
	podcastEpisodeColumns,
	type TopicRow,
} from "./podcastEpisodeRows"

// the topic fields that the latest podcast episode loaders read: the podcast episode's topic and its access check
type LatestPodcastEpisodeTopic = Pick<TopicRow, "id" | "name" | "ownerId" | "visibility">

// a podcast episode's row and the topic that its page path is built from
export type PodcastEpisodeRowTopic = { podcastEpisodeRow: PodcastEpisodeRow; topic: PodcastEpisodeTopic }

// the row, topic, chapter rows if any, and listen row that a podcast episode is built from
type ToPodcastEpisodeOptions = PodcastEpisodeRowTopic & {
	podcastEpisodeChapterRows?: (typeof podcastEpisodeChapters.$inferSelect)[]
	podcastEpisodeListenRow?: PodcastEpisodeListenRow
}

// the row, topic, and chapter count that a podcast episode summary is built from
type ToPodcastEpisodeSummaryOptions = PodcastEpisodeRowTopic & { chapterCount: number }

// the podcast episode row, its topic, and the user, null for a visitor
type LoadPodcastEpisodeOptions = PodcastEpisodeRowTopic & { userId: string | null }

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
	const latestPodcastEpisodes = await loadPodcastEpisodes(latestPodcastEpisodeRowTopics, userId)
	return new Map(latestPodcastEpisodes.map((podcastEpisode) => [podcastEpisode.topicId, podcastEpisode]))
}

/**
 * Loads each topic's latest published podcast episode that the user may listen to, as a table row shows it with its
 * chapter count, by topic id.
 */
export async function loadLatestPodcastEpisodeSummaries(
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

/**
 * Loads a podcast episode as the player shows it, with its chapters and the user's progress.
 */
export async function loadPodcastEpisode({
	podcastEpisodeRow,
	topic,
	userId,
}: LoadPodcastEpisodeOptions): Promise<PodcastEpisode> {
	// a list with a single podcast episode returns that podcast episode
	const [podcastEpisode] = await loadPodcastEpisodes([{ podcastEpisodeRow, topic }], userId)
	return podcastEpisode as PodcastEpisode
}

/**
 * Loads podcast episodes in the shape that the player shows, each with its chapters and the user's progress, in the
 * order given.
 */
export async function loadPodcastEpisodes(
	podcastEpisodeRowTopics: PodcastEpisodeRowTopic[],
	userId: string | null,
): Promise<PodcastEpisode[]> {
	const podcastEpisodeIds = podcastEpisodeRowTopics.map(({ podcastEpisodeRow }) => podcastEpisodeRow.id)
	if (podcastEpisodeIds.length === 0) {
		return []
	}

	// every podcast episode's chapters in their order, and the user's progress through each episode
	const [podcastEpisodeChapterRows, podcastEpisodeListenRows] = await Promise.all([
		db
			.select()
			.from(podcastEpisodeChapters)
			.where(inArray(podcastEpisodeChapters.podcastEpisodeId, podcastEpisodeIds))
			.orderBy(podcastEpisodeChapters.position),
		loadPodcastEpisodeListenRows(userId, podcastEpisodeIds),
	])

	// build each podcast episode from its own chapters and listen row
	const chapterRowsByPodcastEpisodeId = Map.groupBy(
		podcastEpisodeChapterRows,
		(chapterRow) => chapterRow.podcastEpisodeId,
	)
	const listenRowByPodcastEpisodeId = new Map(
		podcastEpisodeListenRows.map((listenRow) => [listenRow.podcastEpisodeId, listenRow]),
	)
	return podcastEpisodeRowTopics.map(({ podcastEpisodeRow, topic }) =>
		toPodcastEpisode({
			podcastEpisodeRow,
			topic,
			podcastEpisodeChapterRows: chapterRowsByPodcastEpisodeId.get(podcastEpisodeRow.id),
			podcastEpisodeListenRow: listenRowByPodcastEpisodeId.get(podcastEpisodeRow.id),
		}),
	)
}

/**
 * Loads podcast episodes as a table row shows them, each with its chapter count from one count of every episode's
 * chapters, in the order given.
 */
export async function loadPodcastEpisodeSummaries(
	podcastEpisodeRowTopics: PodcastEpisodeRowTopic[],
): Promise<PodcastEpisodeSummary[]> {
	const podcastEpisodeIds = podcastEpisodeRowTopics.map(({ podcastEpisodeRow }) => podcastEpisodeRow.id)
	if (podcastEpisodeIds.length === 0) {
		return []
	}

	// every podcast episode's chapter count, then each summary with its own count
	const chapterCountRows = await db
		.select({ podcastEpisodeId: podcastEpisodeChapters.podcastEpisodeId, chapterCount: count() })
		.from(podcastEpisodeChapters)
		.where(inArray(podcastEpisodeChapters.podcastEpisodeId, podcastEpisodeIds))
		.groupBy(podcastEpisodeChapters.podcastEpisodeId)
	const chapterCountByPodcastEpisodeId = new Map(
		chapterCountRows.map((chapterCountRow) => [chapterCountRow.podcastEpisodeId, chapterCountRow.chapterCount]),
	)
	return podcastEpisodeRowTopics.map(({ podcastEpisodeRow, topic }) =>
		toPodcastEpisodeSummary({
			podcastEpisodeRow,
			topic,
			chapterCount: chapterCountByPodcastEpisodeId.get(podcastEpisodeRow.id) ?? 0,
		}),
	)
}

/**
 * Returns a podcast episode as the player shows it.
 */
export function toPodcastEpisode({
	podcastEpisodeRow,
	topic,
	podcastEpisodeChapterRows = [],
	podcastEpisodeListenRow,
}: ToPodcastEpisodeOptions): PodcastEpisode {
	// the fields the episode shares with its summary, its chapter count among them
	const podcastEpisodeSummary = toPodcastEpisodeSummary({
		podcastEpisodeRow,
		topic,
		chapterCount: podcastEpisodeChapterRows.length,
	})

	// map a removed status to failed. the loaders never return a removed podcast episode
	const status = podcastEpisodeRow.status === "removed" ? "failed" : podcastEpisodeRow.status

	// a podcast episode has a cover once it has a title
	const podcastCover = podcastEpisodeRow.title
		? { kind: "episode" as const, id: podcastEpisodeRow.id, title: podcastEpisodeRow.title }
		: null
	return {
		...podcastEpisodeSummary,
		topicId: podcastEpisodeRow.topicId ?? "",
		topicVisibility: topic.visibility,
		status,
		// the audio and the cover
		audioUrl: status === "published" ? `/api/episodes/${podcastEpisodeRow.id}/audio.mp3` : null,
		coverUrl: podcastCover ? toPodcastCoverPath(podcastCover, FULL_PODCAST_COVER_SIZE) : null,
		smallCoverUrl: podcastCover ? toPodcastCoverPath(podcastCover, SMALL_PODCAST_COVER_SIZE) : null,
		chapters: podcastEpisodeChapterRows.map(
			({ position, title, findingId, sourceUrl, rating, startSeconds, endSeconds }) => ({
				position,
				title,
				findingId,
				sourceUrl,
				rating,
				faviconPath: null,
				startSeconds,
				endSeconds,
			}),
		),
		// the user's progress
		progressSeconds: podcastEpisodeListenRow?.progressSeconds ?? 0,
		isCompleted: Boolean(podcastEpisodeListenRow?.completedAt),
		// whether the player may ask carl and vienna about the podcast episode
		isVoiceChatConfigured: isVoiceChatConfigured(),
	}
}

/**
 * Returns a podcast episode as a table row shows it, with its chapter count.
 */
export function toPodcastEpisodeSummary({
	podcastEpisodeRow,
	topic,
	chapterCount,
}: ToPodcastEpisodeSummaryOptions): PodcastEpisodeSummary {
	return {
		id: podcastEpisodeRow.id,
		title: podcastEpisodeRow.title,
		description: podcastEpisodeRow.description,
		// assigned on publish
		season: podcastEpisodeRow.season,
		episodeNumber: podcastEpisodeRow.episodeNumber,
		durationSeconds: podcastEpisodeRow.durationSeconds,
		publishedAt: podcastEpisodeRow.publishedAt?.toISOString() ?? null,
		// a published podcast episode has its own page
		pagePath: isPublishedPodcastEpisode(podcastEpisodeRow) ? toPodcastEpisodePath(topic, podcastEpisodeRow) : null,
		chapterCount,
	}
}

// each topic's newest published podcast episode that the user may listen to, with its topic. an older episode never
// passes a gate that the newest episode fails, and a topic with no gate has no activation time
async function loadLatestPodcastEpisodeRowTopics(
	topicRows: LatestPodcastEpisodeTopic[],
	userId: string | null,
): Promise<PodcastEpisodeRowTopic[]> {
	if (!isPodcastEpisodeRecordingConfigured() || topicRows.length === 0) {
		return []
	}

	// each topic's newest published podcast episode, and when the user's subscription to each gated topic activated
	const topicIds = topicRows.map((topicRow) => topicRow.id)
	const [latestPodcastEpisodeRows, subscriberActivatedAtByTopicId] = await Promise.all([
		db
			.selectDistinctOn([podcastEpisodes.topicId], podcastEpisodeColumns)
			.from(podcastEpisodes)
			.where(and(inArray(podcastEpisodes.topicId, topicIds), eq(podcastEpisodes.status, "published")))
			.orderBy(podcastEpisodes.topicId, desc(podcastEpisodes.publishedAt)),
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
