// a podcast episode film's row and its stored files: the render version, the status writes a render and a rebuild
// make, the swap that replaces a film rendered again, the upload that records its pending deletion first, what a
// render's minutes cost, and the failure a last attempt records

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
import { and, eq, lt, ne, sql } from "drizzle-orm"
import type { PgUpdateSetSource } from "drizzle-orm/pg-core"
import { recordReplacedImageDeletions } from "../topicImages/topicImageRenders"
import { loadTopicPodcastEpisodeVideoEpisode } from "./topicPodcastEpisodeVideoInputs"

// the render version a film is rendered at now. a ready film below it is rendered again, and a film from before render
// versions is at version 1. version 2 cuts each chapter into a montage
export const TOPIC_PODCAST_EPISODE_VIDEO_RENDER_VERSION = 2

// a ready film below the current render version
export const isTopicPodcastEpisodeVideoBelowRenderVersion = and(
	eq(topicPodcastEpisodeVideos.status, "ready"),
	lt(topicPodcastEpisodeVideos.renderVersion, TOPIC_PODCAST_EPISODE_VIDEO_RENDER_VERSION),
)

// the stored keys of a film's files, null for a part the timeline had no frames for
export type FilmObjectKeys = {
	introKey: string | null
	chaptersKey: string | null
	signOffKey: string | null
	filmKey: string
	captionsKey: string
}

/**
 * Writes a film row as failed for a podcast episode missing its audio, transcript, or chapters, so no later listing
 * finds the podcast episode again.
 */
export async function saveTopicPodcastEpisodeVideoSkipped(podcastEpisodeId: string): Promise<void> {
	const failedRow = { status: "failed" as const, error: "missing-inputs" }
	await db
		.insert(topicPodcastEpisodeVideos)
		.values({ podcastEpisodeId, ...failedRow })
		.onConflictDoUpdate({ target: topicPodcastEpisodeVideos.podcastEpisodeId, set: failedRow })
}

// a film row as a render reads it before it starts: its status, and the render version its stored film was rendered at
export type TopicPodcastEpisodeVideoRenderState = { status: "rendering" | "ready" | "failed"; renderVersion: number }

/**
 * Returns a podcast episode's film row as a render reads it, or null for a podcast episode with no film row.
 */
export async function loadTopicPodcastEpisodeVideoRenderState(
	podcastEpisodeId: string,
): Promise<TopicPodcastEpisodeVideoRenderState | null> {
	const [topicPodcastEpisodeVideo] = await db
		.select({ status: topicPodcastEpisodeVideos.status, renderVersion: topicPodcastEpisodeVideos.renderVersion })
		.from(topicPodcastEpisodeVideos)
		.where(eq(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodeId))
	return topicPodcastEpisodeVideo ?? null
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
 * Marks a film row ready at the current render version with its keys, size, and length, adds the render's cost to the
 * image's, and clears the uploads' pending deletions with it. A film removed meanwhile keeps its files pending
 * deletion.
 */
export async function saveTopicPodcastEpisodeVideoReady({
	podcastEpisodeId,
	...renderedFilm
}: SaveTopicPodcastEpisodeVideoReadyOptions): Promise<void> {
	await db.transaction(async (transaction) => {
		// mark the row ready, if it still exists
		const readyRows = await transaction
			.update(topicPodcastEpisodeVideos)
			.set({ status: "ready", ...toRenderedFilmColumns(renderedFilm) })
			.where(eq(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodeId))
			.returning({ id: topicPodcastEpisodeVideos.id })
		if (readyRows.length === 0) {
			return
		}

		// the stored keys now belong to the row
		for (const storedKey of toFilmStoredKeys(renderedFilm.objectKeys)) {
			await clearPendingObjectDeletion(storedKey, transaction)
		}
	})
}

/**
 * Swaps a ready film's keys, size, and length for the ones of the film rendered again at the current render version,
 * in one update, and schedules the replaced files for deletion after the grace. Only a film still ready below that
 * version is swapped. A film removed or already swapped meanwhile keeps the new files pending deletion.
 */
export async function saveTopicPodcastEpisodeVideoRerendered({
	podcastEpisodeId,
	...renderedFilm
}: SaveTopicPodcastEpisodeVideoReadyOptions): Promise<void> {
	await db.transaction(async (transaction) => {
		// read the files the row plays now and lock the row, if it is still ready below the current render version
		const isRerenderable = and(
			eq(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodeId),
			isTopicPodcastEpisodeVideoBelowRenderVersion,
		)
		const [replacedFilm] = await transaction
			.select({
				introKey: topicPodcastEpisodeVideos.introKey,
				chaptersKey: topicPodcastEpisodeVideos.chaptersKey,
				signOffKey: topicPodcastEpisodeVideos.signOffKey,
				filmKey: topicPodcastEpisodeVideos.filmKey,
				captionsKey: topicPodcastEpisodeVideos.captionsKey,
			})
			.from(topicPodcastEpisodeVideos)
			.where(isRerenderable)
			.for("no key update")

		// a film removed or already swapped meanwhile is left as it is
		if (!replacedFilm) {
			return
		}

		// swap the row's files, and the new keys belong to the row
		await transaction.update(topicPodcastEpisodeVideos).set(toRenderedFilmColumns(renderedFilm)).where(isRerenderable)
		const storedKeys = toFilmStoredKeys(renderedFilm.objectKeys)
		for (const storedKey of storedKeys) {
			await clearPendingObjectDeletion(storedKey, transaction)
		}

		// the files the row played until now go after the grace
		const replacedKeys = toFilmStoredKeys(replacedFilm).filter((replacedKey) => !storedKeys.includes(replacedKey))
		await recordReplacedImageDeletions(transaction, replacedKeys)
	})
}

// the columns a finished render writes: the keys, the size and length, the image the intro and sign-off were drawn
// from, the current render version with no failed one, and the render's cost added to what the film cost so far
function toRenderedFilmColumns({
	objectKeys,
	byteSize,
	durationSeconds,
	imageHash,
	costDollars,
}: Omit<SaveTopicPodcastEpisodeVideoReadyOptions, "podcastEpisodeId">): PgUpdateSetSource<
	typeof topicPodcastEpisodeVideos
> {
	return {
		error: null,
		...objectKeys,
		byteSize,
		durationSeconds: Math.round(durationSeconds),
		renderedImageHash: imageHash,
		renderVersion: TOPIC_PODCAST_EPISODE_VIDEO_RENDER_VERSION,
		failedRenderVersion: null,
		cost: sql`${topicPodcastEpisodeVideos.cost} + ${costDollars.toFixed(6)}`,
	}
}

// a film's stored keys, without the parts the timeline had no frames for
function toFilmStoredKeys(objectKeys: Record<keyof FilmObjectKeys, string | null>): string[] {
	return Object.values(objectKeys).filter((objectKey): objectKey is string => Boolean(objectKey))
}

/**
 * Records that a ready film's render at the current render version failed for good, and leaves the film that plays as
 * it is. Returns whether the podcast episode had a ready film.
 */
export async function saveTopicPodcastEpisodeVideoRerenderFailed(podcastEpisodeId: string): Promise<boolean> {
	const isReadyFilm = and(
		eq(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodeId),
		eq(topicPodcastEpisodeVideos.status, "ready"),
	)
	const failedRows = await db
		.update(topicPodcastEpisodeVideos)
		.set({ failedRenderVersion: TOPIC_PODCAST_EPISODE_VIDEO_RENDER_VERSION })
		.where(isReadyFilm)
		.returning({ id: topicPodcastEpisodeVideos.id })
	return failedRows.length > 0
}

/**
 * Marks a film failed after its last attempt, reports the error, and records the failure for analytics. A ready film
 * whose render at the current render version failed stays ready, with that version recorded as failed.
 */
export async function markTopicPodcastEpisodeVideoFailed(podcastEpisodeId: string, error: string): Promise<void> {
	// read the podcast episode's topic and owner for the report. a ready film keeps playing
	const topicPodcastEpisodeVideoEpisode = await loadTopicPodcastEpisodeVideoEpisode(podcastEpisodeId)
	const isReadyFilmKept = await saveTopicPodcastEpisodeVideoRerenderFailed(podcastEpisodeId)

	// any other row is marked failed, unless another render saved it ready meanwhile, and the failure is reported
	if (!isReadyFilmKept) {
		const isUnfinished = and(
			eq(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodeId),
			ne(topicPodcastEpisodeVideos.status, "ready"),
		)
		await db
			.update(topicPodcastEpisodeVideos)
			.set({ status: "failed", error: error.slice(0, 500) })
			.where(isUnfinished)
	}
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
