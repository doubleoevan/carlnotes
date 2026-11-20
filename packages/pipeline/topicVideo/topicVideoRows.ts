// a podcast episode film's row and its stored files: the render version, the status writes a render and a rebuild
// make, the write that stops the films drawn from an image, publication of a replacement film, the upload
// that records its pending deletion first, and what a render's minutes cost

import type { UncheckedImageSubjectKind } from "@carlnotes/contracts/enums"
import { type DbHandle, db } from "@carlnotes/db"
import { podcastEpisodes, topicVideos } from "@carlnotes/db/schema/podcast"
import type { SpendKind } from "@carlnotes/db/schema/spends"
import { recordSpend } from "@carlnotes/db/spends"
import {
	clearPendingObjectDeletion,
	recordPendingObjectDeletionBeforeUpload,
	uploadPodcastEpisodeFile,
} from "@carlnotes/db/store"
import { TOPIC_VIDEO_DOLLARS_PER_MINUTE } from "@carlnotes/models/budget"
import { reportError } from "@carlnotes/server/monitoring"
import { and, eq, inArray, lt, ne, sql } from "drizzle-orm"
import type { PgUpdateSetSource } from "drizzle-orm/pg-core"
import { recordReplacedImageDeletions } from "../topicImages/topicImageRenders"
import { checkTopicVideoImage, checkVideoSceneSources, type VideoSceneSource } from "./topicVideoImageCheck"

// the render version a film is rendered at now. a ready film below it is rendered again, and a film from before render
// versions is at version 1. version 2 cuts each chapter into a montage. version 3 cuts the intro and the sign-off
// through the chapters' images, draws the generated images in the second style, and shows the Resource Images that
// image filter version 1 keeps
export const TOPIC_VIDEO_RENDER_VERSION = 3

// a ready film below the current render version
export const isTopicVideoBelowRenderVersion = and(
	eq(topicVideos.status, "ready"),
	lt(topicVideos.renderVersion, TOPIC_VIDEO_RENDER_VERSION),
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
export async function saveTopicVideoSkipped(podcastEpisodeId: string): Promise<void> {
	const failedRow = { status: "failed" as const, error: "missing-inputs" }
	await db
		.insert(topicVideos)
		.values({ podcastEpisodeId, ...failedRow })
		.onConflictDoUpdate({
			target: topicVideos.podcastEpisodeId,
			set: failedRow,
			setWhere: ne(topicVideos.status, "ready"),
		})
}

// a film row as a render reads it before it starts: its status, and the render version its stored film was rendered at
export type TopicVideoRenderState = { status: "rendering" | "ready" | "failed"; renderVersion: number }

/**
 * Returns a podcast episode's film row as a render reads it, or null for a podcast episode with no film row.
 */
export async function loadTopicVideoRenderState(podcastEpisodeId: string): Promise<TopicVideoRenderState | null> {
	const [topicVideo] = await db
		.select({ status: topicVideos.status, renderVersion: topicVideos.renderVersion })
		.from(topicVideos)
		.where(eq(topicVideos.podcastEpisodeId, podcastEpisodeId))
	return topicVideo ?? null
}

/**
 * Writes a podcast episode's film row as rendering, clearing a failed attempt's error.
 */
export async function saveTopicVideoRendering(podcastEpisodeId: string): Promise<void> {
	await db
		.insert(topicVideos)
		.values({ podcastEpisodeId, status: "rendering" })
		.onConflictDoUpdate({
			target: topicVideos.podcastEpisodeId,
			set: { status: "rendering", error: null },
			setWhere: ne(topicVideos.status, "ready"),
		})
}

/**
 * Returns whether a podcast episode is published. One that was removed, or deleted with its Topic or its owner's
 * account, is not.
 */
export async function isPodcastEpisodePublished(podcastEpisodeId: string): Promise<boolean> {
	const [podcastEpisode] = await db
		.select({ status: podcastEpisodes.status })
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.id, podcastEpisodeId))
	return podcastEpisode?.status === "published"
}

/**
 * Writes a published podcast episode's film row as rendering once its render is queued, before a film slot is free. A
 * podcast episode that is not published gets no row, because its render is skipped.
 */
export async function saveQueuedTopicVideoRendering(podcastEpisodeId: string): Promise<void> {
	if (await isPodcastEpisodePublished(podcastEpisodeId)) {
		await saveTopicVideoRendering(podcastEpisodeId)
	}
}

// an image that no film may show any longer: what the image was for, the id of its Topic or its podcast episode, and
// its hash
export type SaveImageTopicVideosRenderingOptions = {
	subjectKind: UncheckedImageSubjectKind
	subjectId: string
	imageHash: string
}

/**
 * Marks each ready film drawn from an image as rendering, on the caller's transaction if there is one, so no film that
 * shows the image plays until its rebuild. The image is a Topic's, a podcast episode's, or a film's own. Each film
 * keeps its stored files, which its rebuild reads. Returns the podcast episodes of those films.
 */
export async function saveImageTopicVideosRendering(
	handle: DbHandle,
	{ subjectKind, subjectId, imageHash }: SaveImageTopicVideosRenderingOptions,
): Promise<string[]> {
	// no film shows a Topic Post's image or an avatar
	const isTopicImage = subjectKind === "topicImage"
	if (!isTopicImage && subjectKind !== "podcastEpisodeImage" && subjectKind !== "topicPodcastEpisodeVideoImage") {
		return []
	}

	// the film of the image's podcast episode, or the films of every podcast episode of the image's Topic
	const topicPodcastEpisodeIds = handle
		.select({ id: podcastEpisodes.id })
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.topicId, subjectId))
	const isImagePodcastEpisode = isTopicImage
		? inArray(topicVideos.podcastEpisodeId, topicPodcastEpisodeIds)
		: eq(topicVideos.podcastEpisodeId, subjectId)

	// only a ready film whose intro and sign-off were drawn from the image stops playing
	const renderingRows = await handle
		.update(topicVideos)
		.set({ status: "rendering" })
		.where(and(isImagePodcastEpisode, eq(topicVideos.status, "ready"), eq(topicVideos.renderedImageHash, imageHash)))
		.returning({ podcastEpisodeId: topicVideos.podcastEpisodeId })
	return renderingRows.map((renderingRow) => renderingRow.podcastEpisodeId)
}

// the podcast episode, the film's stored keys, its size and length, the image its intro and sign-off were drawn from,
// and what the render cost
type SaveTopicVideoReadyOptions = {
	signal?: AbortSignal
	sceneSources?: VideoSceneSource[]
	renderVersion?: number
	topicId?: string
	podcastEpisodeId: string
	// what the render stored, and what it cost
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
export async function saveTopicVideoReady({
	podcastEpisodeId,
	...renderedFilm
}: SaveTopicVideoReadyOptions): Promise<void> {
	await db.transaction(async (transaction) => {
		if (renderedFilm.renderVersion === 4 && renderedFilm.topicId) {
			await checkVideoSceneSources(transaction, podcastEpisodeId, renderedFilm.sceneSources ?? [])
			await checkTopicVideoImage(transaction, {
				podcastEpisodeId,
				topicId: renderedFilm.topicId,
				imageHash: renderedFilm.imageHash,
			})
		}
		renderedFilm.signal?.throwIfAborted()
		// mark the row ready, if it still exists
		const readyRows = await transaction
			.update(topicVideos)
			.set({ status: "ready", ...toRenderedFilmColumns(renderedFilm) })
			.where(and(eq(topicVideos.podcastEpisodeId, podcastEpisodeId), eq(topicVideos.status, "rendering")))
			.returning({ id: topicVideos.id })
		if (readyRows.length === 0) {
			return
		}

		// the stored keys now belong to the row
		for (const storedKey of toFilmStoredKeys(renderedFilm.objectKeys)) {
			await clearPendingObjectDeletion(storedKey, transaction)
		}
		renderedFilm.signal?.throwIfAborted()
	})
}

/**
 * Publishes a complete replacement for a ready film below the target render version. The old files stay available
 * through the deletion grace period. A competing publication or deletion leaves the unused uploads pending cleanup.
 */
export async function publishTopicVideoReplacement({
	podcastEpisodeId,
	...renderedFilm
}: SaveTopicVideoReadyOptions): Promise<void> {
	await db.transaction(async (transaction) => {
		// read the files the row plays now and lock the row, if it is still ready below the current render version
		if (renderedFilm.renderVersion === 4 && renderedFilm.topicId) {
			await checkVideoSceneSources(transaction, podcastEpisodeId, renderedFilm.sceneSources ?? [])
			await checkTopicVideoImage(transaction, {
				podcastEpisodeId,
				topicId: renderedFilm.topicId,
				imageHash: renderedFilm.imageHash,
			})
		}
		const isRerenderable = and(
			eq(topicVideos.podcastEpisodeId, podcastEpisodeId),
			eq(topicVideos.status, "ready"),
			lt(topicVideos.renderVersion, renderedFilm.renderVersion ?? TOPIC_VIDEO_RENDER_VERSION),
		)
		const [replacedFilm] = await transaction
			.select({
				introKey: topicVideos.introKey,
				chaptersKey: topicVideos.chaptersKey,
				signOffKey: topicVideos.signOffKey,
				filmKey: topicVideos.filmKey,
				captionsKey: topicVideos.captionsKey,
			})
			.from(topicVideos)
			.where(isRerenderable)
			.for("no key update")

		// another render may have published a replacement while these files were uploading
		if (!replacedFilm) {
			return
		}

		renderedFilm.signal?.throwIfAborted()
		// publish all replacement files together
		await transaction.update(topicVideos).set(toRenderedFilmColumns(renderedFilm)).where(isRerenderable)
		const storedKeys = toFilmStoredKeys(renderedFilm.objectKeys)
		for (const storedKey of storedKeys) {
			await clearPendingObjectDeletion(storedKey, transaction)
		}

		// the files the row played until now go after the grace
		const replacedKeys = toFilmStoredKeys(replacedFilm).filter((replacedKey) => !storedKeys.includes(replacedKey))
		await recordReplacedImageDeletions(transaction, replacedKeys)
		renderedFilm.signal?.throwIfAborted()
	})
}

// the columns a finished render writes: the keys, the size and length, the image the intro and sign-off were drawn
// from, the current render version with no failed one, and the render's cost added to what the film cost so far
function toRenderedFilmColumns({
	renderVersion = TOPIC_VIDEO_RENDER_VERSION,
	objectKeys,
	byteSize,
	durationSeconds,
	imageHash,
	costDollars,
}: Omit<SaveTopicVideoReadyOptions, "podcastEpisodeId">): PgUpdateSetSource<typeof topicVideos> {
	return {
		error: null,
		...objectKeys,
		byteSize,
		durationSeconds: Math.round(durationSeconds),
		renderedImageHash: imageHash,
		renderVersion,
		failedRenderVersion: null,
		cost: sql`${topicVideos.cost} + ${costDollars.toFixed(6)}`,
	}
}

// a film's stored keys, without the parts the timeline had no frames for
function toFilmStoredKeys(objectKeys: Record<keyof FilmObjectKeys, string | null>): string[] {
	return Object.values(objectKeys).filter((objectKey): objectKey is string => Boolean(objectKey))
}

// a file to upload, its key and type, and the keys uploaded so far, which a failure deletes
type UploadTopicVideoFileOptions = {
	signal?: AbortSignal
	filePath: string | null
	key: string
	contentType: string
	uploadedKeys: string[]
}

/**
 * Uploads one film file under its key if the file exists, recording a pending deletion first so a crash between the
 * two still cleans the upload up. Returns the key, or null for no file.
 */
export async function uploadTopicVideoFile({
	signal,
	filePath,
	key,
	contentType,
	uploadedKeys,
}: UploadTopicVideoFileOptions): Promise<string | null> {
	signal?.throwIfAborted()
	if (!filePath) {
		return null
	}

	// the pending deletion goes first, and the row's update clears it
	await recordPendingObjectDeletionBeforeUpload(key)
	uploadedKeys.push(key)
	await uploadPodcastEpisodeFile({ key, filePath, contentType, signal })
	return key
}

/**
 * Returns what rendering a number of film seconds costs.
 */
export function toTopicVideoCostDollars(renderedSeconds: number): number {
	return (renderedSeconds / 60) * TOPIC_VIDEO_DOLLARS_PER_MINUTE
}

// the film, what the platform paid for, and what it cost
type PlatformTopicVideoSpend = { podcastEpisodeId: string; kind: SpendKind; dollars: number }

/**
 * Records a cost of a film that the platform paid for: a platform-billed render's minutes, images, and animation plan,
 * and the first animated picture of a Free owner's month. The film row's cost stays as it is, so the cost reaches the
 * day's total and no owner's month. A failed write is reported and leaves the render as it is.
 */
export async function recordPlatformTopicVideoSpend({
	podcastEpisodeId,
	kind,
	dollars,
}: PlatformTopicVideoSpend): Promise<void> {
	await recordSpend({ kind, dollars, podcastEpisodeId }).catch((error: unknown) =>
		reportError(error, "topic-video", { podcastEpisodeId, step: "platform-spend", kind }),
	)
}

/**
 * Adds one settled planner call to the episode's existing film spend.
 */
export async function recordPictureAnimationCost(podcastEpisodeId: string, dollars: number): Promise<void> {
	if (dollars > 0) {
		await db
			.update(topicVideos)
			.set({ cost: sql`${topicVideos.cost} + ${dollars.toFixed(6)}` })
			.where(eq(topicVideos.podcastEpisodeId, podcastEpisodeId))
	}
}
