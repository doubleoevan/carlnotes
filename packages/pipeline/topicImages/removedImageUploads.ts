// an uploaded image that is taken down, for a Topic, a Podcast Episode, a Topic Post, and a film. an admin's removal
// of a reported image removes the upload and draws the image again on the platform's budget. the sweep's removal of
// an upload that its later check flagged removes the upload, draws nothing, and stops each film drawn from the upload
// until it is rebuilt

import { db } from "@carlnotes/db"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import { topicImageModel, topicImageRegenerateModel } from "@carlnotes/models/topicImageModel"
import { reportError } from "@carlnotes/server/monitoring"
import { and, eq, ne } from "drizzle-orm"
import { removePodcastEpisodeImageUpload } from "../podcast/podcastEpisodeImageRenders"
import { startTopicPodcastEpisodeVideoRebuild } from "../temporalClient"
import { removeTopicPodcastEpisodeVideoImageUpload } from "../topicPodcastEpisodeVideo/topicPodcastEpisodeVideoImage"
import { saveImageTopicPodcastEpisodeVideosRendering } from "../topicPodcastEpisodeVideo/topicPodcastEpisodeVideoRows"
import { removeTopicPostImageUpload } from "../topicPosts/topicPostImageRenders"
import type { UncheckedImageHashSubject } from "../uncheckedImages"
import { removeTopicImageUpload, startTopicImageRender } from "./topicImageRenders"

/**
 * Removes a Topic's uploaded image, then draws the Topic's image again on the platform's budget. A Topic that is gone
 * is skipped.
 */
export async function regenerateRemovedTopicImage(topicId: string): Promise<void> {
	const [topic] = await db.select({ id: topics.id }).from(topics).where(eq(topics.id, topicId))
	if (topic) {
		await removeTopicImageUpload(topicId)
		await startTopicImageRender({ topicId, userId: null, kind: "admin", model: topicImageModel() })
	}
}

/**
 * Removes a Topic Post's uploaded image, then draws the post's image again on the platform's budget. A post that is
 * gone is skipped.
 */
export async function regenerateRemovedTopicPostImage(topicPostId: string): Promise<void> {
	const [topicPost] = await db
		.select({ topicId: topicPosts.topicId })
		.from(topicPosts)
		.where(eq(topicPosts.id, topicPostId))
	if (!topicPost) {
		return
	}

	// the render row names the post, bills no user, and is the admin's
	await removeTopicPostImageUpload(topicPostId)
	await startTopicImageRender({
		topicId: topicPost.topicId,
		topicPostId,
		userId: null,
		kind: "admin",
		model: topicImageModel(),
	})
}

/**
 * Removes a Podcast Episode's uploaded image, then draws the podcast episode's image again on the platform's budget.
 * A podcast episode that is gone, removed, or left with no topic is skipped.
 */
export async function regenerateRemovedPodcastEpisodeImage(podcastEpisodeId: string): Promise<void> {
	const topicId = await loadPodcastEpisodeTopicId(podcastEpisodeId)
	if (!topicId) {
		return
	}

	// the render row names the podcast episode, bills no user, and is the admin's
	await removePodcastEpisodeImageUpload(podcastEpisodeId)
	await startTopicImageRender({
		topicId,
		podcastEpisodeId,
		userId: null,
		kind: "admin",
		model: topicImageModel(),
	})
}

/**
 * Removes a film's uploaded image, then draws the film's image again on the platform's budget, which rebuilds its
 * intro and sign-off. A film whose image is not an upload, and a podcast episode that is gone, removed, or left with
 * no topic, are skipped.
 */
export async function regenerateRemovedTopicPodcastEpisodeVideoImage(podcastEpisodeId: string): Promise<void> {
	const topicId = await loadPodcastEpisodeTopicId(podcastEpisodeId)
	if (!topicId) {
		return
	}

	// a film's own image is drawn on the better model. the render row names the film, bills no user, and is the admin's
	const topicPodcastEpisodeVideoId = await removeTopicPodcastEpisodeVideoImageUpload(podcastEpisodeId)
	if (topicPodcastEpisodeVideoId) {
		await startTopicImageRender({
			topicId,
			topicPodcastEpisodeVideoId,
			userId: null,
			kind: "admin",
			model: topicImageRegenerateModel(),
		})
	}
}

// the topic of a podcast episode, or null for a podcast episode that is gone, removed, or left with no topic
async function loadPodcastEpisodeTopicId(podcastEpisodeId: string): Promise<string | null> {
	const [podcastEpisode] = await db
		.select({ topicId: podcastEpisodes.topicId })
		.from(podcastEpisodes)
		.where(and(eq(podcastEpisodes.id, podcastEpisodeId), ne(podcastEpisodes.status, "removed")))
	return podcastEpisode?.topicId ?? null
}

/**
 * Removes the uploaded image of a Topic, a Podcast Episode, a Topic Post, or a film, and draws no image in its place.
 * An image that is not an upload stays. Each ready film drawn from the image is marked rendering before the upload
 * goes, so the film plays again only once it is rebuilt from the image it shows then.
 */
export async function removeImageUpload(
	uncheckedImageSubject: UncheckedImageHashSubject,
	imageHash: string,
): Promise<void> {
	// no film drawn from the image plays from here on
	const podcastEpisodeIds = await saveImageTopicPodcastEpisodeVideosRendering(db, {
		...uncheckedImageSubject,
		imageHash,
	})
	await removeSubjectImageUpload(uncheckedImageSubject)

	// rebuild each of those films. a failed start is reported, and the film stays marked rendering
	for (const podcastEpisodeId of podcastEpisodeIds) {
		await startTopicPodcastEpisodeVideoRebuild(podcastEpisodeId).catch((error: unknown) => {
			reportError(error, "topic-podcast-episode-video", { podcastEpisodeId, step: "rebuild" })
		})
	}
}

// remove a subject's uploaded image by its kind
async function removeSubjectImageUpload({ subjectKind, subjectId }: UncheckedImageHashSubject): Promise<void> {
	switch (subjectKind) {
		// a topic's upload, and a podcast episode's
		case "topicImage":
			await removeTopicImageUpload(subjectId)
			return
		case "podcastEpisodeImage":
			await removePodcastEpisodeImageUpload(subjectId)
			return
		// a Topic Post's upload, and a film's, which its podcast episode names
		case "topicPostImage":
			await removeTopicPostImageUpload(subjectId)
			return
		case "topicPodcastEpisodeVideoImage":
			await removeTopicPodcastEpisodeVideoImageUpload(subjectId)
	}
}
