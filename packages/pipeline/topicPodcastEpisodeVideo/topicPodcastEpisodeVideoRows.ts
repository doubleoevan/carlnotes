// a podcast episode film's row and its stored files: the status writes a render and a rebuild make, the upload that
// records its pending deletion first, what a render's minutes cost, and the failure a last attempt records

import { db } from "@carlnotes/db"
import { topicPodcastEpisodeVideos } from "@carlnotes/db/schema/podcast"
import {
	clearPendingObjectDeletion,
	recordPendingObjectDeletionBeforeUpload,
	uploadPodcastEpisodeFile,
} from "@carlnotes/db/store"
import { TOPIC_PODCAST_EPISODE_VIDEO_DOLLARS_PER_MINUTE } from "@carlnotes/models/budget"
import { trackEvent } from "@carlnotes/server/analytics"
import { reportError } from "@carlnotes/server/monitoring"
import { eq, sql } from "drizzle-orm"
import { loadTopicPodcastEpisodeVideoEpisode } from "./topicPodcastEpisodeVideoInputs"

// the stored keys of a film's files, null for a part the timeline had no frames for
export type FilmObjectKeys = {
	introKey: string | null
	chaptersKey: string | null
	signOffKey: string | null
	filmKey: string
	captionsKey: string
}

// why a render drew no film: an owner past the podcast episode spend cutoff, or a podcast episode missing its audio,
// transcript, or chapters
export type TopicPodcastEpisodeVideoSkipReason = "spend-cutoff" | "missing-inputs"

/**
 * Writes a podcast episode's film row as failed, with the reason its render was skipped as the error, so no later
 * listing finds the podcast episode again.
 */
export async function saveTopicPodcastEpisodeVideoSkipped(
	podcastEpisodeId: string,
	reason: TopicPodcastEpisodeVideoSkipReason,
): Promise<void> {
	const failedRow = { status: "failed" as const, error: reason }
	await db
		.insert(topicPodcastEpisodeVideos)
		.values({ podcastEpisodeId, ...failedRow })
		.onConflictDoUpdate({ target: topicPodcastEpisodeVideos.podcastEpisodeId, set: failedRow })
}

/**
 * Returns whether a podcast episode's film is already ready, which a retried workflow finds.
 */
export async function isTopicPodcastEpisodeVideoReady(podcastEpisodeId: string): Promise<boolean> {
	const [topicPodcastEpisodeVideo] = await db
		.select({ status: topicPodcastEpisodeVideos.status })
		.from(topicPodcastEpisodeVideos)
		.where(eq(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodeId))
	return topicPodcastEpisodeVideo?.status === "ready"
}

/**
 * Writes a podcast episode's film row as rendering, clearing a failed attempt's error.
 */
export async function saveTopicPodcastEpisodeVideoRendering(podcastEpisodeId: string): Promise<void> {
	await db
		.insert(topicPodcastEpisodeVideos)
		.values({ podcastEpisodeId, status: "rendering" })
		.onConflictDoUpdate({
			target: topicPodcastEpisodeVideos.podcastEpisodeId,
			set: { status: "rendering", error: null },
		})
}

// the podcast episode, the film's stored keys, its size and length, the image its intro and sign-off were drawn from,
// and what the render cost
type SaveTopicPodcastEpisodeVideoReadyOptions = {
	podcastEpisodeId: string
	objectKeys: FilmObjectKeys
	byteSize: number
	durationSeconds: number
	imageHash: string
	costDollars: number
}

/**
 * Marks a film row ready with its keys, size, and length, adds the render's cost to the image's, and clears the
 * uploads' pending deletions with it. A film removed meanwhile keeps its files pending deletion.
 */
export async function saveTopicPodcastEpisodeVideoReady({
	podcastEpisodeId,
	objectKeys,
	byteSize,
	durationSeconds,
	imageHash,
	costDollars,
}: SaveTopicPodcastEpisodeVideoReadyOptions): Promise<void> {
	await db.transaction(async (transaction) => {
		// mark the row ready, if it still exists
		const readyRows = await transaction
			.update(topicPodcastEpisodeVideos)
			.set({
				status: "ready",
				error: null,
				...objectKeys,
				byteSize,
				durationSeconds: Math.round(durationSeconds),
				renderedImageHash: imageHash,
				cost: sql`${topicPodcastEpisodeVideos.cost} + ${costDollars.toFixed(6)}`,
			})
			.where(eq(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodeId))
			.returning({ id: topicPodcastEpisodeVideos.id })
		if (readyRows.length === 0) {
			return
		}

		// the stored keys now belong to the row
		const storedKeys = Object.values(objectKeys).filter((objectKey): objectKey is string => Boolean(objectKey))
		for (const storedKey of storedKeys) {
			await clearPendingObjectDeletion(storedKey, transaction)
		}
	})
}

/**
 * Marks a film failed after its last attempt, reports the error, and records the failure for analytics.
 */
export async function markTopicPodcastEpisodeVideoFailed(podcastEpisodeId: string, error: string): Promise<void> {
	// mark the row failed, and read the podcast episode's topic and owner for the report
	const topicPodcastEpisodeVideoEpisode = await loadTopicPodcastEpisodeVideoEpisode(podcastEpisodeId)
	await db
		.update(topicPodcastEpisodeVideos)
		.set({ status: "failed", error: error.slice(0, 500) })
		.where(eq(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodeId))
	reportError(new Error("a podcast episode film failed to render"), "topic-podcast-episode-video", {
		podcastEpisodeId,
		error: error.slice(0, 200),
	})

	// the failure event holds ids and a short reason code only
	if (topicPodcastEpisodeVideoEpisode) {
		trackEvent("episode_video_render_failed", topicPodcastEpisodeVideoEpisode.ownerId, {
			topicId: topicPodcastEpisodeVideoEpisode.topicId,
			podcastEpisodeId,
			reason: toRenderFailureReason(error),
		})
	}
}

// a file to upload, its key and type, and the keys uploaded so far, which a failure deletes
type UploadTopicPodcastEpisodeVideoFileOptions = {
	filePath: string | null
	key: string
	contentType: string
	uploadedKeys: string[]
}

/**
 * Uploads one film file under its key if the file exists, recording a pending deletion first so a crash between the
 * two still cleans the upload up. Returns the key, or null for no file.
 */
export async function uploadTopicPodcastEpisodeVideoFile({
	filePath,
	key,
	contentType,
	uploadedKeys,
}: UploadTopicPodcastEpisodeVideoFileOptions): Promise<string | null> {
	if (!filePath) {
		return null
	}

	// the pending deletion goes first, and the row's update clears it
	await recordPendingObjectDeletionBeforeUpload(key)
	uploadedKeys.push(key)
	await uploadPodcastEpisodeFile({ key, filePath, contentType })
	return key
}

/**
 * Returns what rendering a number of film seconds costs.
 */
export function toTopicPodcastEpisodeVideoCostDollars(renderedSeconds: number): number {
	return (renderedSeconds / 60) * TOPIC_PODCAST_EPISODE_VIDEO_DOLLARS_PER_MINUTE
}

// a short reason code from a failure's message, which the analytics event includes instead of the message
function toRenderFailureReason(error: string): string {
	// a failed encode or probe names its tool
	if (error.startsWith("ffmpeg")) {
		return "ffmpeg"
	}
	if (error.startsWith("ffprobe")) {
		return "ffprobe"
	}

	// any other failure is a timeout or something else
	return /timed? ?out/i.test(error) ? "timeout" : "other"
}
