// a ready film rebuilt for a new image, its own or else its podcast episode's: only the intro and the sign-off are
// rendered again, joined with the stored chapters part, and the audio and captions are copied from the film that plays
// now

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { db } from "@carlnotes/db"
import { isMonthlyBudgetCutoffPassed } from "@carlnotes/db/monthlyBudgetCutoffs"
import { deletePodcastFeedCache } from "@carlnotes/db/podcastFeedCache"
import { topicPodcastEpisodeVideos } from "@carlnotes/db/schema/podcast"
import {
	clearPendingObjectDeletion,
	deleteStoredObjects,
	downloadPodcastEpisodeFile,
	toTopicPodcastEpisodeVideoImagePartKey,
} from "@carlnotes/db/store"
import { probeDurationSeconds } from "@carlnotes/models/ffmpeg"
import { trackEvent } from "@carlnotes/server/analytics"
import { and, eq, sql } from "drizzle-orm"
import { recordReplacedImageDeletions } from "../topicImages/topicImageRenders"
import {
	loadShownImageStillPng,
	loadTopicPodcastEpisodeVideoEpisode,
	loadVideoChapterRows,
	type TopicPodcastEpisodeVideoEpisode,
} from "./topicPodcastEpisodeVideoInputs"
import {
	toTopicPodcastEpisodeVideoCostDollars,
	uploadTopicPodcastEpisodeVideoFile,
} from "./topicPodcastEpisodeVideoRows"
import { renderVideoImageParts, rewriteVideoFilm } from "./videoParts"
import { toSegmentSeconds, toVideoTimeline } from "./videoTimeline"

// what a rebuild did. it drew the new intro and sign-off, or skipped a podcast episode that is not published, a film
// that is not ready, a film that already shows the current image, or an owner past the podcast episode spend cutoff
export type RebuildTopicPodcastEpisodeVideoResult =
	| { outcome: "rebuilt"; renderSeconds: number }
	| { outcome: "skipped"; reason: "unpublished" | "not-ready" | "current" | "spend-cutoff" }

// the ready film's stored keys and the image hash it was drawn from
type ReadyTopicPodcastEpisodeVideo = {
	introKey: string | null
	chaptersKey: string
	signOffKey: string | null
	filmKey: string
	renderedImageHash: string
}

/**
 * Rebuilds a ready film for the image it shows now, its own or else its podcast episode's, swaps the keys in one
 * update, and schedules the replaced files for deletion after the grace. A failure deletes what it uploaded and throws
 * an error, and the film that plays now stays. An aborted signal kills the ffmpeg run in progress and fails the
 * rebuild before it uploads.
 */
export async function rebuildTopicPodcastEpisodeVideo(
	podcastEpisodeId: string,
	signal?: AbortSignal,
): Promise<RebuildTopicPodcastEpisodeVideoResult> {
	// the podcast episode and its ready film, or why it is not rebuilt
	const renderStartMs = performance.now()
	const rebuildInputs = await loadRebuildInputs(podcastEpisodeId)
	if (rebuildInputs.outcome === "skipped") {
		return rebuildInputs
	}

	// render in a temp folder, upload the new files unless the rebuild was stopped, and swap them in
	const { topicPodcastEpisodeVideoEpisode, readyTopicPodcastEpisodeVideo } = rebuildInputs
	const workDirectory = await mkdtemp(join(tmpdir(), "episode-video-rebuild-"))
	const uploadedKeys: string[] = []
	try {
		const rebuiltFilm = await rebuildFilmFiles({
			topicPodcastEpisodeVideoEpisode,
			readyTopicPodcastEpisodeVideo,
			workDirectory,
			signal,
		})
		signal?.throwIfAborted()
		await saveRebuiltFilm({ topicPodcastEpisodeVideoEpisode, readyTopicPodcastEpisodeVideo, rebuiltFilm, uploadedKeys })

		// the film feeds list the rebuilt film's size on their next fetch
		await deletePodcastFeedCache(topicPodcastEpisodeVideoEpisode.topicId)
	} catch (error) {
		// an attempt that fails leaves no new files behind
		await deleteStoredObjects(uploadedKeys)
		throw error
	} finally {
		await rm(workDirectory, { recursive: true, force: true })
	}

	// the rebuild event holds ids and the time it took
	const renderSeconds = (performance.now() - renderStartMs) / 1000
	trackEvent("episode_video_rebuilt", topicPodcastEpisodeVideoEpisode.ownerId, {
		topicId: topicPodcastEpisodeVideoEpisode.topicId,
		podcastEpisodeId,
		renderSeconds,
	})
	return { outcome: "rebuilt", renderSeconds }
}

// what a rebuild reads before it starts: the podcast episode and its ready film, or the reason it is skipped
type RebuildInputs =
	| {
			outcome: "ready"
			topicPodcastEpisodeVideoEpisode: TopicPodcastEpisodeVideoEpisode & { audioKey: string }
			readyTopicPodcastEpisodeVideo: ReadyTopicPodcastEpisodeVideo
	  }
	| Extract<RebuildTopicPodcastEpisodeVideoResult, { outcome: "skipped" }>

// load the published podcast episode and its ready film, skipping a film that shows the current image or an owner past
// the cutoff
async function loadRebuildInputs(podcastEpisodeId: string): Promise<RebuildInputs> {
	// only a published podcast episode with audio and a ready film rebuilds
	const topicPodcastEpisodeVideoEpisode = await loadTopicPodcastEpisodeVideoEpisode(podcastEpisodeId)
	const { audioKey } = topicPodcastEpisodeVideoEpisode ?? {}
	if (!topicPodcastEpisodeVideoEpisode || !audioKey) {
		return { outcome: "skipped", reason: "unpublished" }
	}

	// a film still rendering, failed, or missing has nothing to rebuild from
	const readyTopicPodcastEpisodeVideo = await loadReadyTopicPodcastEpisodeVideo(podcastEpisodeId)
	if (!readyTopicPodcastEpisodeVideo) {
		return { outcome: "skipped", reason: "not-ready" }
	}

	// a film already drawn from the current image, or an owner past the cutoff, is left as it is
	if (readyTopicPodcastEpisodeVideo.renderedImageHash === topicPodcastEpisodeVideoEpisode.imageHash) {
		return { outcome: "skipped", reason: "current" }
	}
	if (await isMonthlyBudgetCutoffPassed(topicPodcastEpisodeVideoEpisode.ownerId, "podcastEpisodes")) {
		return { outcome: "skipped", reason: "spend-cutoff" }
	}
	return {
		outcome: "ready",
		topicPodcastEpisodeVideoEpisode: { ...topicPodcastEpisodeVideoEpisode, audioKey },
		readyTopicPodcastEpisodeVideo,
	}
}

// the film row's keys and image hash, if the film is ready with a chapters part
async function loadReadyTopicPodcastEpisodeVideo(
	podcastEpisodeId: string,
): Promise<ReadyTopicPodcastEpisodeVideo | null> {
	// read the film row
	const [topicPodcastEpisodeVideo] = await db
		.select({
			status: topicPodcastEpisodeVideos.status,
			introKey: topicPodcastEpisodeVideos.introKey,
			chaptersKey: topicPodcastEpisodeVideos.chaptersKey,
			signOffKey: topicPodcastEpisodeVideos.signOffKey,
			filmKey: topicPodcastEpisodeVideos.filmKey,
			renderedImageHash: topicPodcastEpisodeVideos.renderedImageHash,
		})
		.from(topicPodcastEpisodeVideos)
		.where(eq(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodeId))

	// a film with no chapters part or no joined film has nothing to rebuild from
	const { status, chaptersKey, filmKey, renderedImageHash } = topicPodcastEpisodeVideo ?? {}
	if (status !== "ready" || !chaptersKey || !filmKey || !renderedImageHash || !topicPodcastEpisodeVideo) {
		return null
	}
	return { ...topicPodcastEpisodeVideo, chaptersKey, filmKey, renderedImageHash }
}

// the rebuilt intro, sign-off, and film on disk, and the film seconds rendered again
type RebuiltFilm = {
	introPath: string | null
	signOffPath: string | null
	filmPath: string
	renderedSeconds: number
}

// the podcast episode, its ready film, the temp folder, and the signal that stops the ffmpeg runs
type RebuildFilmFilesOptions = {
	topicPodcastEpisodeVideoEpisode: TopicPodcastEpisodeVideoEpisode & { audioKey: string }
	readyTopicPodcastEpisodeVideo: ReadyTopicPodcastEpisodeVideo
	workDirectory: string
	signal?: AbortSignal
}

// render the intro and the sign-off for the current image, and join them with the stored chapters part
async function rebuildFilmFiles({
	topicPodcastEpisodeVideoEpisode,
	readyTopicPodcastEpisodeVideo,
	workDirectory,
	signal,
}: RebuildFilmFilesOptions): Promise<RebuiltFilm> {
	// the audio's exact length and the chapters give the intro and the sign-off the render drew
	const audioPath = join(workDirectory, "audio.mp3")
	await downloadPodcastEpisodeFile({ key: topicPodcastEpisodeVideoEpisode.audioKey, filePath: audioPath })
	const chapterTimes = await loadVideoChapterRows(topicPodcastEpisodeVideoEpisode.podcastEpisodeId)
	const segments = toVideoTimeline({ chapterTimes, durationSeconds: await probeDurationSeconds(audioPath, signal) })

	// the stored chapters part and the film that plays now
	const chaptersPath = join(workDirectory, "chapters.mp4")
	const currentFilmPath = join(workDirectory, "current.mp4")
	await downloadPodcastEpisodeFile({ key: readyTopicPodcastEpisodeVideo.chaptersKey, filePath: chaptersPath })
	await downloadPodcastEpisodeFile({ key: readyTopicPodcastEpisodeVideo.filmKey, filePath: currentFilmPath })

	// the new intro and sign-off, joined with the chapters by stream copy
	const imageParts = await renderVideoImageParts({
		workDirectory,
		segments,
		shownImageStillPng: await loadShownImageStillPng(topicPodcastEpisodeVideoEpisode.imageOriginalKey),
		introText: topicPodcastEpisodeVideoEpisode.introText,
		signOffText: topicPodcastEpisodeVideoEpisode.signOffText,
		signal,
	})
	const filmPath = join(workDirectory, "film.mp4")
	await rewriteVideoFilm({ workDirectory, ...imageParts, chaptersPath, currentFilmPath, filmPath, signal })

	// the seconds rendered again are the intro's and the sign-off's
	const imagePartFrameCount = segments
		.filter((segment) => segment.kind !== "chapter")
		.reduce((frameCount, segment) => frameCount + segment.frameCount, 0)
	return { ...imageParts, filmPath, renderedSeconds: toSegmentSeconds(imagePartFrameCount) }
}

// the podcast episode, its film before the rebuild, the rebuilt files, and the keys uploaded so far
type SaveRebuiltFilmOptions = {
	topicPodcastEpisodeVideoEpisode: TopicPodcastEpisodeVideoEpisode
	readyTopicPodcastEpisodeVideo: ReadyTopicPodcastEpisodeVideo
	rebuiltFilm: RebuiltFilm
	uploadedKeys: string[]
}

// upload the new files, then swap the keys and add the cost in one update, scheduling the replaced files for deletion
async function saveRebuiltFilm({
	topicPodcastEpisodeVideoEpisode,
	readyTopicPodcastEpisodeVideo,
	rebuiltFilm,
	uploadedKeys,
}: SaveRebuiltFilmOptions): Promise<void> {
	// the new files are keyed by the current image's hash
	const { podcastEpisodeId, imageHash } = topicPodcastEpisodeVideoEpisode
	const uploadImagePart = (filePath: string | null, part: "intro" | "sign-off" | "film"): Promise<string | null> =>
		uploadTopicPodcastEpisodeVideoFile({
			filePath,
			key: toTopicPodcastEpisodeVideoImagePartKey({ podcastEpisodeId, part, imageHash }),
			contentType: "video/mp4",
			uploadedKeys,
		})
	const newKeys = {
		introKey: await uploadImagePart(rebuiltFilm.introPath, "intro"),
		signOffKey: await uploadImagePart(rebuiltFilm.signOffPath, "sign-off"),
		filmKey: (await uploadImagePart(rebuiltFilm.filmPath, "film")) ?? "",
	}

	// swap the keys only on the film this rebuild read, so a film removed meanwhile keeps its new files pending deletion
	const costDollars = toTopicPodcastEpisodeVideoCostDollars(rebuiltFilm.renderedSeconds)
	await db.transaction(async (transaction) => {
		const swappedRows = await transaction
			.update(topicPodcastEpisodeVideos)
			.set({
				...newKeys,
				renderedImageHash: imageHash,
				byteSize: Bun.file(rebuiltFilm.filmPath).size,
				cost: sql`${topicPodcastEpisodeVideos.cost} + ${costDollars.toFixed(6)}`,
			})
			.where(
				and(
					eq(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodeId),
					eq(topicPodcastEpisodeVideos.renderedImageHash, readyTopicPodcastEpisodeVideo.renderedImageHash),
				),
			)
			.returning({ id: topicPodcastEpisodeVideos.id })
		if (swappedRows.length === 0) {
			return
		}

		// the new keys belong to the row, and the replaced files go after the grace
		for (const uploadedKey of uploadedKeys) {
			await clearPendingObjectDeletion(uploadedKey, transaction)
		}
		const { introKey, signOffKey, filmKey } = readyTopicPodcastEpisodeVideo
		const replacedPartKeys = [introKey, signOffKey, filmKey].filter((objectKey): objectKey is string =>
			Boolean(objectKey),
		)
		await recordReplacedImageDeletions(transaction, replacedPartKeys)
	})
}
