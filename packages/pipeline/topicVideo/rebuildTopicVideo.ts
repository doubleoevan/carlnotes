// rebuild a film for a changed or withdrawn image. use approved stored pictures for the bookends and any chapters
// that need new frames, and keep the published narration and captions

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { db } from "@carlnotes/db"
import { isMonthlyBudgetCutoffPassed } from "@carlnotes/db/monthlyBudgetCutoffs"
import { deletePodcastFeedCache } from "@carlnotes/db/podcastFeedCache"
import { topicVideos } from "@carlnotes/db/schema/podcast"
import { clearStatusReads } from "@carlnotes/db/statusReadCaches"
import { clearPendingObjectDeletion, downloadPodcastEpisodeFile } from "@carlnotes/db/store"
import {
	toTopicVideoChaptersKey,
	toTopicVideoImagePartKey,
	toTopicVideoRenderAttemptUploadKey,
} from "@carlnotes/db/topicVideoKeys"
import { clearVisitorPagesOfTopic } from "@carlnotes/db/visitorPageCaches"
import { trackEvent } from "@carlnotes/server/analytics"
import { and, eq, sql } from "drizzle-orm"
import { recordReplacedImageDeletions } from "../topicImages/topicImageRenders"
import { rebuildVideoChapters } from "./rebuildVideoChapters"
import { loadPodcastCardAnimationPath } from "./reviewedAnimation"
import { checkTopicVideoImage, checkVideoSceneSources, type VideoSceneSource } from "./topicVideoImageCheck"
import {
	loadShownImageStill,
	loadTopicVideoPodcastEpisode,
	loadVideoChapterRows,
	type RenderableTopicVideoPodcastEpisode,
	type TopicVideoPodcastEpisode,
} from "./topicVideoInputs"
import { toTopicVideoCostDollars, uploadTopicVideoFile } from "./topicVideoRows"
import { withTopicVideoRebuildSlot } from "./topicVideoSlot"
import { loadVideoAudio } from "./videoAudio"
import { prepareChapterImages } from "./videoChapterImages"
import { rewriteVideoFilm } from "./videoFilm"
import { renderVideoImageParts } from "./videoImageParts"
import { withVideoRenderResourceLimits } from "./videoRenderResourceLimits"
import { toSegmentSeconds } from "./videoTimeline"

// what a rebuild did. it rendered the new intro and sign-off, or skipped a podcast episode that is not published, a
// film that is not ready, a film that plays while an upload that would be its image is unchecked, a film that already
// shows the current image, or an owner past the podcast episode spend cutoff
export type RebuildTopicVideoResult =
	| { outcome: "rebuilt"; renderSeconds: number }
	| {
			outcome: "skipped"
			reason: "unpublished" | "not-ready" | "unchecked" | "current" | "spend-cutoff" | "superseded"
	  }

// the stored keys of a ready film, or of a film marked rendering that still has its files, the image hash it was
// rendered from, and the render version it was rendered at
type ReadyTopicVideo = {
	status: "ready" | "rendering"
	// the parts and the joined film
	introKey: string | null
	chaptersKey: string
	signOffKey: string | null
	filmKey: string
	renderedImageHash: string
	renderVersion: number
}

/**
 * Rebuilds a ready film for the image it shows now, its own or else its podcast episode's, swaps the keys in one
 * update, and schedules the replaced files for deletion after the grace. A film marked rendering because its image was
 * unpublished or rejected is rebuilt too, and is ready again after publication. A failed attempt leaves its unique
 * uploads pending deletion. An image that changed while the rebuild ran throws an error,
 * so the next attempt reads the new image. An aborted signal kills the ffmpeg run in progress and fails the rebuild
 * before it uploads.
 */
export async function rebuildTopicVideo(
	podcastEpisodeId: string,
	signal?: AbortSignal,
): Promise<RebuildTopicVideoResult> {
	return withTopicVideoRebuildSlot(signal, (activeSignal) => rebuildFilm(podcastEpisodeId, activeSignal))
}
async function rebuildFilm(podcastEpisodeId: string, signal: AbortSignal): Promise<RebuildTopicVideoResult> {
	// the podcast episode and its ready film, or why it is not rebuilt
	const renderStartMs = performance.now()
	const rebuildInputs = await loadRebuildInputs(podcastEpisodeId)
	if (rebuildInputs.outcome === "skipped") {
		return rebuildInputs
	}

	// render in a temp folder, upload the new files unless the rebuild was stopped, and publish them together
	const { topicVideoPodcastEpisode, readyTopicVideo } = rebuildInputs
	const workDirectory = await mkdtemp(join(tmpdir(), "episode-video-rebuild-"))
	const uploadedKeys: string[] = []
	try {
		const rebuiltFilm = await withVideoRenderResourceLimits(workDirectory, signal, (encodeSignal) =>
			rebuildFilmFiles({
				topicVideoPodcastEpisode,
				readyTopicVideo,
				workDirectory,
				signal: encodeSignal,
			}),
		)
		signal?.throwIfAborted()
		const published = await saveRebuiltFilm({
			topicVideoPodcastEpisode,
			readyTopicVideo,
			rebuiltFilm,
			uploadedKeys,
			signal,
		})
		if (!published) {
			return { outcome: "skipped", reason: "superseded" }
		}

		// the film's status copy goes, so a poll reads it ready
		await clearStatusReads("topicVideo", podcastEpisodeId)

		// the film feeds and the visitor pages list the rebuilt film on their next fetch
		await Promise.all([
			deletePodcastFeedCache(topicVideoPodcastEpisode.topicId),
			clearVisitorPagesOfTopic(topicVideoPodcastEpisode.topicId),
		])
	} finally {
		await rm(workDirectory, { recursive: true, force: true })
	}

	// the rebuild event holds ids and the time it took
	const renderSeconds = (performance.now() - renderStartMs) / 1000
	trackEvent("episode_video_rebuilt", topicVideoPodcastEpisode.ownerId, {
		topicId: topicVideoPodcastEpisode.topicId,
		podcastEpisodeId,
		renderSeconds,
	})
	return { outcome: "rebuilt", renderSeconds }
}

// what a rebuild reads before it starts: the podcast episode and its ready film, or the reason it is skipped
type RebuildInputs =
	| {
			outcome: "ready"
			topicVideoPodcastEpisode: RenderableTopicVideoPodcastEpisode
			readyTopicVideo: ReadyTopicVideo
	  }
	| Extract<RebuildTopicVideoResult, { outcome: "skipped" }>

// load the published podcast episode and its ready film, skipping a film that shows the current image or an owner past
// the cutoff
async function loadRebuildInputs(podcastEpisodeId: string): Promise<RebuildInputs> {
	// only a published podcast episode with audio, a transcript, and a ready film rebuilds
	const topicVideoPodcastEpisode = await loadTopicVideoPodcastEpisode(podcastEpisodeId)
	const { audioKey, script } = topicVideoPodcastEpisode ?? {}
	if (!topicVideoPodcastEpisode || !audioKey || !script) {
		return { outcome: "skipped", reason: "unpublished" }
	}

	// a film still rendering, failed, or missing has nothing to rebuild from
	const readyTopicVideo = await loadReadyTopicVideo(podcastEpisodeId)
	if (!readyTopicVideo) {
		return { outcome: "skipped", reason: "not-ready" }
	}

	// a film that plays keeps playing as it is while an upload that would be its image is unchecked. the rebuild starts
	// again once the upload passes its check
	const isFilmPlaying = readyTopicVideo.status === "ready"
	if (isFilmPlaying && topicVideoPodcastEpisode.hasUncheckedUpload) {
		return { outcome: "skipped", reason: "unchecked" }
	}

	// a film already rendered from the current image is left as it is, and one marked rendering is ready again
	if (
		readyTopicVideo.renderedImageHash === topicVideoPodcastEpisode.imageHash &&
		(isFilmPlaying || readyTopicVideo.renderVersion < 4)
	) {
		// a film marked rendering plays again
		if (!isFilmPlaying) {
			await saveCurrentFilmReady(topicVideoPodcastEpisode, readyTopicVideo)
		}
		return { outcome: "skipped", reason: "current" }
	}

	// an owner past the cutoff keeps the film that plays now. a film marked rendering plays nothing, so it is rebuilt
	// whatever its owner spent
	const { ownerId } = topicVideoPodcastEpisode
	if (isFilmPlaying && (await isMonthlyBudgetCutoffPassed(ownerId, "podcastEpisodes"))) {
		return { outcome: "skipped", reason: "spend-cutoff" }
	}
	return {
		outcome: "ready",
		topicVideoPodcastEpisode: { ...topicVideoPodcastEpisode, audioKey, script },
		readyTopicVideo,
	}
}

// mark a film ready again that was marked rendering and is drawn from the image it shows now
async function saveCurrentFilmReady(
	topicVideoPodcastEpisode: TopicVideoPodcastEpisode,
	{ renderedImageHash, chaptersKey, filmKey }: ReadyTopicVideo,
): Promise<void> {
	await db.transaction(async (transaction) => {
		// the image is still the one the film shows, and the film is still the one that was read
		await checkTopicVideoImage(transaction, topicVideoPodcastEpisode)
		await transaction
			.update(topicVideos)
			.set({ status: "ready" })
			.where(
				and(
					eq(topicVideos.podcastEpisodeId, topicVideoPodcastEpisode.podcastEpisodeId),
					eq(topicVideos.status, "rendering"),
					eq(topicVideos.renderedImageHash, renderedImageHash),
					eq(topicVideos.chaptersKey, chaptersKey),
					eq(topicVideos.filmKey, filmKey),
				),
			)
	})
	await clearStatusReads("topicVideo", topicVideoPodcastEpisode.podcastEpisodeId)
}

// the film row's keys and image hash, if the film is ready, or marked rendering with its files, with a chapters part
async function loadReadyTopicVideo(podcastEpisodeId: string): Promise<ReadyTopicVideo | null> {
	// read the film row
	const [topicVideo] = await db
		.select({
			status: topicVideos.status,
			introKey: topicVideos.introKey,
			chaptersKey: topicVideos.chaptersKey,
			signOffKey: topicVideos.signOffKey,
			filmKey: topicVideos.filmKey,
			renderedImageHash: topicVideos.renderedImageHash,
			renderVersion: topicVideos.renderVersion,
		})
		.from(topicVideos)
		.where(eq(topicVideos.podcastEpisodeId, podcastEpisodeId))

	// a failed film, or one with no chapters part or no joined film, has nothing to rebuild from. a first render's row
	// has no stored file yet
	const { status, chaptersKey, filmKey, renderedImageHash } = topicVideo ?? {}
	const isRebuildable = status === "ready" || status === "rendering"
	if (!isRebuildable || !chaptersKey || !filmKey || !renderedImageHash || !topicVideo) {
		return null
	}
	return { ...topicVideo, status, chaptersKey, filmKey, renderedImageHash }
}

// the rebuilt intro, sign-off, and film on disk, and the film seconds rendered again
type RebuiltFilm = {
	sceneSources?: VideoSceneSource[]
	chapters: { path: string; scenePlansHash?: string }
	introPath: string | null
	signOffPath: string | null
	filmPath: string
	renderedSeconds: number
}

// the podcast episode, its ready film, the temp folder, and the signal that stops the ffmpeg runs
type RebuildFilmFilesOptions = {
	topicVideoPodcastEpisode: RenderableTopicVideoPodcastEpisode
	readyTopicVideo: ReadyTopicVideo
	workDirectory: string
	signal?: AbortSignal
}

// render the intro and the sign-off for the current image, and join them with the stored chapters part
async function rebuildFilmFiles({
	topicVideoPodcastEpisode,
	readyTopicVideo,
	workDirectory,
	signal,
}: RebuildFilmFilesOptions): Promise<RebuiltFilm> {
	// the render's own timeline and caption times, from the audio and the chapters
	const { podcastEpisodeId, ownerId } = topicVideoPodcastEpisode
	const videoChapterRows = await loadVideoChapterRows(podcastEpisodeId)
	const { segments, captionCues } = await loadVideoAudio({
		topicVideoPodcastEpisode,
		videoChapterRows,
		workDirectory,
		signal,
	})
	const captionStartSeconds = captionCues.map((cue) => cue.startSeconds)

	// the chapters' images that the render stored, for the intro and the sign-off to cut through, with none generated
	const shownImageStill = await loadShownImageStill(topicVideoPodcastEpisode)
	const podcastCardAnimationPath =
		readyTopicVideo.renderVersion === 4 ? await loadPodcastCardAnimationPath() : undefined
	const preparedChapterImages = await prepareChapterImages({
		requiresPublicSceneSources: readyTopicVideo.renderVersion === 4,
		priorVersion: readyTopicVideo.renderVersion,
		podcastCardAnimationPath,
		podcastEpisodeId,
		ownerId,
		isPlatformBilled: false,
		isChapterImageGenerationSkipped: true,
		videoChapterRows,
		segments,
		shownImageStill,
		signal,
	})

	// use verified chapters or encode them again with the currently approved poster and picture sources
	const { firstChapterImages, sceneSources } = preparedChapterImages
	const chapters = await rebuildVideoChapters({
		podcastEpisodeId,
		ownerId,
		workDirectory,
		renderVersion: readyTopicVideo.renderVersion,
		chaptersKey: readyTopicVideo.chaptersKey,
		segments,
		captionCues,
		preparedChapterImages,
		shownImageStill,
		signal,
	})

	// copy only narration and captions from the previously published film
	const chaptersPath = chapters.path
	const currentFilmPath = join(workDirectory, "current.mp4")
	await downloadPodcastEpisodeFile({ key: readyTopicVideo.filmKey, filePath: currentFilmPath, signal })
	// the new intro and sign-off, joined with the chapters by stream copy
	const imageParts = await renderVideoImageParts({
		podcastCardAnimationPath,
		podcastEpisodeId,
		workDirectory,
		segments,
		shownImageStill,
		chapterImages: firstChapterImages,
		introText: topicVideoPodcastEpisode.introText,
		signOffText: topicVideoPodcastEpisode.signOffText,
		captionStartSeconds,
		signal,
	})
	const filmPath = join(workDirectory, "film.mp4")
	await rewriteVideoFilm({ workDirectory, ...imageParts, chaptersPath, currentFilmPath, filmPath, signal })

	// a poster rebuild bills the bookends, including when older chapter artwork requires replacement
	const imagePartFrameCount = segments
		.filter((segment) => segment.kind === "intro" || segment.kind === "sign-off")
		.reduce((frameCount, segment) => frameCount + segment.frameCount, 0)
	return { ...imageParts, sceneSources, chapters, filmPath, renderedSeconds: toSegmentSeconds(imagePartFrameCount) }
}

// the podcast episode, its film before the rebuild, the rebuilt files, and the keys uploaded so far
type SaveRebuiltFilmOptions = {
	signal: AbortSignal
	topicVideoPodcastEpisode: TopicVideoPodcastEpisode
	readyTopicVideo: ReadyTopicVideo
	rebuiltFilm: RebuiltFilm
	uploadedKeys: string[]
}

// upload the new files, then publish the new keys and add the cost in one update, scheduling the replaced files for deletion
async function saveRebuiltFilm({
	signal,
	topicVideoPodcastEpisode,
	readyTopicVideo,
	rebuiltFilm,
	uploadedKeys,
}: SaveRebuiltFilmOptions): Promise<boolean> {
	// the new files are keyed by the current image's hash and the render version the film was rendered at
	const { podcastEpisodeId, imageHash } = topicVideoPodcastEpisode
	const { renderVersion } = readyTopicVideo
	const attempt = crypto.randomUUID()
	const uploadImagePart = (filePath: string | null, part: "intro" | "sign-off" | "film"): Promise<string | null> =>
		uploadTopicVideoFile({
			signal,
			filePath,
			key: toTopicVideoRenderAttemptUploadKey(
				toTopicVideoImagePartKey({ podcastEpisodeId, part, imageHash, renderVersion }),
				attempt,
			),
			contentType: "video/mp4",
			uploadedKeys,
		})
	const newKeys = {
		introKey: await uploadImagePart(rebuiltFilm.introPath, "intro"),
		signOffKey: await uploadImagePart(rebuiltFilm.signOffPath, "sign-off"),
		filmKey: (await uploadImagePart(rebuiltFilm.filmPath, "film")) ?? "",
	}
	const { chapters } = rebuiltFilm
	const chaptersKey = chapters.scenePlansHash
		? await uploadTopicVideoFile({
				signal,
				filePath: chapters.path,
				key: toTopicVideoRenderAttemptUploadKey(
					toTopicVideoChaptersKey(podcastEpisodeId, renderVersion, chapters.scenePlansHash),
					attempt,
				),
				contentType: "video/mp4",
				uploadedKeys,
			})
		: readyTopicVideo.chaptersKey
	if (!chaptersKey) {
		throw Error("The replacement chapters upload did not produce a key")
	}

	// publish the replacement only for the film this rebuild read: the same image and the same chapters part. a film removed or
	// rendered again meanwhile keeps its new files pending deletion. a film marked rendering is ready again
	const costDollars = toTopicVideoCostDollars(rebuiltFilm.renderedSeconds)
	const isFilmAsRead = and(
		eq(topicVideos.podcastEpisodeId, podcastEpisodeId),
		eq(topicVideos.renderedImageHash, readyTopicVideo.renderedImageHash),
		eq(topicVideos.chaptersKey, readyTopicVideo.chaptersKey),
		eq(topicVideos.filmKey, readyTopicVideo.filmKey),
	)
	return db.transaction(async (transaction) => {
		// the rebuilt film shows the image it was drawn from, or the rebuild fails and its next attempt reads the new one
		await checkTopicVideoImage(transaction, topicVideoPodcastEpisode)
		if (rebuiltFilm.sceneSources) {
			await checkVideoSceneSources(transaction, podcastEpisodeId, rebuiltFilm.sceneSources)
		}
		signal.throwIfAborted()
		const updatedRows = await transaction
			.update(topicVideos)
			.set({
				...newKeys,
				chaptersKey,
				status: "ready",
				renderedImageHash: imageHash,
				byteSize: Bun.file(rebuiltFilm.filmPath).size,
				cost: sql`${topicVideos.cost} + ${costDollars.toFixed(6)}`,
			})
			.where(isFilmAsRead)
			.returning({ id: topicVideos.id })
		if (updatedRows.length === 0) {
			return false
		}

		// the new keys belong to the row, and the replaced files go after the grace
		for (const uploadedKey of uploadedKeys) {
			await clearPendingObjectDeletion(uploadedKey, transaction)
		}
		const { introKey, signOffKey, filmKey } = readyTopicVideo
		const replacedPartKeys = [
			introKey,
			signOffKey,
			filmKey,
			...(chapters.scenePlansHash ? [readyTopicVideo.chaptersKey] : []),
		].filter((objectKey): objectKey is string => Boolean(objectKey))
		await recordReplacedImageDeletions(transaction, replacedPartKeys)
		signal.throwIfAborted()
		return true
	})
}
