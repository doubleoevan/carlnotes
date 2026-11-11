// a podcast episode in the shape the player shows, with its chapters, its film, and the user's progress, and in the
// shape a table row shows, with its chapter count, and each topic's latest of either, limited to what the user may
// listen to

import type { PodcastEpisode, PodcastEpisodeSummary, TopicPodcastEpisodeVideo } from "@carlnotes/contracts/podcast"
import { isPublishedPodcastEpisode } from "@carlnotes/contracts/podcast"
import {
	FULL_PODCAST_COVER_SIZE,
	SMALL_PODCAST_COVER_SIZE,
	toPodcastEpisodeCover,
} from "@carlnotes/contracts/podcastEpisodes"
import { toPodcastEpisodePath } from "@carlnotes/contracts/seo"
import { toPodcastEpisodeImageUrls, toTopicPodcastEpisodeVideoPosterUrl } from "@carlnotes/contracts/topicImages"
import { db } from "@carlnotes/db"
import { podcastEpisodeChapters, podcastEpisodes, topicPodcastEpisodeVideos } from "@carlnotes/db/schema/podcast"
import { isAfterSubscriberActivation } from "@carlnotes/db/topicPermissions"
import { toPodcastCoverPath } from "@carlnotes/server/podcastCoverPaths"
import { isPodcastEpisodeRecordingConfigured } from "@carlnotes/server/podcastEpisodeSettings"
import { isVoiceChatConfigured } from "@carlnotes/server/voiceChat"
import { and, count, desc, eq, inArray } from "drizzle-orm"
import { topicSubscriptionStartDates } from "../topic/subscriptionStartDates"
import {
	loadPodcastEpisodeListenRows,
	type PodcastEpisodeListenRow,
	type PodcastEpisodeRow,
	type PodcastEpisodeTopic,
	podcastEpisodeColumns,
	type TopicRow,
} from "./podcastEpisodeRows"

// the topic fields that the latest podcast episode loaders read: the podcast episode's topic and its access check
type LatestPodcastEpisodeTopic = Pick<TopicRow, "id" | "name" | "ownerId" | "visibility" | "imageHash">

// a podcast episode's row and the topic that its page path is built from
export type PodcastEpisodeRowTopic = { podcastEpisodeRow: PodcastEpisodeRow; topic: PodcastEpisodeTopic }

// a ready film as a podcast episode's shape reads it: its size in bytes, and the hash of its own image, null for a film
// that shows its podcast episode's image
type ReadyTopicPodcastEpisodeVideo = { byteSize: number; imageHash: string | null }

// the films of a list of podcast episodes: each ready film by its podcast episode's id, and the ids of the podcast
// episodes whose film is rendering
export type TopicPodcastEpisodeVideos = {
	readyTopicPodcastEpisodeVideos: Map<string, ReadyTopicPodcastEpisodeVideo>
	videoRenderingPodcastEpisodeIds: Set<string>
}

// the row, topic, chapter rows if any, listen row, ready film if any, and whether the film is rendering, that a
// podcast episode is built from
type ToPodcastEpisodeOptions = PodcastEpisodeRowTopic & {
	podcastEpisodeChapterRows?: (typeof podcastEpisodeChapters.$inferSelect)[]
	podcastEpisodeListenRow?: PodcastEpisodeListenRow
	readyTopicPodcastEpisodeVideo?: ReadyTopicPodcastEpisodeVideo
	isVideoRendering?: boolean
}

// the row, topic, chapter count, and ready film if any that a podcast episode summary is built from
type ToPodcastEpisodeSummaryOptions = PodcastEpisodeRowTopic & {
	chapterCount: number
	readyTopicPodcastEpisodeVideo?: ReadyTopicPodcastEpisodeVideo
}

// the podcast episode row, its topic, and the user, null for a visitor
type LoadPodcastEpisodeOptions = PodcastEpisodeRowTopic & { userId: string | null }

// the podcast episode rows with their topics, the user, null for a visitor, and the films if a caller loaded them
type LoadPodcastEpisodesOptions = {
	podcastEpisodeRowTopics: PodcastEpisodeRowTopic[]
	userId: string | null
	topicPodcastEpisodeVideos?: TopicPodcastEpisodeVideos
}

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
	const [podcastEpisode] = await loadPodcastEpisodes({
		podcastEpisodeRowTopics: [{ podcastEpisodeRow, topic }],
		userId,
	})
	return podcastEpisode as PodcastEpisode
}

/**
 * Loads podcast episodes in the shape that the player shows, each with its chapters and the user's progress, in the
 * order given. The films are read here unless the caller passes them.
 */
export async function loadPodcastEpisodes({
	podcastEpisodeRowTopics,
	userId,
	topicPodcastEpisodeVideos: loadedTopicPodcastEpisodeVideos,
}: LoadPodcastEpisodesOptions): Promise<PodcastEpisode[]> {
	const podcastEpisodeIds = podcastEpisodeRowTopics.map(({ podcastEpisodeRow }) => podcastEpisodeRow.id)
	if (podcastEpisodeIds.length === 0) {
		return []
	}

	// every podcast episode's chapters in their order, the user's progress through each episode, and its film
	const [podcastEpisodeChapterRows, podcastEpisodeListenRows, topicPodcastEpisodeVideos] = await Promise.all([
		db
			.select()
			.from(podcastEpisodeChapters)
			.where(inArray(podcastEpisodeChapters.podcastEpisodeId, podcastEpisodeIds))
			.orderBy(podcastEpisodeChapters.position),
		loadPodcastEpisodeListenRows(userId, podcastEpisodeIds),
		loadedTopicPodcastEpisodeVideos ?? loadTopicPodcastEpisodeVideos(podcastEpisodeIds),
	])

	// build each podcast episode from its own chapters, listen row, and film
	const { readyTopicPodcastEpisodeVideos, videoRenderingPodcastEpisodeIds } = topicPodcastEpisodeVideos
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
			readyTopicPodcastEpisodeVideo: readyTopicPodcastEpisodeVideos.get(podcastEpisodeRow.id),
			isVideoRendering: videoRenderingPodcastEpisodeIds.has(podcastEpisodeRow.id),
		}),
	)
}

/**
 * Loads podcast episodes as a table row shows them, each with its chapter count from one count of every episode's
 * chapters, in the order given. The films are read here unless the caller passes them.
 */
export async function loadPodcastEpisodeSummaries(
	podcastEpisodeRowTopics: PodcastEpisodeRowTopic[],
	loadedTopicPodcastEpisodeVideos?: TopicPodcastEpisodeVideos,
): Promise<PodcastEpisodeSummary[]> {
	const podcastEpisodeIds = podcastEpisodeRowTopics.map(({ podcastEpisodeRow }) => podcastEpisodeRow.id)
	if (podcastEpisodeIds.length === 0) {
		return []
	}

	// every podcast episode's chapter count and its film, then each summary with its own count
	const [chapterCountRows, { readyTopicPodcastEpisodeVideos }] = await Promise.all([
		db
			.select({ podcastEpisodeId: podcastEpisodeChapters.podcastEpisodeId, chapterCount: count() })
			.from(podcastEpisodeChapters)
			.where(inArray(podcastEpisodeChapters.podcastEpisodeId, podcastEpisodeIds))
			.groupBy(podcastEpisodeChapters.podcastEpisodeId),
		loadedTopicPodcastEpisodeVideos ?? loadTopicPodcastEpisodeVideos(podcastEpisodeIds),
	])
	const chapterCountByPodcastEpisodeId = new Map(
		chapterCountRows.map((chapterCountRow) => [chapterCountRow.podcastEpisodeId, chapterCountRow.chapterCount]),
	)
	return podcastEpisodeRowTopics.map(({ podcastEpisodeRow, topic }) =>
		toPodcastEpisodeSummary({
			podcastEpisodeRow,
			topic,
			chapterCount: chapterCountByPodcastEpisodeId.get(podcastEpisodeRow.id) ?? 0,
			readyTopicPodcastEpisodeVideo: readyTopicPodcastEpisodeVideos.get(podcastEpisodeRow.id),
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
	readyTopicPodcastEpisodeVideo,
	isVideoRendering = false,
}: ToPodcastEpisodeOptions): PodcastEpisode {
	// the fields the episode shares with its summary, its chapter count among them
	const podcastEpisodeSummary = toPodcastEpisodeSummary({
		podcastEpisodeRow,
		topic,
		chapterCount: podcastEpisodeChapterRows.length,
		readyTopicPodcastEpisodeVideo,
	})

	// map a removed status to failed. the loaders never return a removed podcast episode
	const status = podcastEpisodeRow.status === "removed" ? "failed" : podcastEpisodeRow.status

	// a podcast episode has a cover once it has a title
	const podcastCover = podcastEpisodeRow.title
		? toPodcastEpisodeCover({ ...podcastEpisodeRow, title: podcastEpisodeRow.title }, topic)
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
		// the ready film, and whether the film is rendering
		video: toTopicPodcastEpisodeVideo(podcastEpisodeRow.id, readyTopicPodcastEpisodeVideo),
		isVideoRendering,
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
function toPodcastEpisodeSummary({
	podcastEpisodeRow,
	topic,
	chapterCount,
	readyTopicPodcastEpisodeVideo,
}: ToPodcastEpisodeSummaryOptions): PodcastEpisodeSummary {
	// the poster of a ready film with its own image
	const videoImageHash = readyTopicPodcastEpisodeVideo?.imageHash
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
		// the podcast episode's own image, once it is drawn
		image: podcastEpisodeRow.imageHash
			? toPodcastEpisodeImageUrls(podcastEpisodeRow.id, podcastEpisodeRow.imageHash)
			: null,
		hasVideo: Boolean(readyTopicPodcastEpisodeVideo),
		videoPosterUrl: videoImageHash ? toTopicPodcastEpisodeVideoPosterUrl(podcastEpisodeRow.id, videoImageHash) : null,
	}
}

/**
 * Returns the films of these podcast episodes in one read: each ready film's size and own image hash by its podcast
 * episode's id, and the ids of the podcast episodes whose film is rendering.
 */
export async function loadTopicPodcastEpisodeVideos(podcastEpisodeIds: string[]): Promise<TopicPodcastEpisodeVideos> {
	if (podcastEpisodeIds.length === 0) {
		return { readyTopicPodcastEpisodeVideos: new Map(), videoRenderingPodcastEpisodeIds: new Set() }
	}

	// the ready and the rendering film rows of these podcast episodes
	const filmRows = await db
		.select({
			podcastEpisodeId: topicPodcastEpisodeVideos.podcastEpisodeId,
			status: topicPodcastEpisodeVideos.status,
			byteSize: topicPodcastEpisodeVideos.byteSize,
			imageHash: topicPodcastEpisodeVideos.imageHash,
		})
		.from(topicPodcastEpisodeVideos)
		.where(
			and(
				inArray(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodeIds),
				inArray(topicPodcastEpisodeVideos.status, ["ready", "rendering"]),
			),
		)

	// each ready film by its podcast episode's id, and the podcast episodes whose film is rendering
	const readyFilmRows = filmRows.filter((filmRow) => filmRow.status === "ready")
	const renderingFilmRows = filmRows.filter((filmRow) => filmRow.status === "rendering")
	return {
		readyTopicPodcastEpisodeVideos: new Map(
			readyFilmRows.map(({ podcastEpisodeId, byteSize, imageHash }) => [
				podcastEpisodeId,
				{ byteSize: byteSize ?? 0, imageHash },
			]),
		),
		videoRenderingPodcastEpisodeIds: new Set(renderingFilmRows.map((filmRow) => filmRow.podcastEpisodeId)),
	}
}

/**
 * Returns a podcast episode's film urls, with the poster url of the film's own image if it has one, or null without a
 * ready film.
 */
export function toTopicPodcastEpisodeVideo(
	podcastEpisodeId: string,
	readyTopicPodcastEpisodeVideo: ReadyTopicPodcastEpisodeVideo | undefined,
): TopicPodcastEpisodeVideo | null {
	if (!readyTopicPodcastEpisodeVideo) {
		return null
	}

	// the stable film and captions urls, and the poster at the image's hash
	const { imageHash } = readyTopicPodcastEpisodeVideo
	return {
		videoUrl: `/api/episodes/${podcastEpisodeId}/video.mp4`,
		captionsUrl: `/api/episodes/${podcastEpisodeId}/captions.vtt`,
		posterUrl: imageHash ? toTopicPodcastEpisodeVideoPosterUrl(podcastEpisodeId, imageHash) : null,
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
