// Topic Cinema as the api reads it: whether its section opens for a user, the user's saved choice, and a ready film's
// files

import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import { db } from "@carlnotes/db"
import {
	podcastEpisodeListens,
	podcastEpisodes,
	topicPodcastEpisodeVideoSections,
	topicPodcastEpisodeVideos,
} from "@carlnotes/db/schema/podcast"
import { and, eq } from "drizzle-orm"

// the topic, its latest film's podcast episode, and the user, null for a visitor
type IsTopicPodcastEpisodeVideoSectionOpenOptions = {
	topicId: string
	latestPodcastEpisodeId: string
	userId: string | null
}

/**
 * Returns whether Topic Cinema opens for a user. A choice saved on the latest film decides. Otherwise the section opens
 * until the user plays the latest film in either format, so a new film reopens a section closed on an older one. A
 * visitor sees it open.
 */
export async function isTopicPodcastEpisodeVideoSectionOpen({
	topicId,
	latestPodcastEpisodeId,
	userId,
}: IsTopicPodcastEpisodeVideoSectionOpenOptions): Promise<boolean> {
	if (!userId) {
		return true
	}

	// the user's saved choice on this topic, and the user's plays of the latest film's podcast episode
	const [[savedSectionRow], [listenRow]] = await Promise.all([
		db
			.select({
				isOpen: topicPodcastEpisodeVideoSections.isOpen,
				podcastEpisodeId: topicPodcastEpisodeVideoSections.podcastEpisodeId,
			})
			.from(topicPodcastEpisodeVideoSections)
			.where(
				and(eq(topicPodcastEpisodeVideoSections.userId, userId), eq(topicPodcastEpisodeVideoSections.topicId, topicId)),
			),
		db
			.select({ playCount: podcastEpisodeListens.playCount })
			.from(podcastEpisodeListens)
			.where(
				and(
					eq(podcastEpisodeListens.userId, userId),
					eq(podcastEpisodeListens.podcastEpisodeId, latestPodcastEpisodeId),
				),
			),
	])

	// a choice made on the latest film stands, and otherwise an unplayed film opens the section
	if (savedSectionRow?.podcastEpisodeId === latestPodcastEpisodeId) {
		return savedSectionRow.isOpen
	}
	return (listenRow?.playCount ?? 0) === 0
}

// the user, the topic, and the choice with the latest film when they chose
type SaveTopicPodcastEpisodeVideoSectionOptions = {
	userId: string
	topicId: string
	podcastEpisodeId: string
	isOpen: boolean
}

/**
 * Saves a user's choice to open or close Topic Cinema on a topic, with the latest film when they chose.
 */
export async function saveTopicPodcastEpisodeVideoSection({
	userId,
	topicId,
	podcastEpisodeId,
	isOpen,
}: SaveTopicPodcastEpisodeVideoSectionOptions): Promise<void> {
	const sectionChoice = { isOpen, podcastEpisodeId, updatedAt: new Date() }
	await db
		.insert(topicPodcastEpisodeVideoSections)
		.values({ userId, topicId, ...sectionChoice })
		.onConflictDoUpdate({
			target: [topicPodcastEpisodeVideoSections.userId, topicPodcastEpisodeVideoSections.topicId],
			set: sectionChoice,
		})
}

// the film's and the captions' types, and the field a platform player's JSON names each url in
export const TOPIC_PODCAST_EPISODE_VIDEO_FILE = { contentType: "video/mp4", urlFieldName: "videoUrl" } as const
export const TOPIC_PODCAST_EPISODE_VIDEO_CAPTIONS_FILE = {
	contentType: "text/vtt",
	urlFieldName: "captionsUrl",
} as const

// a ready film's stored keys, size, the image its intro and sign-off were drawn from, its own image, null for a film
// that shows its podcast episode's image, and the user its podcast episode bills
export type ReadyTopicPodcastEpisodeVideoFiles = {
	filmKey: string
	captionsKey: string | null
	byteSize: number | null
	renderedImageHash: string | null
	imageHash: string | null
	ownerId: string
}

// the podcast episode, and whether the user may edit it
type LoadTopicPodcastEpisodeVideoImageEditOptions = { podcastEpisodeId: string; canEditPodcastEpisode: boolean }

/**
 * Returns the origin and the image prompt of a film's own image as its page shows an editor. Both are null for anyone
 * else, and for a film with no image of its own.
 */
export async function loadTopicPodcastEpisodeVideoImageEdit({
	podcastEpisodeId,
	canEditPodcastEpisode,
}: LoadTopicPodcastEpisodeVideoImageEditOptions): Promise<
	Pick<PodcastEpisodePageResponse, "topicPodcastEpisodeVideoImageOrigin" | "topicPodcastEpisodeVideoImagePrompt">
> {
	// only an editor reads the film's image fields
	const [topicPodcastEpisodeVideo] = canEditPodcastEpisode
		? await db
				.select({
					imageOrigin: topicPodcastEpisodeVideos.imageOrigin,
					imagePrompt: topicPodcastEpisodeVideos.imagePrompt,
				})
				.from(topicPodcastEpisodeVideos)
				.where(eq(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodeId))
		: []
	return {
		topicPodcastEpisodeVideoImageOrigin: topicPodcastEpisodeVideo?.imageOrigin ?? null,
		topicPodcastEpisodeVideoImagePrompt: topicPodcastEpisodeVideo?.imagePrompt ?? null,
	}
}

/**
 * Returns whether a published podcast episode of the topic has a ready film.
 */
export async function hasReadyTopicPodcastEpisodeVideo(topicId: string): Promise<boolean> {
	// one ready film of a published podcast episode is enough
	const [readyFilmRow] = await db
		.select({ id: topicPodcastEpisodeVideos.id })
		.from(topicPodcastEpisodeVideos)
		.innerJoin(podcastEpisodes, eq(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodes.id))
		.where(
			and(
				eq(podcastEpisodes.topicId, topicId),
				eq(podcastEpisodes.status, "published"),
				eq(topicPodcastEpisodeVideos.status, "ready"),
			),
		)
		.limit(1)
	return readyFilmRow !== undefined
}

/**
 * Loads a podcast episode's ready film's files, or null.
 */
export async function loadReadyTopicPodcastEpisodeVideoFiles(
	podcastEpisodeId: string,
): Promise<ReadyTopicPodcastEpisodeVideoFiles | null> {
	// the ready row, with its podcast episode's owner
	const [readyFilmRow] = await db
		.select({
			filmKey: topicPodcastEpisodeVideos.filmKey,
			captionsKey: topicPodcastEpisodeVideos.captionsKey,
			byteSize: topicPodcastEpisodeVideos.byteSize,
			renderedImageHash: topicPodcastEpisodeVideos.renderedImageHash,
			imageHash: topicPodcastEpisodeVideos.imageHash,
			ownerId: podcastEpisodes.ownerId,
		})
		.from(topicPodcastEpisodeVideos)
		.innerJoin(podcastEpisodes, eq(podcastEpisodes.id, topicPodcastEpisodeVideos.podcastEpisodeId))
		.where(
			and(
				eq(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodeId),
				eq(topicPodcastEpisodeVideos.status, "ready"),
			),
		)

	// a ready row always has its film
	const filmKey = readyFilmRow?.filmKey
	return readyFilmRow && filmKey ? { ...readyFilmRow, filmKey } : null
}
