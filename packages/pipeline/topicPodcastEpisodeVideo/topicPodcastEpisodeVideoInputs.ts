// what a podcast episode film is drawn from: the published podcast episode, the image its film shows, and its
// chapters with the Resource each one narrates

import type { PodcastEpisodeScript } from "@carlnotes/contracts/podcast"
import {
	AI_VOICES_NOTE,
	PODCAST_SHOW_NAME,
	toPodcastEpisodeDetailsLine,
	toTranscriptTurn,
} from "@carlnotes/contracts/podcastEpisodes"
import { toHostWithoutWww } from "@carlnotes/contracts/seo"
import { db } from "@carlnotes/db"
import { podcastEpisodeChapters, podcastEpisodes, topicPodcastEpisodeVideos } from "@carlnotes/db/schema/podcast"
import { resources } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { getAttachmentBytes } from "@carlnotes/db/store"
import {
	toTopicPodcastEpisodeVideoImageKey,
	toTopicPodcastEpisodeVideoImageLargeOriginalKey,
} from "@carlnotes/db/topicPodcastEpisodeVideoKeys"
import { asc, eq } from "drizzle-orm"
import sharp from "sharp"
import { toChapterTurns } from "../podcast/podcastEpisodeScript"
import { toPodcastEpisodeImageOriginalKey, toTopicImageOriginalKey } from "../topicImages/topicImageFiles"
import type { VideoCaptionChapter } from "./videoCaptions"
import { type LowerThirdText, loadPodcastCardStillPng, PODCAST_CARD_ZOOM_LIMIT, toVideoStillPng } from "./videoFrames"
import { toShotZoomLimit } from "./videoShots"

// the image hash that names a film drawn from Carl and Vienna's podcast card, for a podcast episode with no image
const PODCAST_CARD_IMAGE_HASH = "podcast-card"

// a published podcast episode as its film reads it
export type TopicPodcastEpisodeVideoEpisode = {
	podcastEpisodeId: string
	topicId: string
	ownerId: string
	// the stored audio and the script, either missing on a podcast episode that cannot render
	audioKey: string | null
	script: PodcastEpisodeScript | null
	// the hash and the stored original of the image the film shows now: the film's own, or else the podcast episode's,
	// or else its topic's
	imageHash: string
	imageOriginalKey: string | null
	// the larger original of the film's own image, which the intro and the sign-off zoom into. null for any other image
	imageLargeOriginalKey: string | null
	// the lower thirds of the intro and the sign-off
	introText: LowerThirdText
	signOffText: LowerThirdText
}

// one chapter as its film segment reads it, with the Resource it narrates
export type VideoChapterRow = {
	position: number
	title: string
	sourceUrl: string
	startSeconds: number
	endSeconds: number
	// the Resource the chapter narrates, and whether that Resource was judged unsafe
	resourceId: string
	isUnsafe: boolean
}

// a podcast episode that has the audio and the transcript that a film is drawn from
export type RenderableTopicPodcastEpisodeVideoEpisode = TopicPodcastEpisodeVideoEpisode & {
	audioKey: string
	script: PodcastEpisodeScript
}

/**
 * Returns a published podcast episode as its film reads it, or null for any other podcast episode.
 */
export async function loadTopicPodcastEpisodeVideoEpisode(
	podcastEpisodeId: string,
): Promise<TopicPodcastEpisodeVideoEpisode | null> {
	// the podcast episode with its topic's name and image, and its film's own image
	const [podcastEpisodeRow] = await db
		.select({
			topicId: podcastEpisodes.topicId,
			ownerId: podcastEpisodes.ownerId,
			status: podcastEpisodes.status,
			title: podcastEpisodes.title,
			season: podcastEpisodes.season,
			episodeNumber: podcastEpisodes.episodeNumber,
			audioKey: podcastEpisodes.audioKey,
			script: podcastEpisodes.script,
			podcastEpisodeImageHash: podcastEpisodes.imageHash,
			topicName: topics.name,
			topicImageHash: topics.imageHash,
			topicPodcastEpisodeVideoImageHash: topicPodcastEpisodeVideos.imageHash,
		})
		.from(podcastEpisodes)
		.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.leftJoin(topicPodcastEpisodeVideos, eq(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodes.id))
		.where(eq(podcastEpisodes.id, podcastEpisodeId))
	if (podcastEpisodeRow?.status !== "published") {
		return null
	}

	// the film's own image, or else the podcast episode's, or else its topic's, or else the podcast card
	const { topicId, podcastEpisodeImageHash, topicImageHash, topicPodcastEpisodeVideoImageHash } = podcastEpisodeRow
	const shownImage = toShownImage({
		podcastEpisodeId,
		topicId: topicId ?? "",
		podcastEpisodeImageHash,
		topicImageHash,
		topicPodcastEpisodeVideoImageHash,
	})
	return {
		podcastEpisodeId,
		topicId: topicId ?? "",
		ownerId: podcastEpisodeRow.ownerId,
		audioKey: podcastEpisodeRow.audioKey,
		script: podcastEpisodeRow.script,
		...shownImage,
		introText: {
			title: podcastEpisodeRow.title ?? PODCAST_SHOW_NAME,
			detail: toPodcastEpisodeDetailsLine(podcastEpisodeRow, podcastEpisodeRow.topicName),
		},
		signOffText: { title: PODCAST_SHOW_NAME, detail: AI_VOICES_NOTE },
	}
}

// the podcast episode, its topic, the hashes of both of their images, and the hash of the film's own image, null or
// left out for a film that has none
type ToShownImageOptions = {
	podcastEpisodeId: string
	topicId: string
	podcastEpisodeImageHash: string | null
	topicImageHash: string | null
	topicPodcastEpisodeVideoImageHash?: string | null
}

// the image a film's intro and sign-off show: its hash, its stored original, and for the film's own image the larger
// original that the intro and the sign-off zoom into
type ShownImage = { imageHash: string; imageOriginalKey: string | null; imageLargeOriginalKey: string | null }

/**
 * Returns the hash and the stored original of the image a film's intro and sign-off show: the film's own, or else its
 * podcast episode's, its topic's, or the podcast card, which has no stored original.
 */
export function toShownImage({
	podcastEpisodeId,
	topicId,
	podcastEpisodeImageHash,
	topicImageHash,
	topicPodcastEpisodeVideoImageHash,
}: ToShownImageOptions): ShownImage {
	// a film with its own image shows it, whatever its podcast episode shows
	if (topicPodcastEpisodeVideoImageHash) {
		const ownImageHash = topicPodcastEpisodeVideoImageHash
		return {
			imageHash: ownImageHash,
			imageOriginalKey: toTopicPodcastEpisodeVideoImageKey(podcastEpisodeId, ownImageHash),
			imageLargeOriginalKey: toTopicPodcastEpisodeVideoImageLargeOriginalKey(podcastEpisodeId, ownImageHash),
		}
	}

	// otherwise the image its podcast episode shows
	if (podcastEpisodeImageHash) {
		const imageOriginalKey = toPodcastEpisodeImageOriginalKey(podcastEpisodeId, podcastEpisodeImageHash)
		return { imageHash: podcastEpisodeImageHash, imageOriginalKey, imageLargeOriginalKey: null }
	}

	// or else its topic's, or the podcast card
	if (topicImageHash) {
		const imageOriginalKey = toTopicImageOriginalKey(topicId, topicImageHash)
		return { imageHash: topicImageHash, imageOriginalKey, imageLargeOriginalKey: null }
	}
	return { imageHash: PODCAST_CARD_IMAGE_HASH, imageOriginalKey: null, imageLargeOriginalKey: null }
}

// the still of the image a film's intro and sign-off show, how far that image may zoom in a chapter's shot, and
// whether the film shows the podcast card in place of an image
export type ShownImageStill = { stillPng: Uint8Array; zoomLimit: number; isPodcastCard: boolean }

/**
 * Returns the still of the image a film's intro and sign-off show, from the larger original of the film's own image if
 * it has one. A film with no image, or whose image cannot be read, shows the podcast card.
 */
export async function loadShownImageStill({
	imageOriginalKey,
	imageLargeOriginalKey,
}: Pick<ShownImage, "imageOriginalKey" | "imageLargeOriginalKey">): Promise<ShownImageStill> {
	// the larger original first, then the stored original
	for (const imageKey of [imageLargeOriginalKey, imageOriginalKey]) {
		const shownImageStill = imageKey ? await loadImageStill(imageKey) : null
		if (shownImageStill) {
			return shownImageStill
		}
	}
	return { stillPng: await loadPodcastCardStillPng(), zoomLimit: PODCAST_CARD_ZOOM_LIMIT, isPodcastCard: true }
}

// one stored image as a still with the zoom its pixels hold, or null for an image that is missing or cannot be read
async function loadImageStill(imageKey: string): Promise<ShownImageStill | null> {
	try {
		// read the image's pixel size, then compose its still
		const imageBytes = await getAttachmentBytes(imageKey)
		const { width = 0, height = 0 } = await sharp(imageBytes).metadata()
		const stillPng = await toVideoStillPng(imageBytes)
		return { stillPng, zoomLimit: toShotZoomLimit({ width, height }), isPodcastCard: false }
	} catch {
		return null
	}
}

/**
 * Returns a podcast episode's chapters in order, with the Resource each one narrates and whether that Resource was
 * judged unsafe.
 */
export function loadVideoChapterRows(podcastEpisodeId: string): Promise<VideoChapterRow[]> {
	return db
		.select({
			position: podcastEpisodeChapters.position,
			title: podcastEpisodeChapters.title,
			sourceUrl: podcastEpisodeChapters.sourceUrl,
			startSeconds: podcastEpisodeChapters.startSeconds,
			endSeconds: podcastEpisodeChapters.endSeconds,
			resourceId: podcastEpisodeChapters.resourceId,
			isUnsafe: resources.isUnsafe,
		})
		.from(podcastEpisodeChapters)
		.innerJoin(resources, eq(resources.id, podcastEpisodeChapters.resourceId))
		.where(eq(podcastEpisodeChapters.podcastEpisodeId, podcastEpisodeId))
		.orderBy(asc(podcastEpisodeChapters.position))
}

/**
 * Returns a chapter's lower third: its title and its source's domain.
 */
export function toChapterLowerThirdText(videoChapterRow: VideoChapterRow): LowerThirdText {
	return { title: videoChapterRow.title, detail: toHostWithoutWww(videoChapterRow.sourceUrl) }
}

/**
 * Returns each chapter's caption turns at its time in the audio, from the chapter's turns in the script.
 */
export function toVideoCaptionChapters(
	script: PodcastEpisodeScript,
	videoChapterRows: VideoChapterRow[],
): VideoCaptionChapter[] {
	const chapterTurns = toChapterTurns(script)
	return videoChapterRows.map((videoChapterRow) => ({
		startSeconds: videoChapterRow.startSeconds,
		endSeconds: videoChapterRow.endSeconds,
		turns: (chapterTurns[videoChapterRow.position] ?? []).map(toTranscriptTurn),
	}))
}
