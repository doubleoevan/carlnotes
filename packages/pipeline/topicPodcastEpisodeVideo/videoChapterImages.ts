// each chapter's images in a podcast episode film, in the order its shots show them: its Resource's images, then its
// generated images, then the podcast card. a chapter gets as many generated images as bring it to one distinct image for
// every 30 seconds, up to the film's limit. the intro and the sign-off cut through each chapter's first image

import { loadSpendControlSettings } from "@carlnotes/db/dailySpendCutoffs"
import { getAttachmentBytes } from "@carlnotes/db/store"
import { GENERATED_CHAPTER_IMAGE_LIMIT_PER_CHAPTER } from "@carlnotes/db/topicPodcastEpisodeVideoKeys"
import { loadOrFetchResourceImages, type ResourceImage } from "../resourceImages/fetchResourceImages"
import {
	type GeneratedChapterImageBilling,
	type GeneratedChapterImageRef,
	loadGeneratedChapterImages,
} from "./generatedChapterImages"
import { type ShownImageStill, toChapterLowerThirdText, type VideoChapterRow } from "./topicPodcastEpisodeVideoInputs"
import {
	loadPodcastCardStillPng,
	PODCAST_CARD_ZOOM_LIMIT,
	toVideoStillPng,
	VIDEO_HEIGHT,
	VIDEO_WIDTH,
} from "./videoFrames"
import type { VideoChapterImages, VideoSegmentImage } from "./videoParts"
import { SHOT_MAXIMUM_SCREEN_SECONDS, toShotZoomLimit } from "./videoShots"
import { toSegmentSeconds, type VideoSegment } from "./videoTimeline"

// how many seconds of a chapter each distinct image covers, and the fewest images a chapter of more than one shot shows
const CHAPTER_SECONDS_PER_DISTINCT_IMAGE = 30
const MINIMUM_DISTINCT_IMAGE_COUNT = 2

// the film's billing, its chapters and timeline, the image the film shows, and whether image generation is skipped, so only the
// generated images that an earlier render stored are read
type PrepareChapterImagesOptions = GeneratedChapterImageBilling & {
	videoChapterRows: VideoChapterRow[]
	segments: VideoSegment[]
	shownImageStill: ShownImageStill
	isChapterImageGenerationSkipped?: boolean
}

// each chapter's images by its position, the images of a segment that has none of its own, the images that the intro
// and the sign-off cut through, and how many generated images this render generated
export type PreparedChapterImages = {
	chapterImages: Map<number, VideoChapterImages>
	podcastCardImages: VideoSegmentImage[]
	firstChapterImages: VideoSegmentImage[]
	newlyGeneratedChapterImageCount: number
}

/**
 * Settles every chapter's images before the chapters are encoded: fetches the images of each chapter's Resource,
 * generates the generated images that give each chapter one distinct image for every 30 seconds, up to the film's limit,
 * unless image generation is skipped, and returns each chapter's images in the order its shots show them. Throws the
 * signal's reason once it is aborted.
 */
export async function prepareChapterImages({
	videoChapterRows,
	segments,
	shownImageStill,
	isChapterImageGenerationSkipped,
	...generatedChapterImageBilling
}: PrepareChapterImagesOptions): Promise<PreparedChapterImages> {
	// load or fetch every chapter's Resource Images
	const { signal } = generatedChapterImageBilling
	const resourceIds = videoChapterRows.map(({ resourceId }) => resourceId)
	const resourceImagesById = await loadOrFetchResourceImages(resourceIds, signal)

	// how many generated images each safe chapter lacks
	const safeChapterRows = videoChapterRows.filter((videoChapterRow) => !videoChapterRow.isUnsafe)
	const chapterSeconds = toChapterSeconds(segments)
	const missingGeneratedChapterImageCounts = safeChapterRows.map((videoChapterRow) => ({
		position: videoChapterRow.position,
		missingGeneratedChapterImageCount: toMissingGeneratedChapterImageCount({
			seconds: chapterSeconds.get(videoChapterRow.position) ?? 0,
			resourceImageCount: resourceImagesById.get(videoChapterRow.resourceId)?.length ?? 0,
		}),
	}))

	// generate what the chapters lack, each chapter's first missing image before any chapter's second, up to the limit
	// in the spend control settings
	const { generatedChapterImageLimit } = await loadSpendControlSettings()
	const generatedChapterImages = await loadGeneratedChapterImages({
		...generatedChapterImageBilling,
		isChapterImageGenerationSkipped,
		generatedChapterImageRefs: toGeneratedChapterImageRefs(
			missingGeneratedChapterImageCounts,
			generatedChapterImageLimit,
		),
	})

	// the podcast card, and the pair that a segment with nothing else cuts between, with the film's own image unless the
	// film shows the podcast card
	const podcastCardImage: VideoSegmentImage = {
		loadStillPng: loadPodcastCardStillPng,
		zoomLimit: PODCAST_CARD_ZOOM_LIMIT,
	}
	const filmImage: VideoSegmentImage | null = shownImageStill.isPodcastCard
		? null
		: { loadStillPng: async () => shownImageStill.stillPng, zoomLimit: shownImageStill.zoomLimit }
	const podcastCardImages = filmImage ? [podcastCardImage, filmImage] : [podcastCardImage]

	// each Resource's images made once, so chapters that narrate one Resource share the same images
	const resourceSegmentImagesById = new Map(
		[...resourceImagesById].map(([resourceId, resourceImages]) => [
			resourceId,
			resourceImages.map(toResourceSegmentImage),
		]),
	)

	// each chapter's Resource images, then its generated images, then the podcast card
	const chapterImages = new Map<number, VideoChapterImages>()
	for (const videoChapterRow of videoChapterRows) {
		const resourceSegmentImages = resourceSegmentImagesById.get(videoChapterRow.resourceId) ?? []
		const generatedJpegs = generatedChapterImages.jpegBytesByPosition.get(videoChapterRow.position) ?? []
		const ownImages = [...resourceSegmentImages, ...generatedJpegs.map(toGeneratedSegmentImage)]
		chapterImages.set(videoChapterRow.position, {
			images: ownImages.length > 0 ? [...ownImages, podcastCardImage] : podcastCardImages,
			lowerThirdText: toChapterLowerThirdText(videoChapterRow),
		})
	}
	return {
		chapterImages,
		podcastCardImages,
		firstChapterImages: toFirstChapterImages({ chapterImages, podcastCardImage, isFilmImagePodcastCard: !filmImage }),
		newlyGeneratedChapterImageCount: generatedChapterImages.newlyGeneratedChapterImageCount,
	}
}

// each chapter's images, the podcast card, and whether the film shows the podcast card as its image
type ToFirstChapterImagesOptions = {
	chapterImages: Map<number, VideoChapterImages>
	podcastCardImage: VideoSegmentImage
	isFilmImagePodcastCard: boolean
}

/**
 * Returns each chapter's first image in chapter order, each image once, for the intro and the sign-off to cut through.
 * The podcast card is added if fewer than two images remain, so no two shots in a row show the same image, and left out
 * of a film that already shows the podcast card as its image.
 */
export function toFirstChapterImages({
	chapterImages,
	podcastCardImage,
	isFilmImagePodcastCard,
}: ToFirstChapterImagesOptions): VideoSegmentImage[] {
	// each chapter's first image once, without the podcast card if the film already shows it
	const distinctFirstChapterImages = [
		...new Set([...chapterImages.values()].flatMap((videoChapterImages) => videoChapterImages.images.slice(0, 1))),
	]
	const firstChapterImages = isFilmImagePodcastCard
		? distinctFirstChapterImages.filter((image) => image !== podcastCardImage)
		: distinctFirstChapterImages

	// add the podcast card if fewer than two images remain
	if (!isFilmImagePodcastCard && firstChapterImages.length < 2 && !firstChapterImages.includes(podcastCardImage)) {
		firstChapterImages.push(podcastCardImage)
	}
	return firstChapterImages
}

// each chapter's length in seconds by its position, from its segment, which holds the gap before the next chapter
function toChapterSeconds(segments: VideoSegment[]): Map<number, number> {
	// read each chapter segment's length
	const chapterSeconds = new Map<number, number>()
	for (const segment of segments) {
		if (segment.kind === "chapter") {
			chapterSeconds.set(segment.position, toSegmentSeconds(segment.frameCount))
		}
	}
	return chapterSeconds
}

// a chapter's length in seconds, and how many images its Resource has
type ToMissingGeneratedChapterImageCountOptions = { seconds: number; resourceImageCount: number }

/**
 * Returns how many generated images a chapter lacks: it shows one distinct image for every 30 seconds, and at least
 * two if it runs longer than one shot, counting its Resource's images and the podcast card first. A chapter never
 * lacks more than it may store.
 */
export function toMissingGeneratedChapterImageCount({
	seconds,
	resourceImageCount,
}: ToMissingGeneratedChapterImageCountOptions): number {
	// a chapter of one shot shows one image, and a longer one shows two or more
	const imagesBySeconds = Math.ceil(seconds / CHAPTER_SECONDS_PER_DISTINCT_IMAGE)
	const distinctImageCount =
		seconds > SHOT_MAXIMUM_SCREEN_SECONDS ? Math.max(MINIMUM_DISTINCT_IMAGE_COUNT, imagesBySeconds) : 1

	// the Resource's images and the podcast card count first
	const missingGeneratedChapterImageCount = distinctImageCount - resourceImageCount - 1
	return Math.min(GENERATED_CHAPTER_IMAGE_LIMIT_PER_CHAPTER, Math.max(0, missingGeneratedChapterImageCount))
}

/**
 * Returns the generated images a film settles, in the order it generates them: every chapter's first missing image, then
 * every chapter's second, and so on, up to the film's limit.
 */
export function toGeneratedChapterImageRefs(
	missingGeneratedChapterImageCounts: { position: number; missingGeneratedChapterImageCount: number }[],
	filmImageLimit: number,
): GeneratedChapterImageRef[] {
	// one round for each image number, across the chapters that still lack an image
	const generatedChapterImageRefs: GeneratedChapterImageRef[] = []
	for (let imageNumber = 0; imageNumber < GENERATED_CHAPTER_IMAGE_LIMIT_PER_CHAPTER; imageNumber++) {
		const lackingChapters = missingGeneratedChapterImageCounts.filter(
			({ missingGeneratedChapterImageCount }) => missingGeneratedChapterImageCount > imageNumber,
		)
		generatedChapterImageRefs.push(...lackingChapters.map(({ position }) => ({ position, imageNumber })))
	}
	return generatedChapterImageRefs.slice(0, filmImageLimit)
}

// a Resource's stored image as a segment's image: its still from the stored jpeg, and the zoom its pixels hold
function toResourceSegmentImage(resourceImage: ResourceImage): VideoSegmentImage {
	return {
		loadStillPng: async () => toVideoStillPng(await getAttachmentBytes(resourceImage.objectKey)),
		zoomLimit: toShotZoomLimit(resourceImage),
	}
}

// a generated image as a segment's image: its still from the jpeg, and the zoom an image at the film's size holds
function toGeneratedSegmentImage(jpegBytes: Uint8Array): VideoSegmentImage {
	return {
		loadStillPng: () => toVideoStillPng(jpegBytes),
		zoomLimit: toShotZoomLimit({ width: VIDEO_WIDTH, height: VIDEO_HEIGHT }),
	}
}
