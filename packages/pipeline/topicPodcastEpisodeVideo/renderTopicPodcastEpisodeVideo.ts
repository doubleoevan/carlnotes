// a published podcast episode's film: rendered from its own audio on temp files, stored as three parts and the joined
// film with its captions, and billed to the podcast episode's owner

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { isMonthlyBudgetCutoffPassed } from "@carlnotes/db/monthlyBudgetCutoffs"
import { deletePodcastFeedCache } from "@carlnotes/db/podcastFeedCache"
import {
	deleteStoredObjects,
	downloadPodcastEpisodeFile,
	toTopicPodcastEpisodeVideoCaptionsKey,
	toTopicPodcastEpisodeVideoChaptersKey,
	toTopicPodcastEpisodeVideoImageKey,
	toTopicPodcastEpisodeVideoImagePartKey,
} from "@carlnotes/db/store"
import { probeDurationSeconds } from "@carlnotes/models/ffmpeg"
import { reportError } from "@carlnotes/server/monitoring"
import { drawTopicPodcastEpisodeVideoImage } from "./topicPodcastEpisodeVideoImage"
import {
	loadShownImageStillPng,
	loadTopicPodcastEpisodeVideoEpisode,
	loadVideoChapterRows,
	type RenderableTopicPodcastEpisodeVideoEpisode,
	type TopicPodcastEpisodeVideoEpisode,
	toVideoCaptionChapters,
	type VideoChapterRow,
} from "./topicPodcastEpisodeVideoInputs"
import {
	type FilmObjectKeys,
	isTopicPodcastEpisodeVideoReady,
	saveTopicPodcastEpisodeVideoReady,
	saveTopicPodcastEpisodeVideoRendering,
	saveTopicPodcastEpisodeVideoSkipped,
	toTopicPodcastEpisodeVideoCostDollars,
	uploadTopicPodcastEpisodeVideoFile,
} from "./topicPodcastEpisodeVideoRows"
import { detectPauseSeconds, toVideoCaptionCues, toWebVtt } from "./videoCaptions"
import { prepareChapterFrames } from "./videoChapterStills"
import { loadHotTakesStartSeconds } from "./videoHotTakes"
import { renderVideoChaptersPart, renderVideoImageParts, writeVideoFilm } from "./videoParts"
import { toVideoTimeline } from "./videoTimeline"

// what a render did. it drew the film, or skipped a podcast episode that is not published, a film already ready, an
// owner past the podcast episode spend cutoff, or a podcast episode missing its audio, transcript, or chapters
export type RenderTopicPodcastEpisodeVideoResult =
	| { outcome: "rendered"; renderSeconds: number; byteSize: number }
	| { outcome: "skipped"; reason: "unpublished" | "ready" | "spend-cutoff" | "missing-inputs" }

// the podcast episode, whether the platform pays for the film instead of the owner, as the backfill does, and a signal
// that stops the render once it aborts
type RenderTopicPodcastEpisodeVideoOptions = {
	podcastEpisodeId: string
	isPlatformBilled?: boolean
	signal?: AbortSignal
}

/**
 * Renders and stores a published podcast episode's film, then marks its row ready with its keys and cost. A podcast
 * episode missing its inputs, or whose owner is past the spend cutoff, gets a failed row, so it is never tried again.
 * A failure deletes what it uploaded and throws an error, so another attempt starts clean. An aborted signal kills
 * the ffmpeg run in progress and fails the render before it uploads.
 */
export async function renderTopicPodcastEpisodeVideo({
	podcastEpisodeId,
	isPlatformBilled = false,
	signal,
}: RenderTopicPodcastEpisodeVideoOptions): Promise<RenderTopicPodcastEpisodeVideoResult> {
	// what the film is drawn from, or why it is not drawn
	const renderStartMs = performance.now()
	const topicPodcastEpisodeVideoInputs = await loadRenderInputs({ podcastEpisodeId, isPlatformBilled })
	if (topicPodcastEpisodeVideoInputs.outcome === "skipped") {
		return topicPodcastEpisodeVideoInputs
	}

	// the row shows the film rendering, and the film's own image is drawn before the intro and the sign-off
	const { videoChapterRows } = topicPodcastEpisodeVideoInputs
	await saveTopicPodcastEpisodeVideoRendering(podcastEpisodeId)
	const topicPodcastEpisodeVideoEpisode = await drawOwnImage({
		topicPodcastEpisodeVideoEpisode: topicPodcastEpisodeVideoInputs.topicPodcastEpisodeVideoEpisode,
		isPlatformBilled,
	})

	// the render works in its own temp folder
	const workDirectory = await mkdtemp(join(tmpdir(), "episode-video-"))
	const uploadedKeys: string[] = []
	try {
		// render on disk, upload unless the render was stopped, and mark the row ready with its cost
		const renderedFilm = await renderFilmFiles({
			topicPodcastEpisodeVideoEpisode,
			videoChapterRows,
			workDirectory,
			isPlatformBilled,
			signal,
		})
		signal?.throwIfAborted()
		const objectKeys = await uploadFilmFiles({ topicPodcastEpisodeVideoEpisode, renderedFilm, uploadedKeys })
		const byteSize = Bun.file(renderedFilm.filmPath).size
		await saveTopicPodcastEpisodeVideoReady({
			podcastEpisodeId,
			objectKeys,
			byteSize,
			durationSeconds: renderedFilm.durationSeconds,
			imageHash: topicPodcastEpisodeVideoEpisode.imageHash,
			costDollars: isPlatformBilled ? 0 : toTopicPodcastEpisodeVideoCostDollars(renderedFilm.durationSeconds),
		})

		// the film feeds list the finished film on their next fetch
		await deletePodcastFeedCache(topicPodcastEpisodeVideoEpisode.topicId)
		return { outcome: "rendered", renderSeconds: (performance.now() - renderStartMs) / 1000, byteSize }
	} catch (error) {
		// an attempt that fails leaves no files behind
		await deleteStoredObjects(uploadedKeys)
		throw error
	} finally {
		await rm(workDirectory, { recursive: true, force: true })
	}
}

// the podcast episode as loaded, and whether the platform pays for the image
type DrawOwnImageOptions = {
	topicPodcastEpisodeVideoEpisode: RenderableTopicPodcastEpisodeVideoEpisode
	isPlatformBilled: boolean
}

// draw the film's own image if it has none, and return the podcast episode showing it. a failed draw is reported, and
// the film shows the image its podcast episode shows
async function drawOwnImage({
	topicPodcastEpisodeVideoEpisode,
	isPlatformBilled,
}: DrawOwnImageOptions): Promise<RenderableTopicPodcastEpisodeVideoEpisode> {
	// draw the image, and report a failure without stopping the film
	const { podcastEpisodeId } = topicPodcastEpisodeVideoEpisode
	const imageHash = await drawTopicPodcastEpisodeVideoImage({ podcastEpisodeId, isPlatformBilled }).catch(
		(error: unknown) => {
			reportError(error, "topic-podcast-episode-video", { podcastEpisodeId, step: "image" })
			return null
		},
	)

	// nothing drawn leaves the image the podcast episode already shows
	if (!imageHash) {
		return topicPodcastEpisodeVideoEpisode
	}
	return {
		...topicPodcastEpisodeVideoEpisode,
		imageHash,
		imageOriginalKey: toTopicPodcastEpisodeVideoImageKey(podcastEpisodeId, imageHash),
	}
}

// what a render reads before it starts: the podcast episode and its chapters, or the reason it is skipped
type RenderInputs =
	| {
			outcome: "ready"
			topicPodcastEpisodeVideoEpisode: RenderableTopicPodcastEpisodeVideoEpisode
			videoChapterRows: VideoChapterRow[]
	  }
	| Extract<RenderTopicPodcastEpisodeVideoResult, { outcome: "skipped" }>

// load the podcast episode and its chapters, skipping a film already ready and an owner past the cutoff unless the
// platform pays. an owner past the cutoff gets a failed row, and so does a podcast episode missing its audio,
// transcript, or chapters, with a warning
async function loadRenderInputs({
	podcastEpisodeId,
	isPlatformBilled,
}: Required<
	Pick<RenderTopicPodcastEpisodeVideoOptions, "podcastEpisodeId" | "isPlatformBilled">
>): Promise<RenderInputs> {
	// only a published podcast episode without a ready film renders
	const topicPodcastEpisodeVideoEpisode = await loadTopicPodcastEpisodeVideoEpisode(podcastEpisodeId)
	if (!topicPodcastEpisodeVideoEpisode) {
		return { outcome: "skipped", reason: "unpublished" }
	}
	if (await isTopicPodcastEpisodeVideoReady(podcastEpisodeId)) {
		return { outcome: "skipped", reason: "ready" }
	}

	// the owner pays for the film unless the platform does. an owner past the cutoff gets no film, and the skip is
	// marked once, so the backfill's listing never renders the film on the platform's bill
	const { ownerId, audioKey, script } = topicPodcastEpisodeVideoEpisode
	if (!isPlatformBilled && (await isMonthlyBudgetCutoffPassed(ownerId, "podcastEpisodes"))) {
		await saveTopicPodcastEpisodeVideoSkipped(podcastEpisodeId, "spend-cutoff")
		return { outcome: "skipped", reason: "spend-cutoff" }
	}

	// a podcast episode missing an input is marked once, so no listing finds it again
	const videoChapterRows = await loadVideoChapterRows(podcastEpisodeId)
	if (!audioKey || !script || videoChapterRows.length === 0) {
		console.warn(`podcast episode ${podcastEpisodeId} has no audio, transcript, or chapters, so it gets no film`)
		await saveTopicPodcastEpisodeVideoSkipped(podcastEpisodeId, "missing-inputs")
		return { outcome: "skipped", reason: "missing-inputs" }
	}
	return {
		outcome: "ready",
		topicPodcastEpisodeVideoEpisode: { ...topicPodcastEpisodeVideoEpisode, audioKey, script },
		videoChapterRows,
	}
}

// the film's files on disk, and its length in seconds
type RenderedFilm = {
	introPath: string | null
	chaptersPath: string | null
	signOffPath: string | null
	captionsPath: string
	filmPath: string
	durationSeconds: number
}

// the podcast episode, the temp folder, whether the platform pays for the imagined images, and the signal that stops
// the ffmpeg runs
type RenderFilmFilesOptions = {
	topicPodcastEpisodeVideoEpisode: RenderableTopicPodcastEpisodeVideoEpisode
	videoChapterRows: VideoChapterRow[]
	workDirectory: string
	isPlatformBilled: boolean
	signal?: AbortSignal
}

// render the parts, the captions, and the joined film on temp files
async function renderFilmFiles({
	topicPodcastEpisodeVideoEpisode,
	videoChapterRows,
	workDirectory,
	isPlatformBilled,
	signal,
}: RenderFilmFilesOptions): Promise<RenderedFilm> {
	// the audio, its exact length, and the pauses in it
	const { podcastEpisodeId, ownerId, audioKey, script } = topicPodcastEpisodeVideoEpisode
	const audioPath = join(workDirectory, "audio.mp3")
	await downloadPodcastEpisodeFile({ key: audioKey, filePath: audioPath })
	const durationSeconds = await probeDurationSeconds(audioPath, signal)
	const pauseSeconds = await detectPauseSeconds(audioPath, signal)

	// the timeline from the chapters and where the hosts turn to hot takes in them
	const hotTakesStartSeconds = await loadHotTakesStartSeconds({
		podcastEpisodeId,
		script,
		videoChapterRows,
		pauseSeconds,
	})
	const segments = toVideoTimeline({ chapterTimes: videoChapterRows, hotTakesStartSeconds, durationSeconds })

	// the intro and the sign-off from the image the film shows
	const imageParts = await renderVideoImageParts({
		workDirectory,
		segments,
		shownImageStillPng: await loadShownImageStillPng(topicPodcastEpisodeVideoEpisode.imageOriginalKey),
		introText: topicPodcastEpisodeVideoEpisode.introText,
		signOffText: topicPodcastEpisodeVideoEpisode.signOffText,
		signal,
	})

	// the chapters from their Findings' images, with an imagined image for the longest chapters that have none
	const loadChapterFrame = await prepareChapterFrames({
		podcastEpisodeId,
		ownerId,
		isPlatformBilled,
		videoChapterRows,
		segments,
		workDirectory,
	})
	const chaptersPath = await renderVideoChaptersPart({
		podcastEpisodeId,
		workDirectory,
		segments,
		loadChapterFrame,
		signal,
	})

	// the captions from the script, timed with the pauses in the audio, and held above each lower third
	const captionCues = toVideoCaptionCues({
		chapters: toVideoCaptionChapters(script, videoChapterRows),
		pauseSeconds,
		hotTakesStartSeconds: segments.flatMap((segment) => (segment.kind === "hot-takes" ? [segment.startSeconds] : [])),
	})
	const captionsPath = join(workDirectory, "captions.vtt")
	await Bun.write(captionsPath, toWebVtt(captionCues))

	// the film joined from the parts, with the audio and the captions
	const filmPath = join(workDirectory, "film.mp4")
	await writeVideoFilm({ workDirectory, ...imageParts, chaptersPath, audioPath, captionsPath, filmPath, signal })
	return { ...imageParts, chaptersPath, captionsPath, filmPath, durationSeconds }
}

// the podcast episode, the rendered files, and the keys uploaded so far, which a failure deletes
type UploadFilmFilesOptions = {
	topicPodcastEpisodeVideoEpisode: TopicPodcastEpisodeVideoEpisode
	renderedFilm: RenderedFilm
	uploadedKeys: string[]
}

// upload each file under its key, recording a pending deletion before each upload so a crash leaves nothing behind
async function uploadFilmFiles({
	topicPodcastEpisodeVideoEpisode,
	renderedFilm,
	uploadedKeys,
}: UploadFilmFilesOptions): Promise<FilmObjectKeys> {
	// one upload, if the file exists
	const uploadFile = (filePath: string | null, key: string, contentType: string): Promise<string | null> =>
		uploadTopicPodcastEpisodeVideoFile({ filePath, key, contentType, uploadedKeys })

	// the parts drawn from the image are keyed by its hash, and the chapters and captions by the podcast episode alone
	const { podcastEpisodeId, imageHash } = topicPodcastEpisodeVideoEpisode
	const toImagePartKey = (part: "intro" | "sign-off" | "film"): string =>
		toTopicPodcastEpisodeVideoImagePartKey({ podcastEpisodeId, part, imageHash })
	return {
		introKey: await uploadFile(renderedFilm.introPath, toImagePartKey("intro"), "video/mp4"),
		chaptersKey: await uploadFile(
			renderedFilm.chaptersPath,
			toTopicPodcastEpisodeVideoChaptersKey(podcastEpisodeId),
			"video/mp4",
		),
		signOffKey: await uploadFile(renderedFilm.signOffPath, toImagePartKey("sign-off"), "video/mp4"),
		filmKey: (await uploadFile(renderedFilm.filmPath, toImagePartKey("film"), "video/mp4")) ?? "",
		captionsKey:
			(await uploadFile(
				renderedFilm.captionsPath,
				toTopicPodcastEpisodeVideoCaptionsKey(podcastEpisodeId),
				"text/vtt",
			)) ?? "",
	}
}
