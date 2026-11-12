// a ready film rebuilt for a new image, its own or else its podcast episode's: only the intro and the sign-off are
// rendered again, over the chapters' images that the render stored, joined with the stored chapters part, and the audio
// and captions are copied from the film that plays now

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { db } from "@carlnotes/db"
import { isMonthlyBudgetCutoffPassed } from "@carlnotes/db/monthlyBudgetCutoffs"
import { deletePodcastFeedCache } from "@carlnotes/db/podcastFeedCache"
import { topicPodcastEpisodeVideos } from "@carlnotes/db/schema/podcast"
import { clearPendingObjectDeletion, deleteStoredObjects, downloadPodcastEpisodeFile } from "@carlnotes/db/store"
import { toTopicPodcastEpisodeVideoImagePartKey } from "@carlnotes/db/topicPodcastEpisodeVideoKeys"
import { trackEvent } from "@carlnotes/server/analytics"
import { and, eq, sql } from "drizzle-orm"
import { recordReplacedImageDeletions } from "../topicImages/topicImageRenders"
import {
	loadShownImageStill,
	loadTopicPodcastEpisodeVideoEpisode,
	loadVideoChapterRows,
	type RenderableTopicPodcastEpisodeVideoEpisode,
	type TopicPodcastEpisodeVideoEpisode,
} from "./topicPodcastEpisodeVideoInputs"
import {
	toTopicPodcastEpisodeVideoCostDollars,
	uploadTopicPodcastEpisodeVideoFile,
} from "./topicPodcastEpisodeVideoRows"
import { loadVideoAudio } from "./videoAudio"
import { prepareChapterImages } from "./videoChapterImages"
import { renderVideoImageParts } from "./videoImageParts"
import { rewriteVideoFilm } from "./videoParts"
import { toSegmentSeconds } from "./videoTimeline"

// what a rebuild did. it rendered the new intro and sign-off, or skipped a podcast episode that is not published, a film
// that is not ready, a film that already shows the current image, or an owner past the podcast episode spend cutoff
export type RebuildTopicPodcastEpisodeVideoResult =
	| { outcome: "rebuilt"; renderSeconds: number }
	| { outcome: "skipped"; reason: "unpublished" | "not-ready" | "current" | "spend-cutoff" }

// the ready film's stored keys, the image hash it was rendered from, and the render version it was rendered at
type ReadyTopicPodcastEpisodeVideo = {
	introKey: string | null
	chaptersKey: string
	signOffKey: string | null
	filmKey: string
	renderedImageHash: string
	renderVersion: number
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

		// the saved row plays the uploaded files, so a failure after the save deletes none of them
		uploadedKeys.length = 0

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
			topicPodcastEpisodeVideoEpisode: RenderableTopicPodcastEpisodeVideoEpisode
			readyTopicPodcastEpisodeVideo: ReadyTopicPodcastEpisodeVideo
	  }
	| Extract<RebuildTopicPodcastEpisodeVideoResult, { outcome: "skipped" }>

// load the published podcast episode and its ready film, skipping a film that shows the current image or an owner past
// the cutoff
async function loadRebuildInputs(podcastEpisodeId: string): Promise<RebuildInputs> {
	// only a published podcast episode with audio, a transcript, and a ready film rebuilds
	const topicPodcastEpisodeVideoEpisode = await loadTopicPodcastEpisodeVideoEpisode(podcastEpisodeId)
	const { audioKey, script } = topicPodcastEpisodeVideoEpisode ?? {}
	if (!topicPodcastEpisodeVideoEpisode || !audioKey || !script) {
		return { outcome: "skipped", reason: "unpublished" }
	}

	// a film still rendering, failed, or missing has nothing to rebuild from
	const readyTopicPodcastEpisodeVideo = await loadReadyTopicPodcastEpisodeVideo(podcastEpisodeId)
	if (!readyTopicPodcastEpisodeVideo) {
		return { outcome: "skipped", reason: "not-ready" }
	}

	// a film already rendered from the current image, or an owner past the cutoff, is left as it is
	if (readyTopicPodcastEpisodeVideo.renderedImageHash === topicPodcastEpisodeVideoEpisode.imageHash) {
		return { outcome: "skipped", reason: "current" }
	}
	if (await isMonthlyBudgetCutoffPassed(topicPodcastEpisodeVideoEpisode.ownerId, "podcastEpisodes")) {
		return { outcome: "skipped", reason: "spend-cutoff" }
	}
	return {
		outcome: "ready",
		topicPodcastEpisodeVideoEpisode: { ...topicPodcastEpisodeVideoEpisode, audioKey, script },
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
			renderVersion: topicPodcastEpisodeVideos.renderVersion,
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
	topicPodcastEpisodeVideoEpisode: RenderableTopicPodcastEpisodeVideoEpisode
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
	// the render's own timeline and caption times, from the audio and the chapters
	const { podcastEpisodeId, ownerId } = topicPodcastEpisodeVideoEpisode
	const videoChapterRows = await loadVideoChapterRows(podcastEpisodeId)
	const { segments, captionCues } = await loadVideoAudio({
		topicPodcastEpisodeVideoEpisode,
		videoChapterRows,
		workDirectory,
		signal,
	})

	// the stored chapters part and the film that plays now
	const chaptersPath = join(workDirectory, "chapters.mp4")
	const currentFilmPath = join(workDirectory, "current.mp4")
	await downloadPodcastEpisodeFile({ key: readyTopicPodcastEpisodeVideo.chaptersKey, filePath: chaptersPath })
	await downloadPodcastEpisodeFile({ key: readyTopicPodcastEpisodeVideo.filmKey, filePath: currentFilmPath })

	// the chapters' images that the render stored, for the intro and the sign-off to cut through, with none generated
	const shownImageStill = await loadShownImageStill(topicPodcastEpisodeVideoEpisode)
	const { firstChapterImages } = await prepareChapterImages({
		podcastEpisodeId,
		ownerId,
		isPlatformBilled: false,
		isChapterImageGenerationSkipped: true,
		videoChapterRows,
		segments,
		shownImageStill,
		signal,
	})

	// the new intro and sign-off, joined with the chapters by stream copy
	const imageParts = await renderVideoImageParts({
		podcastEpisodeId,
		workDirectory,
		segments,
		shownImageStill,
		chapterImages: firstChapterImages,
		introText: topicPodcastEpisodeVideoEpisode.introText,
		signOffText: topicPodcastEpisodeVideoEpisode.signOffText,
		captionStartSeconds: captionCues.map((captionCue) => captionCue.startSeconds),
		signal,
	})
	const filmPath = join(workDirectory, "film.mp4")
	await rewriteVideoFilm({ workDirectory, ...imageParts, chaptersPath, currentFilmPath, filmPath, signal })

	// the seconds rendered again are the intro's and the sign-off's
	const imagePartFrameCount = segments
		.filter((segment) => segment.kind === "intro" || segment.kind === "sign-off")
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
	// the new files are keyed by the current image's hash and the render version the film was rendered at
	const { podcastEpisodeId, imageHash } = topicPodcastEpisodeVideoEpisode
	const { renderVersion } = readyTopicPodcastEpisodeVideo
	const uploadImagePart = (filePath: string | null, part: "intro" | "sign-off" | "film"): Promise<string | null> =>
		uploadTopicPodcastEpisodeVideoFile({
			filePath,
			key: toTopicPodcastEpisodeVideoImagePartKey({ podcastEpisodeId, part, imageHash, renderVersion }),
			contentType: "video/mp4",
			uploadedKeys,
		})
	const newKeys = {
		introKey: await uploadImagePart(rebuiltFilm.introPath, "intro"),
		signOffKey: await uploadImagePart(rebuiltFilm.signOffPath, "sign-off"),
		filmKey: (await uploadImagePart(rebuiltFilm.filmPath, "film")) ?? "",
	}

	// swap the keys only on the film this rebuild read: the same image and the same chapters part. a film removed or
	// rendered again meanwhile keeps its new files pending deletion
	const costDollars = toTopicPodcastEpisodeVideoCostDollars(rebuiltFilm.renderedSeconds)
	const isFilmAsRead = and(
		eq(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodeId),
		eq(topicPodcastEpisodeVideos.renderedImageHash, readyTopicPodcastEpisodeVideo.renderedImageHash),
		eq(topicPodcastEpisodeVideos.chaptersKey, readyTopicPodcastEpisodeVideo.chaptersKey),
	)
	await db.transaction(async (transaction) => {
		const swappedRows = await transaction
			.update(topicPodcastEpisodeVideos)
			.set({
				...newKeys,
				renderedImageHash: imageHash,
				byteSize: Bun.file(rebuiltFilm.filmPath).size,
				cost: sql`${topicPodcastEpisodeVideos.cost} + ${costDollars.toFixed(6)}`,
			})
			.where(isFilmAsRead)
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
