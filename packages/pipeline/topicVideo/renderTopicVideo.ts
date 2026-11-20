// a published podcast episode's film: rendered from its own audio on temp files, stored as three parts and the joined
// film with its captions, and billed to the podcast episode's owner. a ready film below the current render version is
// rendered again while it keeps playing, and its files are swapped once the new ones are stored

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { TopicVideoRenderVersion } from "@carlnotes/contracts/topicVideoWork"
import { deletePodcastFeedCache } from "@carlnotes/db/podcastFeedCache"
import { deleteStoredObjects } from "@carlnotes/db/store"
import {
	toTopicVideoCaptionsKey,
	toTopicVideoChaptersKey,
	toTopicVideoImageKey,
	toTopicVideoImageLargeOriginalKey,
	toTopicVideoImagePartKey,
	toTopicVideoRenderAttemptUploadKey,
} from "@carlnotes/db/topicVideoKeys"
import { reportError } from "@carlnotes/server/monitoring"
import { deleteOlderStyleGeneratedChapterImages } from "./generatedChapterImages"
import { type RenderedFilm, renderFilmFiles } from "./renderFilmFiles"
import { deleteStoredVideoShots, saveTopicVideoRerenderFailed } from "./topicVideoFailures"
import { generateTopicVideoImage } from "./topicVideoImage"
import {
	loadTopicVideoPodcastEpisode,
	loadVideoChapterRows,
	type RenderableTopicVideoPodcastEpisode,
	type TopicVideoPodcastEpisode,
	type VideoChapterRow,
} from "./topicVideoInputs"
import {
	type FilmObjectKeys,
	isPodcastEpisodePublished,
	loadTopicVideoRenderState,
	publishTopicVideoReplacement,
	recordPlatformTopicVideoSpend,
	saveTopicVideoReady,
	saveTopicVideoRendering,
	saveTopicVideoSkipped,
	TOPIC_VIDEO_RENDER_VERSION,
	toTopicVideoCostDollars,
	uploadTopicVideoFile,
} from "./topicVideoRows"
import { type RunOutsideSlot, runWithoutSlot, withTopicVideoSlot } from "./topicVideoSlot"
import { withVideoRenderResourceLimits } from "./videoRenderResourceLimits"
import { runWithStoredVideoShots } from "./videoShotStore"

// what a render did. it rendered the film, or skipped a podcast episode that is not published, a film already ready at
// the current render version, a podcast episode missing its audio, transcript, or chapters, or a podcast episode that
// was removed while its film rendered
export type RenderTopicVideoResult =
	| { outcome: "rendered"; renderSeconds: number; byteSize: number; generatedChapterImageCount: number }
	| { outcome: "skipped"; reason: "unpublished" | "ready" | "missing-inputs" | "removed" }

// the podcast episode, whether the platform pays for the film instead of the owner, as the backfill does, whether the
// backfill started the render, which waits behind every other render for a slot, and a signal that stops the render
// once it aborts

type RenderTopicVideoOptions = {
	renderVersion?: TopicVideoRenderVersion
	isRetry?: boolean
	podcastEpisodeId: string
	isPlatformBilled?: boolean
	isBackfillRender?: boolean
	signal?: AbortSignal
}

/**
 * Renders and stores a published podcast episode's film at the current render version, then marks its row ready with
 * its keys and cost. A ready film below that version is rendered again: it keeps playing until the new files are
 * stored, then its row takes the new keys, and a failure leaves it as it was. A podcast episode missing its inputs
 * gets a failed row, so it is never tried again. A failure deletes what it uploaded and throws an error, so another
 * attempt starts clean. An aborted signal kills the ffmpeg run in progress and fails the render before it uploads. A
 * render whose podcast episode was removed meanwhile is skipped instead of failed, because no attempt could finish it.
 */
export async function renderTopicVideo(options: RenderTopicVideoOptions): Promise<RenderTopicVideoResult> {
	const { podcastEpisodeId } = options
	try {
		// a saved film leaves no shot behind. the delete runs once the film's slot is free
		const renderResult = await withTopicVideoSlot(
			options.signal,
			(filmSlot) => renderFilm({ ...options, ...filmSlot }),
			options.isBackfillRender,
		)
		if (renderResult.outcome === "rendered") {
			await deleteStoredVideoShots(podcastEpisodeId)
		}
		return renderResult
	} catch (error) {
		// a read that fails too leaves the render's own failure to throw
		const isPublished = await isPodcastEpisodePublished(podcastEpisodeId).catch(() => true)
		if (isPublished) {
			throw error
		}

		// no attempt will render a removed podcast episode's film, so its shots go at once
		await deleteStoredVideoShots(podcastEpisodeId)
		return { outcome: "skipped", reason: "removed" }
	}
}

// render one film in the slot it holds. its waits on a provider, for its own image, its chapters' images, and a
// version 4 chapter's plan and clip, run outside the slot
async function renderFilm({
	renderVersion = TOPIC_VIDEO_RENDER_VERSION,
	isRetry = false,
	podcastEpisodeId,
	isPlatformBilled = false,
	signal,
	runOutsideSlot = runWithoutSlot,
}: RenderTopicVideoOptions & {
	signal: AbortSignal
	runOutsideSlot?: RunOutsideSlot
}): Promise<RenderTopicVideoResult> {
	// what the film is rendered from, or why it is not rendered
	const renderStartMs = performance.now()
	const topicVideoInputs = await loadRenderInputs({ podcastEpisodeId, renderVersion })
	if (topicVideoInputs.outcome === "skipped") {
		return topicVideoInputs
	}

	// a first render shows its row rendering and generates the film's own image before the intro and the sign-off. a film
	// rendered again keeps its row ready and the image it shows, so a failure leaves the row as it was
	const { videoChapterRows, isRerender } = topicVideoInputs
	const topicVideoPodcastEpisode = isRerender
		? topicVideoInputs.topicVideoPodcastEpisode
		: await runOutsideSlot(() =>
				startFirstRender({
					isRetry,
					topicVideoPodcastEpisode: topicVideoInputs.topicVideoPodcastEpisode,
					isPlatformBilled,
				}),
			)

	// the render works in its own temp folder
	const workDirectory = await mkdtemp(join(tmpdir(), "episode-video-"))
	const uploadedKeys: string[] = []
	try {
		// render on disk, reusing the shots that an earlier attempt stored, and upload unless the render was stopped
		const renderedFilm = await runWithStoredVideoShots({ podcastEpisodeId, renderVersion }, () =>
			withVideoRenderResourceLimits(workDirectory, signal, (encodeSignal) =>
				renderFilmFiles({
					renderVersion,
					reuseImages: renderVersion === 4 && (isRetry || isRerender),
					priorVersion: topicVideoInputs.priorVersion,
					isRetry,
					topicVideoPodcastEpisode,
					videoChapterRows,
					workDirectory,
					isPlatformBilled,
					runOutsideSlot,
					signal: encodeSignal,
				}),
			),
		)
		signal?.throwIfAborted()
		const objectKeys = await uploadFilmFiles({
			topicVideoPodcastEpisode,
			renderedFilm,
			uploadedKeys,
			renderVersion,
			signal,
		})

		signal.throwIfAborted()
		// mark the row ready with its cost, or swap a film rendered again for the one that plays
		const byteSize = Bun.file(renderedFilm.filmPath).size
		const renderedRow = {
			signal,
			renderVersion,
			topicId: topicVideoPodcastEpisode.topicId,
			sceneSources: renderedFilm.sceneSources,
			podcastEpisodeId,
			objectKeys,
			byteSize,
			durationSeconds: renderedFilm.durationSeconds,
			imageHash: topicVideoPodcastEpisode.imageHash,
			costDollars: isPlatformBilled ? 0 : toTopicVideoCostDollars(renderedFilm.durationSeconds),
		}
		await (isRerender ? publishTopicVideoReplacement(renderedRow) : saveTopicVideoReady(renderedRow))

		// the platform's render minutes go in a row of their own, dated today, and the film row's cost stays as it is
		if (isPlatformBilled) {
			const dollars = toTopicVideoCostDollars(renderedFilm.durationSeconds)
			await recordPlatformTopicVideoSpend({ podcastEpisodeId, kind: "topicVideoRender", dollars })
		}

		// the saved row plays the uploaded files, so a failure after the save deletes none of them
		uploadedKeys.length = 0

		// the film feeds list the finished film on their next fetch
		await deletePodcastFeedCache(topicVideoPodcastEpisode.topicId)

		// delete a re-rendered film's generated images in an older style. a failed delete is reported, and the saved
		// film stands
		if (isRerender && renderVersion === 3) {
			const positions = videoChapterRows.map((videoChapterRow) => videoChapterRow.position)
			await deleteOlderStyleGeneratedChapterImages({ podcastEpisodeId, positions }).catch((error: unknown) =>
				reportError(error, "topic-video", { podcastEpisodeId, step: "older-style-chapter-images" }),
			)
		}
		const { generatedChapterImageCount } = renderedFilm
		const renderSeconds = (performance.now() - renderStartMs) / 1000
		return { outcome: "rendered", renderSeconds, byteSize, generatedChapterImageCount }
	} catch (error) {
		// A dropped commit acknowledgement may hide a successful swap. Its transaction owns v4 cleanup.
		if (renderVersion < 4) {
			await deleteStoredObjects(uploadedKeys)
		}
		throw error
	} finally {
		await rm(workDirectory, { recursive: true, force: true })
	}
}

// the podcast episode as loaded, and whether the platform pays for the image
type StartFirstRenderOptions = {
	isRetry: boolean
	topicVideoPodcastEpisode: RenderableTopicVideoPodcastEpisode
	isPlatformBilled: boolean
}

// mark a first render's row rendering, generate the film's own image if it has none, and return the podcast episode
// showing it. a failed image generation is reported, and the film shows the image its podcast episode shows
async function startFirstRender({
	isRetry,
	topicVideoPodcastEpisode,
	isPlatformBilled,
}: StartFirstRenderOptions): Promise<RenderableTopicVideoPodcastEpisode> {
	// show the row rendering, then generate the image, and report a failure without stopping the film
	const { podcastEpisodeId } = topicVideoPodcastEpisode
	await saveTopicVideoRendering(podcastEpisodeId)
	if (isRetry) {
		return topicVideoPodcastEpisode
	}

	// the film's own image, or null if none was drawn
	const imageHash = await generateTopicVideoImage({ podcastEpisodeId, isPlatformBilled }).catch((error: unknown) => {
		reportError(error, "topic-video", { podcastEpisodeId, step: "image" })
		return null
	})

	// nothing generated leaves the image the podcast episode already shows
	if (!imageHash) {
		return topicVideoPodcastEpisode
	}
	return {
		...topicVideoPodcastEpisode,
		imageHash,
		imageOriginalKey: toTopicVideoImageKey(podcastEpisodeId, imageHash),
		imageLargeOriginalKey: toTopicVideoImageLargeOriginalKey(podcastEpisodeId, imageHash),
	}
}

// what a render reads before it starts: the podcast episode, its chapters, and whether it renders a ready film again,
// or the reason the render is skipped
type RenderInputs =
	| {
			outcome: "ready"
			// what the render reads, and whether it replaces a film that plays now
			topicVideoPodcastEpisode: RenderableTopicVideoPodcastEpisode
			videoChapterRows: VideoChapterRow[]
			isRerender: boolean
			priorVersion?: number
	  }
	| Extract<RenderTopicVideoResult, { outcome: "skipped" }>

// load the podcast episode and its chapters, skipping a film already ready at the current render version. a podcast
// episode missing its audio, transcript, or chapters gets a failed row on a first render, with a warning, and a film
// rendered again keeps its row
async function loadRenderInputs({
	podcastEpisodeId,
	renderVersion = TOPIC_VIDEO_RENDER_VERSION,
}: Pick<RenderTopicVideoOptions, "podcastEpisodeId" | "renderVersion">): Promise<RenderInputs> {
	// only a published podcast episode renders
	const topicVideoPodcastEpisode = await loadTopicVideoPodcastEpisode(podcastEpisodeId)
	if (!topicVideoPodcastEpisode) {
		return { outcome: "skipped", reason: "unpublished" }
	}

	// a film ready at the current render version is done. one ready below it is rendered again, and replaces its files
	const renderState = await loadTopicVideoRenderState(podcastEpisodeId)
	const isReady = renderState?.status === "ready"
	if (isReady && renderState.renderVersion >= renderVersion) {
		return { outcome: "skipped", reason: "ready" }
	}
	const isRerender = isReady

	// read the audio, the transcript, and the chapters
	const { audioKey, script } = topicVideoPodcastEpisode
	const videoChapterRows = await loadVideoChapterRows(podcastEpisodeId)

	// a podcast episode missing an input is marked once, so no listing finds it again
	if (!audioKey || !script || videoChapterRows.length === 0) {
		console.warn(`podcast episode ${podcastEpisodeId} has no audio, transcript, or chapters, so it gets no film`)
		await (isRerender
			? saveTopicVideoRerenderFailed(podcastEpisodeId, renderVersion)
			: saveTopicVideoSkipped(podcastEpisodeId))
		return { outcome: "skipped", reason: "missing-inputs" }
	}

	// everything the render reads is there
	return {
		outcome: "ready",
		topicVideoPodcastEpisode: { ...topicVideoPodcastEpisode, audioKey, script },
		videoChapterRows,
		isRerender,
		priorVersion: isReady ? renderState.renderVersion : undefined,
	}
}

// the podcast episode, the rendered files, and the keys uploaded so far, which a failure deletes
type UploadFilmFilesOptions = {
	signal: AbortSignal
	renderVersion: TopicVideoRenderVersion
	topicVideoPodcastEpisode: TopicVideoPodcastEpisode
	renderedFilm: RenderedFilm
	uploadedKeys: string[]
}

// upload each file under its key at the current render version, recording a pending deletion before each upload so a
// crash leaves nothing behind
async function uploadFilmFiles({
	signal,
	renderVersion,
	topicVideoPodcastEpisode,
	renderedFilm,
	uploadedKeys,
}: UploadFilmFilesOptions): Promise<FilmObjectKeys> {
	// one upload, if the file exists
	const attempt = renderVersion >= 4 ? crypto.randomUUID() : undefined
	const uploadFile = (filePath: string | null, key: string, contentType: string): Promise<string | null> =>
		uploadTopicVideoFile({
			filePath,
			key: toTopicVideoRenderAttemptUploadKey(key, attempt),
			contentType,
			uploadedKeys,
			signal,
		})

	// the parts rendered from the image are keyed by its hash, and the chapters and captions by the podcast episode alone
	const { podcastEpisodeId, imageHash } = topicVideoPodcastEpisode
	const toImagePartKey = (part: "intro" | "sign-off" | "film"): string =>
		toTopicVideoImagePartKey({ podcastEpisodeId, part, imageHash, renderVersion })
	const chaptersKey = toTopicVideoChaptersKey(podcastEpisodeId, renderVersion, renderedFilm.scenePlansHash)
	const captionsKey = toTopicVideoCaptionsKey(podcastEpisodeId, renderVersion)
	return {
		introKey: await uploadFile(renderedFilm.introPath, toImagePartKey("intro"), "video/mp4"),
		chaptersKey: await uploadFile(renderedFilm.chaptersPath, chaptersKey, "video/mp4"),
		signOffKey: await uploadFile(renderedFilm.signOffPath, toImagePartKey("sign-off"), "video/mp4"),
		filmKey: (await uploadFile(renderedFilm.filmPath, toImagePartKey("film"), "video/mp4")) ?? "",
		captionsKey: (await uploadFile(renderedFilm.captionsPath, captionsKey, "text/vtt")) ?? "",
	}
}
