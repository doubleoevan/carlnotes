// a ready film's files as the api reads them

import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import { db } from "@carlnotes/db"
import { podcastEpisodes, topicVideos } from "@carlnotes/db/schema/podcast"
import { and, eq } from "drizzle-orm"

// the film's and the captions' types, and the field a platform player's JSON names each url in
export const TOPIC_VIDEO_FILE = { contentType: "video/mp4", urlFieldName: "videoUrl" } as const
export const TOPIC_VIDEO_CAPTIONS_FILE = {
	contentType: "text/vtt",
	urlFieldName: "captionsUrl",
} as const

// a ready film's stored keys, size, the image its intro and sign-off were drawn from, its own image, null for a film
// that shows its podcast episode's image, and the user its podcast episode bills
export type ReadyTopicVideoFiles = {
	filmKey: string
	captionsKey: string | null
	byteSize: number | null
	renderedImageHash: string | null
	imageHash: string | null
	ownerId: string
}

// the podcast episode, and whether the user may edit it
type LoadTopicVideoImageEditOptions = { podcastEpisodeId: string; canEditPodcastEpisode: boolean }

/**
 * Returns the origin and the image prompt of a film's own image as its page shows an editor. Both are null for anyone
 * else, and for a film with no image of its own.
 */
export async function loadTopicVideoImageEdit({
	podcastEpisodeId,
	canEditPodcastEpisode,
}: LoadTopicVideoImageEditOptions): Promise<
	Pick<PodcastEpisodePageResponse, "topicPodcastEpisodeVideoImageOrigin" | "topicPodcastEpisodeVideoImagePrompt">
> {
	// only an editor reads the film's image fields
	const [topicVideo] = canEditPodcastEpisode
		? await db
				.select({
					imageOrigin: topicVideos.imageOrigin,
					imagePrompt: topicVideos.imagePrompt,
				})
				.from(topicVideos)
				.where(eq(topicVideos.podcastEpisodeId, podcastEpisodeId))
		: []
	return {
		topicPodcastEpisodeVideoImageOrigin: topicVideo?.imageOrigin ?? null,
		topicPodcastEpisodeVideoImagePrompt: topicVideo?.imagePrompt ?? null,
	}
}

/**
 * Returns whether a published podcast episode of the topic has a ready film.
 */
export async function hasReadyTopicVideo(topicId: string): Promise<boolean> {
	// one ready film of a published podcast episode is enough
	const [readyFilmRow] = await db
		.select({ id: topicVideos.id })
		.from(topicVideos)
		.innerJoin(podcastEpisodes, eq(topicVideos.podcastEpisodeId, podcastEpisodes.id))
		.where(
			and(
				eq(podcastEpisodes.topicId, topicId),
				eq(podcastEpisodes.status, "published"),
				eq(topicVideos.status, "ready"),
			),
		)
		.limit(1)
	return readyFilmRow !== undefined
}

/**
 * Loads a podcast episode's ready film's files, or null.
 */
export async function loadReadyTopicVideoFiles(podcastEpisodeId: string): Promise<ReadyTopicVideoFiles | null> {
	// the ready row, with its podcast episode's owner
	const [readyFilmRow] = await db
		.select({
			filmKey: topicVideos.filmKey,
			captionsKey: topicVideos.captionsKey,
			byteSize: topicVideos.byteSize,
			renderedImageHash: topicVideos.renderedImageHash,
			imageHash: topicVideos.imageHash,
			ownerId: podcastEpisodes.ownerId,
		})
		.from(topicVideos)
		.innerJoin(podcastEpisodes, eq(podcastEpisodes.id, topicVideos.podcastEpisodeId))
		.where(and(eq(topicVideos.podcastEpisodeId, podcastEpisodeId), eq(topicVideos.status, "ready")))

	// a ready row always has its film
	const filmKey = readyFilmRow?.filmKey
	return readyFilmRow && filmKey ? { ...readyFilmRow, filmKey } : null
}
