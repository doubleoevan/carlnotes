// what a podcast episode film is drawn from: the published podcast episode, the image its film shows, its chapters,
// and each chapter's image, read from the stored link preview or fetched once

import type { PodcastEpisodeScript } from "@carlnotes/contracts/podcast"
import {
	AI_VOICES_NOTE,
	PODCAST_SHOW_NAME,
	toPodcastEpisodeDetailsLine,
	toTranscriptTurn,
} from "@carlnotes/contracts/podcastEpisodes"
import { toHostWithoutWww } from "@carlnotes/contracts/seo"
import { db } from "@carlnotes/db"
import { linkPreviews } from "@carlnotes/db/schema/chat"
import { podcastEpisodeChapters, podcastEpisodes, topicPodcastEpisodeVideos } from "@carlnotes/db/schema/podcast"
import { resources } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { getAttachmentBytes, toTopicPodcastEpisodeVideoImageKey } from "@carlnotes/db/store"
import { and, asc, eq, isNotNull } from "drizzle-orm"
import { fetchLinkPreviewImage, fetchLinkPreviewMetadata, toNormalizedLinkPreviewUrl } from "../linkPreview"
import { toChapterTurns } from "../podcast/podcastEpisodeScript"
import { toPodcastEpisodeImageOriginalKey, toTopicImageOriginalKey } from "../topicImages/topicImageFiles"
import type { VideoCaptionChapter } from "./videoCaptions"
import { type LowerThirdText, loadPodcastCardStillPng, toVideoStillPng } from "./videoFrames"

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
	// the lower thirds of the intro and the sign-off
	introText: LowerThirdText
	signOffText: LowerThirdText
}

// one chapter as its film segment reads it
export type VideoChapterRow = {
	position: number
	title: string
	sourceUrl: string
	startSeconds: number
	endSeconds: number
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
}: ToShownImageOptions): { imageHash: string; imageOriginalKey: string | null } {
	// a film with its own image shows it, whatever its podcast episode shows
	if (topicPodcastEpisodeVideoImageHash) {
		return {
			imageHash: topicPodcastEpisodeVideoImageHash,
			imageOriginalKey: toTopicPodcastEpisodeVideoImageKey(podcastEpisodeId, topicPodcastEpisodeVideoImageHash),
		}
	}

	// otherwise the image its podcast episode shows
	if (podcastEpisodeImageHash) {
		return {
			imageHash: podcastEpisodeImageHash,
			imageOriginalKey: toPodcastEpisodeImageOriginalKey(podcastEpisodeId, podcastEpisodeImageHash),
		}
	}
	if (topicImageHash) {
		return { imageHash: topicImageHash, imageOriginalKey: toTopicImageOriginalKey(topicId, topicImageHash) }
	}
	return { imageHash: PODCAST_CARD_IMAGE_HASH, imageOriginalKey: null }
}

/**
 * Returns the still of the image a film's intro and sign-off show. An image that cannot be read shows the podcast card.
 */
export async function loadShownImageStillPng(imageOriginalKey: string | null): Promise<Uint8Array> {
	if (!imageOriginalKey) {
		return loadPodcastCardStillPng()
	}
	return toVideoStillPng(await getAttachmentBytes(imageOriginalKey)).catch(() => loadPodcastCardStillPng())
}

/**
 * Returns a podcast episode's chapters in order, with whether each one's Resource was judged unsafe.
 */
export function loadVideoChapterRows(podcastEpisodeId: string): Promise<VideoChapterRow[]> {
	return db
		.select({
			position: podcastEpisodeChapters.position,
			title: podcastEpisodeChapters.title,
			sourceUrl: podcastEpisodeChapters.sourceUrl,
			startSeconds: podcastEpisodeChapters.startSeconds,
			endSeconds: podcastEpisodeChapters.endSeconds,
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
 * Returns a chapter's still from its Finding's link preview image: the stored link preview's image if one exists, or
 * else the page's image fetched once and stored nowhere. Returns null for an unsafe Resource, a missing image, and an
 * image that cannot be read.
 */
export async function loadChapterLinkPreviewStillPng(videoChapterRow: VideoChapterRow): Promise<Uint8Array | null> {
	// an unsafe Resource never shows its image
	if (videoChapterRow.isUnsafe) {
		return null
	}

	// a missing image or one that cannot be read gives no still
	try {
		const imageBytes = await loadChapterImageBytes(videoChapterRow.sourceUrl)
		return imageBytes ? await toVideoStillPng(imageBytes) : null
	} catch {
		return null
	}
}

// the link preview image of a page: the stored link preview's, or else fetched from the page's own tags
async function loadChapterImageBytes(sourceUrl: string): Promise<Uint8Array | null> {
	// a link preview that a chat already stored with an image
	const [storedLinkPreview] = await db
		.select({ imageObjectKey: linkPreviews.imageObjectKey })
		.from(linkPreviews)
		.where(
			and(
				eq(linkPreviews.url, toNormalizedLinkPreviewUrl(sourceUrl)),
				eq(linkPreviews.status, "ready"),
				isNotNull(linkPreviews.imageObjectKey),
			),
		)
	if (storedLinkPreview?.imageObjectKey) {
		return getAttachmentBytes(storedLinkPreview.imageObjectKey)
	}

	// otherwise the page's image, fetched through the public url guard
	const { imageUrl } = await fetchLinkPreviewMetadata(sourceUrl)
	if (!imageUrl) {
		return null
	}
	const { bytes } = await fetchLinkPreviewImage(imageUrl)
	return bytes
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
