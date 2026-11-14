// a Topic that turns invite or public while an image under it is published with its check still to run. each such
// image goes back to its uploader alone in the transaction that writes the Topic's visibility, each film drawn from it
// stops playing in that transaction, and the files drawn from it are drawn again once that transaction has committed

import type { Visibility } from "@carlnotes/contracts/enums"
import { type DbTransaction, db } from "@carlnotes/db"
import { podcastEpisodes, topicPodcastEpisodeVideos } from "@carlnotes/db/schema/podcast"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import {
	deleteUncheckedImageById,
	isUncheckedImageStillStored,
	loadTopicPublishedUncheckedImages,
	lockTopicImageVisibility,
	lockUncheckedImageSubject,
	saveUncheckedImageUnpublished,
	type UncheckedImageRow,
} from "@carlnotes/db/uncheckedImages"
import { reportError } from "@carlnotes/server/monitoring"
import { and, eq, isNotNull, isNull, or } from "drizzle-orm"
import { clearPodcastEpisodeImage } from "./podcast/podcastEpisodeImageRenders"
import { startTopicPodcastEpisodeVideoRebuild } from "./temporalClient"
import { forgetTopicCovers } from "./topicImages/topicCovers"
import { clearTopicImage } from "./topicImages/topicImageRenders"
import { clearTopicPodcastEpisodeVideoImage } from "./topicPodcastEpisodeVideo/topicPodcastEpisodeVideoImage"
import { saveImageTopicPodcastEpisodeVideosRendering } from "./topicPodcastEpisodeVideo/topicPodcastEpisodeVideoRows"
import { clearTopicPostImage } from "./topicPosts/topicPostImageRenders"
import {
	isUncheckedAvatarKind,
	loadUncheckedImageSubjectState,
	type UncheckedImageHashSubject,
} from "./uncheckedImages"

// a Topic's visibility write: the Topic, and the visibility the write gives it
export type UnpublishTopicUncheckedImagesOptions = { topicId: string; visibility: Visibility }

/**
 * Unpublishes a private Topic's published unchecked images, on the transaction that makes the Topic invite
 * or public, before that transaction writes the Topic's row. Each published image whose check has not run, of the
 * Topic, of its podcast episodes and their films, and of its Topic Posts, stops being its subject's image and is
 * shown to its uploader alone until the sweep checks it. Its files stay, and each ready film drawn from it is marked
 * rendering, so the film plays again only once it is rebuilt from another image. Returns the subjects whose image was
 * unpublished.
 */
export async function unpublishTopicUncheckedImages(
	transaction: DbTransaction,
	{ topicId, visibility }: UnpublishTopicUncheckedImagesOptions,
): Promise<UncheckedImageHashSubject[]> {
	// a Topic that stays or turns private keeps its images
	if (visibility === "private") {
		return []
	}

	// no unchecked upload under the Topic is published from here until the transaction ends. only a Topic that is
	// private now has an unchecked image that everyone who may open it sees
	await lockTopicImageVisibility(transaction, topicId, "exclusive")
	const [topic] = await transaction.select({ visibility: topics.visibility }).from(topics).where(eq(topics.id, topicId))
	if (topic?.visibility !== "private") {
		return []
	}

	// lock every unchecked image's subject before any row is written, so this transaction never waits for a subject's
	// lock with a row locked that the lock's owner writes
	const publishedUncheckedImages = await loadTopicPublishedUncheckedImages(transaction, topicId)
	for (const publishedUncheckedImage of publishedUncheckedImages) {
		await lockUncheckedImageSubject(transaction, publishedUncheckedImage)
	}

	// each image goes back to its uploader alone
	const uncheckedImageSubjects: UncheckedImageHashSubject[] = []
	for (const publishedUncheckedImage of publishedUncheckedImages) {
		const uncheckedImageSubject = await unpublishUncheckedImage(transaction, publishedUncheckedImage)
		uncheckedImageSubjects.push(...(uncheckedImageSubject ? [uncheckedImageSubject] : []))
	}
	return uncheckedImageSubjects
}

/**
 * Draws again what was drawn from the images that went back to their uploaders, once the transaction that unpublished
 * them has committed: a Topic's cached podcast feeds and stored covers are deleted, and the rebuild starts for each
 * film whose intro and sign-off show one of the images.
 */
export async function redrawUnpublishedImageFiles(
	topicId: string,
	uncheckedImageSubjects: UncheckedImageHashSubject[],
): Promise<void> {
	// the Topic's image is drawn into its covers
	if (uncheckedImageSubjects.some(({ subjectKind }) => subjectKind === "topicImage")) {
		await forgetTopicCovers(topicId)
	}
	await startImageTopicPodcastEpisodeVideoRebuilds(uncheckedImageSubjects)
}

/**
 * Starts the rebuild of each film whose intro and sign-off show one of the images: the film of a podcast episode's
 * image or of a film's own, and for a Topic's image each of the Topic's films that has no image of its own or of its
 * podcast episode.
 */
export async function startImageTopicPodcastEpisodeVideoRebuilds(
	uncheckedImageSubjects: UncheckedImageHashSubject[],
): Promise<void> {
	// the podcast episodes whose own image or whose film's image is one of the images
	const podcastEpisodeIds = uncheckedImageSubjects
		.filter(({ subjectKind }) => subjectKind !== "topicImage" && subjectKind !== "topicPostImage")
		.map(({ subjectId }) => subjectId)

	// a Topic's image is drawn into each film that has no image of its own or of its podcast episode
	for (const { subjectKind, subjectId } of uncheckedImageSubjects) {
		if (subjectKind === "topicImage") {
			podcastEpisodeIds.push(...(await loadTopicImageFilmPodcastEpisodeIds(subjectId)))
		}
	}

	// start each film's rebuild once. a failed start is reported, and the film's next play starts the rebuild
	for (const podcastEpisodeId of new Set(podcastEpisodeIds)) {
		await startTopicPodcastEpisodeVideoRebuild(podcastEpisodeId).catch((error: unknown) => {
			reportError(error, "topic-podcast-episode-video", { podcastEpisodeId, step: "rebuild" })
		})
	}
}

// unpublish one published unchecked image, so its uploader alone sees it. an unchecked image that is no longer its
// subject's current one is deleted instead. returns the subject whose image was unpublished, or null
async function unpublishUncheckedImage(
	transaction: DbTransaction,
	publishedUncheckedImage: UncheckedImageRow,
): Promise<UncheckedImageHashSubject | null> {
	// an avatar's unchecked image is never marked published, and an unchecked image that was dropped while this
	// transaction waited for its lock is gone
	const { subjectKind, subjectId, imageHash } = publishedUncheckedImage
	if (
		isUncheckedAvatarKind(subjectKind) ||
		!(await isUncheckedImageStillStored(transaction, publishedUncheckedImage))
	) {
		return null
	}

	// lock the subject's row, so no render makes another image the subject's current one between the read and the clear
	const uncheckedImageSubject = { subjectKind, subjectId }
	await lockSubjectRow(transaction, uncheckedImageSubject)

	// an image that another image replaced has its unchecked image deleted
	const subjectState = await loadUncheckedImageSubjectState(uncheckedImageSubject, transaction)
	if (subjectState?.currentImageHash !== imageHash) {
		await deleteUncheckedImageById(transaction, publishedUncheckedImage)
		return null
	}

	// the subject shows no image, and the image is shown to its uploader alone until its check runs
	await clearSubjectImage(transaction, uncheckedImageSubject)
	await saveUncheckedImageUnpublished(transaction, publishedUncheckedImage)

	// no film drawn from the image plays until it is rebuilt
	if (imageHash) {
		await saveImageTopicPodcastEpisodeVideosRendering(transaction, { ...uncheckedImageSubject, imageHash })
	}
	return uncheckedImageSubject
}

// lock the row that names a subject's current image on the caller's transaction, as a render's write of that image
// does
async function lockSubjectRow(
	transaction: DbTransaction,
	{ subjectKind, subjectId }: UncheckedImageHashSubject,
): Promise<void> {
	switch (subjectKind) {
		// a topic's row
		case "topicImage":
			await transaction.select({ id: topics.id }).from(topics).where(eq(topics.id, subjectId)).for("no key update")
			return
		// a podcast episode's row
		case "podcastEpisodeImage":
			await transaction
				.select({ id: podcastEpisodes.id })
				.from(podcastEpisodes)
				.where(eq(podcastEpisodes.id, subjectId))
				.for("no key update")
			return
		// a Topic Post's row
		case "topicPostImage":
			await transaction
				.select({ id: topicPosts.id })
				.from(topicPosts)
				.where(eq(topicPosts.id, subjectId))
				.for("no key update")
			return
		// a film's row, which its podcast episode names
		case "topicPodcastEpisodeVideoImage":
			await transaction
				.select({ id: topicPodcastEpisodeVideos.id })
				.from(topicPodcastEpisodeVideos)
				.where(eq(topicPodcastEpisodeVideos.podcastEpisodeId, subjectId))
				.for("no key update")
	}
}

// clear a subject's current image on the caller's transaction, and keep the image's files
async function clearSubjectImage(
	transaction: DbTransaction,
	{ subjectKind, subjectId }: UncheckedImageHashSubject,
): Promise<void> {
	switch (subjectKind) {
		// a topic's image, and a podcast episode's
		case "topicImage":
			return clearTopicImage(transaction, subjectId)
		case "podcastEpisodeImage":
			return clearPodcastEpisodeImage(transaction, subjectId)
		// a Topic Post's image, and a film's, which its podcast episode names
		case "topicPostImage":
			return clearTopicPostImage(transaction, subjectId)
		case "topicPodcastEpisodeVideoImage":
			return clearTopicPodcastEpisodeVideoImage(transaction, subjectId)
	}
}

// the podcast episodes of a Topic whose film is rebuilt for the Topic's image. a ready film shows the Topic's image
// if neither the film nor its podcast episode has an image of its own, and a film marked rendering with its stored
// film was drawn from an image that was unpublished
async function loadTopicImageFilmPodcastEpisodeIds(topicId: string): Promise<string[]> {
	const isTopicImageShown = and(
		eq(topicPodcastEpisodeVideos.status, "ready"),
		isNull(podcastEpisodes.imageHash),
		isNull(topicPodcastEpisodeVideos.imageHash),
	)
	const isMarkedRendering = and(
		eq(topicPodcastEpisodeVideos.status, "rendering"),
		isNotNull(topicPodcastEpisodeVideos.filmKey),
	)
	const podcastEpisodeRows = await db
		.select({ id: podcastEpisodes.id })
		.from(topicPodcastEpisodeVideos)
		.innerJoin(podcastEpisodes, eq(podcastEpisodes.id, topicPodcastEpisodeVideos.podcastEpisodeId))
		.where(and(eq(podcastEpisodes.topicId, topicId), or(isTopicImageShown, isMarkedRendering)))
	return podcastEpisodeRows.map((podcastEpisodeRow) => podcastEpisodeRow.id)
}
