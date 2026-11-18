import { join } from "node:path"
import { renderVideoScene } from "./renderVideoScene"
import { loadPodcastCardAnimationPath } from "./reviewedAnimation"
import type { VideoSceneSource } from "./topicVideoImageCheck"
import { loadShownImageStill, type RenderableTopicVideoPodcastEpisode, type VideoChapterRow } from "./topicVideoInputs"
import { loadVideoAudio } from "./videoAudio"
import { toWebVtt, type VideoCaptionCue } from "./videoCaptions"
import { type PreparedChapterImages, prepareChapterImages } from "./videoChapterImages"
import { writeVideoFilm } from "./videoFilm"
import { renderVideoImageParts } from "./videoImageParts"
import { renderVideoChaptersPart } from "./videoParts"
import { toRetainedPosterHash, toVideoScenePlansHash } from "./videoScenePlan"
import type { VideoSegment } from "./videoTimeline"

// the film's files on disk, its length in seconds, and how many chapter images the render generated
export type RenderedFilm = {
	sceneSources?: VideoSceneSource[]
	scenePlansHash?: string
	// the three parts, null for a part the timeline had no frames for
	introPath: string | null
	chaptersPath: string | null
	signOffPath: string | null
	// the captions, the joined film, and what the render measured
	captionsPath: string
	filmPath: string
	durationSeconds: number
	generatedChapterImageCount: number
}

// the podcast episode, the temp folder, whether the platform pays for the generated images, and the signal that stops
// the ffmpeg runs
type RenderFilmFilesOptions = {
	renderVersion: 3 | 4
	reuseImages: boolean
	priorVersion?: number
	isRetry: boolean
	topicVideoPodcastEpisode: RenderableTopicVideoPodcastEpisode
	videoChapterRows: VideoChapterRow[]
	workDirectory: string
	isPlatformBilled: boolean
	signal?: AbortSignal
}

// render the parts, the captions, and the joined film on temp files
export async function renderFilmFiles({
	renderVersion,
	reuseImages,
	priorVersion,
	isRetry,
	topicVideoPodcastEpisode,
	videoChapterRows,
	workDirectory,
	isPlatformBilled,
	signal,
}: RenderFilmFilesOptions): Promise<RenderedFilm> {
	// the audio, the timeline, and the captions, written for the film. the shots cut where a caption starts
	const videoAudio = await loadVideoAudio({ topicVideoPodcastEpisode, videoChapterRows, workDirectory, signal })
	const { audioPath, durationSeconds, segments, captionCues } = videoAudio
	const captionsPath = join(workDirectory, "captions.vtt")
	await Bun.write(captionsPath, toWebVtt(captionCues))
	const captionStartSeconds = captionCues.map((captionCue) => captionCue.startSeconds)

	// each chapter's images: its Resource's, then the generated images it lacks, then the podcast card
	const { podcastEpisodeId, ownerId } = topicVideoPodcastEpisode
	const shownImageStill = await loadShownImageStill(topicVideoPodcastEpisode)
	const podcastCardAnimationPath = renderVersion === 4 ? await loadPodcastCardAnimationPath() : undefined
	const preparedChapterImages = await prepareChapterImages({
		podcastCardAnimationPath,
		requiresPublicSceneSources: renderVersion === 4,
		isChapterImageGenerationSkipped: reuseImages,
		priorVersion,
		podcastEpisodeId,
		ownerId,
		isPlatformBilled,
		videoChapterRows,
		segments,
		shownImageStill,
		signal,
	})

	// the intro and the sign-off, from the image the film shows and each chapter's first image
	const imageParts = await renderVideoImageParts({
		podcastCardAnimationPath,
		podcastEpisodeId,
		workDirectory,
		segments,
		shownImageStill,
		chapterImages: preparedChapterImages.firstChapterImages,
		introText: topicVideoPodcastEpisode.introText,
		signOffText: topicVideoPodcastEpisode.signOffText,
		captionStartSeconds,
		signal,
	})

	// render the chapters and record the plans used by this attempt
	const { chaptersPath, scenePlansHash } = await renderFilmChapters({
		podcastEpisodeId,
		workDirectory,
		renderVersion,
		isRetry,
		segments,
		captionCues,
		preparedChapterImages,
		animationBilling: { ownerId, isPlatformBilled },
		posterHash:
			renderVersion === 4
				? toRetainedPosterHash(podcastEpisodeId, segments, captionStartSeconds, shownImageStill)
				: null,
		signal,
	})

	// the film joined from the parts, with the audio and the captions
	const filmPath = join(workDirectory, "film.mp4")
	await writeVideoFilm({ workDirectory, ...imageParts, chaptersPath, audioPath, captionsPath, filmPath, signal })
	const generatedChapterImageCount = preparedChapterImages.newlyGeneratedChapterImageCount
	const sceneSources = preparedChapterImages.sceneSources

	return {
		...imageParts,
		chaptersPath,
		captionsPath,
		filmPath,
		durationSeconds,
		generatedChapterImageCount,
		sceneSources,
		scenePlansHash,
	}
}

/**
 * Renders the chapters part and identifies the approved plans that produced its frames.
 */
export async function renderFilmChapters(options: {
	podcastEpisodeId: string
	workDirectory: string
	renderVersion: 3 | 4
	isRetry: boolean
	segments: VideoSegment[]
	captionCues: VideoCaptionCue[]
	preparedChapterImages: PreparedChapterImages
	posterHash: string | null
	animationBilling: { ownerId: string; isPlatformBilled: boolean; isStoredAnimationOnly?: boolean }
	signal?: AbortSignal
}): Promise<{ chaptersPath: string | null; scenePlansHash?: string }> {
	const {
		podcastEpisodeId,
		workDirectory,
		renderVersion,
		isRetry,
		segments,
		captionCues,
		preparedChapterImages,
		animationBilling,
		posterHash,
		signal,
	} = options
	// Share the eight local picture selections across the film’s sequential chapters.
	const localAnimationAssets = new Set<string>()
	const planHashes: string[] = []
	const chaptersPath = await renderVideoChaptersPart({
		renderChapter:
			renderVersion === 4
				? (segment, chapter) =>
						renderVideoScene({
							onEncodedPlan: (planHash) => planHashes.push(planHash),
							localAnimationAssets,
							animationBilling,
							podcastEpisodeId,
							workDirectory,
							segment,
							chapter,
							captions: captionCues,
							isRetry,
							signal,
						})
				: undefined,
		podcastEpisodeId,
		workDirectory,
		segments,
		chapterImages: preparedChapterImages.chapterImages,
		podcastCardImages: preparedChapterImages.podcastCardImages,
		captionStartSeconds: captionCues.map((cue) => cue.startSeconds),
		signal,
	})

	// bind the uploaded part to the plans used for its successful chapter encodes
	const scenePlansHash =
		renderVersion === 4
			? toVideoScenePlansHash(planHashes, preparedChapterImages.sceneSources ?? [], posterHash)
			: undefined
	return { chaptersPath, scenePlansHash }
}
