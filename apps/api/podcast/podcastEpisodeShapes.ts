// a podcast episode in the shape the player shows, with its chapters, its film, and the user's progress, and in the
// shape a table row shows, with its chapter count, limited to what the user may listen to

import type { PodcastEpisode, PodcastEpisodeSummary, TopicVideo } from "@carlnotes/contracts/podcast"
import { isPublishedPodcastEpisode } from "@carlnotes/contracts/podcast"
import {
	FULL_PODCAST_COVER_SIZE,
	SMALL_PODCAST_COVER_SIZE,
	toPodcastEpisodeCover,
} from "@carlnotes/contracts/podcastEpisodes"
import { toPodcastEpisodePath } from "@carlnotes/contracts/seo"
import { toPodcastEpisodeImageUrls, toTopicVideoPosterUrl } from "@carlnotes/contracts/topicImages"
import { db } from "@carlnotes/db"
import { memoizeRowsById } from "@carlnotes/db/requestMemo"
import { podcastEpisodeChapters, topicVideos } from "@carlnotes/db/schema/podcast"
import { toPodcastCoverPath } from "@carlnotes/server/podcastCoverPaths"
import { isVoiceChatConfigured } from "@carlnotes/server/voiceChat"
import { and, count, inArray } from "drizzle-orm"
import {
	loadPodcastEpisodeListenRows,
	type PodcastEpisodeListenRow,
	type PodcastEpisodeRow,
	type PodcastEpisodeTopic,
} from "./podcastEpisodeRows"

// a podcast episode's row and the topic that its page path is built from
export type PodcastEpisodeRowTopic = { podcastEpisodeRow: PodcastEpisodeRow; topic: PodcastEpisodeTopic }

// a ready film as a podcast episode's shape reads it: its size in bytes, and the hash of its own image, null for a film
// that shows its podcast episode's image
type ReadyTopicVideo = { byteSize: number; imageHash: string | null }

// the films of a list of podcast episodes: each ready film by its podcast episode's id, and the ids of the podcast
// episodes whose film is rendering
export type TopicVideos = {
	readyTopicVideos: Map<string, ReadyTopicVideo>
	videoRenderingPodcastEpisodeIds: Set<string>
}

// the row, topic, chapter rows if any, listen row, ready film if any, and whether the film is rendering, that a
// podcast episode is built from
type ToPodcastEpisodeOptions = PodcastEpisodeRowTopic & {
	podcastEpisodeChapterRows?: (typeof podcastEpisodeChapters.$inferSelect)[]
	podcastEpisodeListenRow?: PodcastEpisodeListenRow
	readyTopicVideo?: ReadyTopicVideo
	isVideoRendering?: boolean
}

// the row, topic, chapter count, and ready film if any that a podcast episode summary is built from
type ToPodcastEpisodeSummaryOptions = PodcastEpisodeRowTopic & {
	chapterCount: number
	readyTopicVideo?: ReadyTopicVideo
}

// the podcast episode row, its topic, and the user, null for a visitor
type LoadPodcastEpisodeOptions = PodcastEpisodeRowTopic & Omit<LoadPodcastEpisodesOptions, "podcastEpisodeRowTopics">

// the podcast episode rows with their topics, the user, null for a visitor, and the films if a caller loaded them
type LoadPodcastEpisodesOptions = {
	podcastEpisodeRowTopics: PodcastEpisodeRowTopic[]
	userId: string | null
	// the films if the caller reads them, read already or in flight beside these reads
	topicVideos?: TopicVideos | Promise<TopicVideos>
}

/**
 * Loads a podcast episode as the player shows it, with its chapters and the user's progress.
 */
export async function loadPodcastEpisode({
	podcastEpisodeRow,
	topic,
	userId,
	topicVideos,
}: LoadPodcastEpisodeOptions): Promise<PodcastEpisode> {
	// a list with a single podcast episode returns that podcast episode
	const [podcastEpisode] = await loadPodcastEpisodes({
		podcastEpisodeRowTopics: [{ podcastEpisodeRow, topic }],
		userId,
		topicVideos,
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
	topicVideos: loadedTopicVideos,
}: LoadPodcastEpisodesOptions): Promise<PodcastEpisode[]> {
	const podcastEpisodeIds = podcastEpisodeRowTopics.map(({ podcastEpisodeRow }) => podcastEpisodeRow.id)
	if (podcastEpisodeIds.length === 0) {
		return []
	}

	// every podcast episode's chapters in their order, the user's progress through each episode, and its film
	const [chapterRowsByPodcastEpisodeId, podcastEpisodeListenRows, topicVideos] = await Promise.all([
		loadChapterRows(podcastEpisodeIds),
		loadPodcastEpisodeListenRows(userId, podcastEpisodeIds),
		loadedTopicVideos ?? loadTopicVideos(podcastEpisodeIds),
	])

	// build each podcast episode from its own chapters, listen row, and film
	const { readyTopicVideos, videoRenderingPodcastEpisodeIds } = topicVideos
	const listenRowByPodcastEpisodeId = new Map(
		podcastEpisodeListenRows.map((listenRow) => [listenRow.podcastEpisodeId, listenRow]),
	)
	return podcastEpisodeRowTopics.map(({ podcastEpisodeRow, topic }) =>
		toPodcastEpisode({
			podcastEpisodeRow,
			topic,
			podcastEpisodeChapterRows: chapterRowsByPodcastEpisodeId.get(podcastEpisodeRow.id),
			podcastEpisodeListenRow: listenRowByPodcastEpisodeId.get(podcastEpisodeRow.id),
			readyTopicVideo: readyTopicVideos.get(podcastEpisodeRow.id),
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
	loadedTopicVideos?: TopicVideos | Promise<TopicVideos>,
): Promise<PodcastEpisodeSummary[]> {
	const podcastEpisodeIds = podcastEpisodeRowTopics.map(({ podcastEpisodeRow }) => podcastEpisodeRow.id)
	if (podcastEpisodeIds.length === 0) {
		return []
	}

	// every podcast episode's chapter count and its film, then each summary with its own count
	const [chapterCountByPodcastEpisodeId, { readyTopicVideos }] = await Promise.all([
		loadChapterCounts(podcastEpisodeIds),
		loadedTopicVideos ?? loadTopicVideos(podcastEpisodeIds),
	])
	return podcastEpisodeRowTopics.map(({ podcastEpisodeRow, topic }) =>
		toPodcastEpisodeSummary({
			podcastEpisodeRow,
			topic,
			chapterCount: chapterCountByPodcastEpisodeId.get(podcastEpisodeRow.id) ?? 0,
			readyTopicVideo: readyTopicVideos.get(podcastEpisodeRow.id),
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
	readyTopicVideo,
	isVideoRendering = false,
}: ToPodcastEpisodeOptions): PodcastEpisode {
	// the fields the episode shares with its summary, its chapter count among them
	const podcastEpisodeSummary = toPodcastEpisodeSummary({
		podcastEpisodeRow,
		topic,
		chapterCount: podcastEpisodeChapterRows.length,
		readyTopicVideo,
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
		video: toTopicVideo(podcastEpisodeRow.id, readyTopicVideo),
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
	readyTopicVideo,
}: ToPodcastEpisodeSummaryOptions): PodcastEpisodeSummary {
	// the poster of a ready film with its own image
	const videoImageHash = readyTopicVideo?.imageHash
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
		hasVideo: Boolean(readyTopicVideo),
		videoPosterUrl: videoImageHash ? toTopicVideoPosterUrl(podcastEpisodeRow.id, videoImageHash) : null,
	}
}

/**
 * Returns the films of these podcast episodes in one read: each ready film's size and own image hash by its podcast
 * episode's id, and the ids of the podcast episodes whose film is rendering.
 */
export async function loadTopicVideos(podcastEpisodeIds: string[]): Promise<TopicVideos> {
	if (podcastEpisodeIds.length === 0) {
		return { readyTopicVideos: new Map(), videoRenderingPodcastEpisodeIds: new Set() }
	}

	// the ready and the rendering film rows of these podcast episodes, each read once in a request
	const filmRowsByPodcastEpisodeId = await memoizeRowsById("topic-videos", podcastEpisodeIds, async (missingIds) => {
		const missingFilmRows = await db
			.select({
				podcastEpisodeId: topicVideos.podcastEpisodeId,
				status: topicVideos.status,
				byteSize: topicVideos.byteSize,
				imageHash: topicVideos.imageHash,
			})
			.from(topicVideos)
			.where(
				and(inArray(topicVideos.podcastEpisodeId, missingIds), inArray(topicVideos.status, ["ready", "rendering"])),
			)
		return Map.groupBy(missingFilmRows, (filmRow) => filmRow.podcastEpisodeId)
	})
	const filmRows = [...filmRowsByPodcastEpisodeId.values()].flat()

	// each ready film by its podcast episode's id, and the podcast episodes whose film is rendering
	const readyFilmRows = filmRows.filter((filmRow) => filmRow.status === "ready")
	const renderingFilmRows = filmRows.filter((filmRow) => filmRow.status === "rendering")
	return {
		readyTopicVideos: new Map(
			readyFilmRows.map(({ podcastEpisodeId, byteSize, imageHash }) => [
				podcastEpisodeId,
				{ byteSize: byteSize ?? 0, imageHash },
			]),
		),
		videoRenderingPodcastEpisodeIds: new Set(renderingFilmRows.map((filmRow) => filmRow.podcastEpisodeId)),
	}
}

// each podcast episode's chapters in their order by its id, each read once in a request. a podcast episode with no
// chapter has no entry
function loadChapterRows(
	podcastEpisodeIds: string[],
): Promise<Map<string, (typeof podcastEpisodeChapters.$inferSelect)[]>> {
	return memoizeRowsById("chapter-rows", podcastEpisodeIds, async (missingIds) => {
		// the chapters of the podcast episodes that no earlier read in the request read, grouped by their podcast episode
		const chapterRows = await db
			.select()
			.from(podcastEpisodeChapters)
			.where(inArray(podcastEpisodeChapters.podcastEpisodeId, missingIds))
			.orderBy(podcastEpisodeChapters.position)
		return Map.groupBy(chapterRows, (chapterRow) => chapterRow.podcastEpisodeId)
	})
}

// each podcast episode's chapter count by its id, each read once in a request. a podcast episode with no chapter has
// no entry
function loadChapterCounts(podcastEpisodeIds: string[]): Promise<Map<string, number>> {
	return memoizeRowsById("chapter-counts", podcastEpisodeIds, async (missingIds) => {
		// the chapter counts of the podcast episodes that no earlier read in the request read
		const chapterCountRows = await db
			.select({ podcastEpisodeId: podcastEpisodeChapters.podcastEpisodeId, chapterCount: count() })
			.from(podcastEpisodeChapters)
			.where(inArray(podcastEpisodeChapters.podcastEpisodeId, missingIds))
			.groupBy(podcastEpisodeChapters.podcastEpisodeId)
		return new Map(chapterCountRows.map(({ podcastEpisodeId, chapterCount }) => [podcastEpisodeId, chapterCount]))
	})
}

/**
 * Returns a podcast episode's film urls, with the poster url of the film's own image if it has one, or null without a
 * ready film.
 */
export function toTopicVideo(
	podcastEpisodeId: string,
	readyTopicVideo: ReadyTopicVideo | undefined,
): TopicVideo | null {
	if (!readyTopicVideo) {
		return null
	}

	// the stable film and captions urls, and the poster at the image's hash
	const { imageHash } = readyTopicVideo
	return {
		videoUrl: `/api/episodes/${podcastEpisodeId}/video.mp4`,
		captionsUrl: `/api/episodes/${podcastEpisodeId}/captions.vtt`,
		posterUrl: imageHash ? toTopicVideoPosterUrl(podcastEpisodeId, imageHash) : null,
	}
}
