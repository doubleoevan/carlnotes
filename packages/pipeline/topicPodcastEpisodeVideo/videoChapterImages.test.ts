// a film's chapter images, with the connection pool, storage, the Resource Image fetch, and the model calls stubbed:
// how many generated images a chapter lacks, which ones a film generates within its limit, each chapter's images in order,
// and a failed image generation that leaves a chapter on the images it has
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import type { ResourceImage } from "../resourceImages/fetchResourceImages"
import * as resourceImageFetch from "../resourceImages/fetchResourceImages"
import { TopicImageRenderFailure } from "../topicImages/renderTopicImageOriginal"
import {
	type ChapterImageGenerationSpies,
	OWNER_BILLING,
	stubChapterImageGenerations,
	stubChapterReads,
} from "./chapterImageTestFixtures"
import type { ShownImageStill, VideoChapterRow } from "./topicPodcastEpisodeVideoInputs"
import {
	prepareChapterImages,
	toFirstChapterImages,
	toGeneratedChapterImageRefs,
	toMissingGeneratedChapterImageCount,
} from "./videoChapterImages"
import * as videoFrames from "./videoFrames"
import type { VideoChapterImages, VideoSegmentImage } from "./videoParts"
import { VIDEO_FRAMES_PER_SECOND, type VideoSegment } from "./videoTimeline"

// the stills the stubs return, each a marker the tests tell apart: the podcast card's and the film's own image's
const PODCAST_CARD_STILL = new Uint8Array([9])
const FILM_IMAGE_STILL = new Uint8Array([7])

// the film's own image, which a segment with nothing else borrows, and the podcast card a film with no image shows
const FILM_IMAGE: ShownImageStill = { stillPng: FILM_IMAGE_STILL, zoomLimit: 2, isPodcastCard: false }
const PODCAST_CARD_IMAGE: ShownImageStill = { stillPng: PODCAST_CARD_STILL, zoomLimit: 2, isPodcastCard: true }

// the setting the tests change
const restoreEnvSettings = saveEnvSettings(["TOPIC_PODCAST_EPISODE_VIDEO_GENERATED_CHAPTER_IMAGE_LIMIT"])

// the spies the tests read
let loadOrFetchImages: ReturnType<typeof spyOn>
let renderOriginal: ChapterImageGenerationSpies["renderOriginal"]
let upload: ChapterImageGenerationSpies["upload"]
let reportError: ChapterImageGenerationSpies["reportError"]

// each Resource's stored images, which a test sets before it prepares
let resourceImagesById = new Map<string, ResourceImage[]>()

// the shared image generations, a fetch that returns the stored images, and stills made from the bytes they read
beforeEach(() => {
	;({ renderOriginal, upload, reportError } = stubChapterImageGenerations())
	resourceImagesById = new Map()
	loadOrFetchImages = spyOn(resourceImageFetch, "loadOrFetchResourceImages").mockImplementation(
		async () => resourceImagesById,
	)

	// a still is the bytes it was made from, and the podcast card's is its marker
	spyOn(videoFrames, "toVideoStillPng").mockImplementation(async (imageBytes: Uint8Array) => imageBytes)
	spyOn(videoFrames, "loadPodcastCardStillPng").mockResolvedValue(PODCAST_CARD_STILL)
})

// put the pool, every spy, and the setting back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
	restoreEnvSettings()
})

// a chapter row at a position, safe unless said otherwise, that narrates its own Resource
function toVideoChapterRow(position: number, isUnsafe = false): VideoChapterRow {
	return {
		position,
		title: `Chapter ${position}`,
		sourceUrl: `https://example.com/${position}`,
		startSeconds: 0,
		endSeconds: 0,
		resourceId: `resource-${position}`,
		isUnsafe,
	}
}

// a chapter's segment that runs a number of seconds
function toChapterSegment(position: number, seconds: number): VideoSegment {
	return { kind: "chapter", position, startSeconds: 0, frameCount: seconds * VIDEO_FRAMES_PER_SECOND }
}

// give a chapter's Resource a number of stored images, each 2560 by 1440
function storeResourceImages(position: number, imageCount: number): void {
	const resourceImages = Array.from({ length: imageCount }, (_, i) => ({
		objectKey: `resources/resource-${position}/images/${i}.jpg`,
		width: 2560,
		height: 1440,
		isLinkPreviewImage: i === 0,
	}))
	resourceImagesById.set(`resource-${position}`, resourceImages)
}

// what each of a chapter's images is, read from its still: a Resource Image, a generated image, the podcast card, or
// the film's own image
async function toImageKinds(images: VideoSegmentImage[]): Promise<string[]> {
	const stills = await Promise.all(images.map((image) => image.loadStillPng()))
	return stills.map((stillPng) => {
		// the podcast card's and the film image's stills are their markers
		if (stillPng === PODCAST_CARD_STILL) {
			return "podcast-card"
		}
		if (stillPng === FILM_IMAGE_STILL) {
			return "film-image"
		}

		// a Resource Image's still is its object key, and any other is a generated image's jpeg
		return new TextDecoder().decode(stillPng).startsWith("resources/") ? "resource" : "generated"
	})
}

// prepare one chapter of some seconds, and return its images
async function prepareOneChapter(seconds: number, isUnsafe = false): Promise<VideoSegmentImage[]> {
	const { chapterImages } = await prepareChapterImages({
		...OWNER_BILLING,
		videoChapterRows: [toVideoChapterRow(0, isUnsafe)],
		segments: [toChapterSegment(0, seconds)],
		shownImageStill: FILM_IMAGE,
	})
	return chapterImages.get(0)?.images ?? []
}

test("a chapter lacks what one distinct image for every 30 seconds needs, after its Resource Images and the podcast card", () => {
	expect(toMissingGeneratedChapterImageCount({ seconds: 120, resourceImageCount: 3 })).toBe(0)
	expect(toMissingGeneratedChapterImageCount({ seconds: 180, resourceImageCount: 1 })).toBe(4)
	expect(toMissingGeneratedChapterImageCount({ seconds: 45, resourceImageCount: 0 })).toBe(1)

	// a chapter of one shot shows one image, a longer one at least two, and none lacks more than it may store
	expect(toMissingGeneratedChapterImageCount({ seconds: 6, resourceImageCount: 0 })).toBe(0)
	expect(toMissingGeneratedChapterImageCount({ seconds: 20, resourceImageCount: 0 })).toBe(1)
	expect(toMissingGeneratedChapterImageCount({ seconds: 900, resourceImageCount: 0 })).toBe(12)
})

test("a film past its limit gives every chapter its first missing image before any gets its second", () => {
	const missingGeneratedChapterImageCounts = [0, 1, 2].map((position) => ({
		position,
		missingGeneratedChapterImageCount: 2,
	}))
	expect(toGeneratedChapterImageRefs(missingGeneratedChapterImageCounts, 3)).toEqual([
		{ position: 0, imageNumber: 0 },
		{ position: 1, imageNumber: 0 },
		{ position: 2, imageNumber: 0 },
	])

	// a limit with room generates the second round too, and a limit of zero generates none
	expect(toGeneratedChapterImageRefs(missingGeneratedChapterImageCounts, 40)).toHaveLength(6)
	expect(toGeneratedChapterImageRefs(missingGeneratedChapterImageCounts, 0)).toEqual([])
})

test("a chapter with enough Resource Images generates none, and shows them before the podcast card", async () => {
	stubChapterReads()
	storeResourceImages(0, 3)
	const images = await prepareOneChapter(120)

	// the three stored images, then the podcast card, with nothing generated
	expect(await toImageKinds(images)).toEqual(["resource", "resource", "resource", "podcast-card"])
	expect(images.map((image) => image.zoomLimit)).toEqual([2, 2, 2, 2])
	expect(renderOriginal).not.toHaveBeenCalled()
	expect(loadOrFetchImages).toHaveBeenCalledWith(["resource-0"], undefined)
})

test("a long chapter with one Resource Image generates the difference", async () => {
	stubChapterReads()
	storeResourceImages(0, 1)
	const images = await prepareOneChapter(180)
	expect(renderOriginal).toHaveBeenCalledTimes(4)
	expect(await toImageKinds(images)).toEqual([
		"resource",
		"generated",
		"generated",
		"generated",
		"generated",
		"podcast-card",
	])

	// a generated image is at the film's size, so it zooms less than a large Resource Image
	expect(images.map((image) => image.zoomLimit)).toEqual([2, 1.25, 1.25, 1.25, 1.25, 2])
})

test("a chapter with no Resource Image shows its generated image and the podcast card", async () => {
	stubChapterReads()
	const images = await prepareOneChapter(45)
	expect(renderOriginal).toHaveBeenCalledTimes(1)
	expect(await toImageKinds(images)).toEqual(["generated", "podcast-card"])
})

test("an unsafe Resource is never generated, and its chapter borrows the film's image", async () => {
	// the fetch reads the unsafe Resource, returns no image for it, and deletes any stored
	stubChapterReads()
	const images = await prepareOneChapter(300, true)
	expect(loadOrFetchImages).toHaveBeenCalledWith(["resource-0"], undefined)
	expect(renderOriginal).not.toHaveBeenCalled()
	expect(await toImageKinds(images)).toEqual(["podcast-card", "film-image"])
})

test("a limit of zero generates none, and a chapter with nothing else borrows the film's image", async () => {
	Bun.env.TOPIC_PODCAST_EPISODE_VIDEO_GENERATED_CHAPTER_IMAGE_LIMIT = "0"
	stubChapterReads()
	const images = await prepareOneChapter(300)
	expect(renderOriginal).not.toHaveBeenCalled()
	expect(await toImageKinds(images)).toEqual(["podcast-card", "film-image"])
})

test("a film that shows the podcast card as its image leaves a chapter with no other image on the podcast card alone", async () => {
	stubChapterReads()
	const { chapterImages, podcastCardImages } = await prepareChapterImages({
		...OWNER_BILLING,
		videoChapterRows: [toVideoChapterRow(0, true)],
		segments: [toChapterSegment(0, 60)],
		shownImageStill: PODCAST_CARD_IMAGE,
	})
	expect(await toImageKinds(chapterImages.get(0)?.images ?? [])).toEqual(["podcast-card"])
	expect(await toImageKinds(podcastCardImages)).toEqual(["podcast-card"])
})

test("a limit of 3 across three chapters gives each chapter one generated image", async () => {
	Bun.env.TOPIC_PODCAST_EPISODE_VIDEO_GENERATED_CHAPTER_IMAGE_LIMIT = "3"
	stubChapterReads()
	const { chapterImages, newlyGeneratedChapterImageCount } = await prepareChapterImages({
		...OWNER_BILLING,
		videoChapterRows: [0, 1, 2].map((position) => toVideoChapterRow(position)),
		segments: [0, 1, 2].map((position) => toChapterSegment(position, 90)),
		shownImageStill: FILM_IMAGE,
	})
	expect(newlyGeneratedChapterImageCount).toBe(3)
	for (const position of [0, 1, 2]) {
		expect(await toImageKinds(chapterImages.get(position)?.images ?? [])).toEqual(["generated", "podcast-card"])
	}
})

test("each chapter has its own lower third", async () => {
	stubChapterReads()
	const { chapterImages } = await prepareChapterImages({
		...OWNER_BILLING,
		videoChapterRows: [toVideoChapterRow(4)],
		segments: [toChapterSegment(4, 6)],
		shownImageStill: FILM_IMAGE,
	})
	expect(chapterImages.get(4)?.lowerThirdText).toEqual({ title: "Chapter 4", detail: "example.com" })
})

test("chapters that narrate one Resource share its images, so the intro shows the image once", async () => {
	// two chapters of one Resource that has one stored image
	stubChapterReads()
	storeResourceImages(0, 1)
	const videoChapterRows = [0, 1].map((position) => ({ ...toVideoChapterRow(position), resourceId: "resource-0" }))
	const { firstChapterImages } = await prepareChapterImages({
		...OWNER_BILLING,
		videoChapterRows,
		segments: [toChapterSegment(0, 20), toChapterSegment(1, 20)],
		shownImageStill: FILM_IMAGE,
	})

	// the Resource's image once, with the podcast card for a second image
	expect(await toImageKinds(firstChapterImages)).toEqual(["resource", "podcast-card"])
})

test("the intro and the sign-off cut through each chapter's first image once, with the podcast card for a second", () => {
	// three chapters, two of which open on the same image
	const toImage = (zoomLimit: number): VideoSegmentImage => ({ loadStillPng: async () => FILM_IMAGE_STILL, zoomLimit })
	const [firstImage, secondImage, podcastCardImage] = [toImage(1), toImage(2), toImage(3)]
	const toChapter = (images: VideoSegmentImage[]): VideoChapterImages => ({
		images,
		lowerThirdText: { title: "Chapter", detail: "" },
	})
	const chapterImages = new Map([
		[0, toChapter([firstImage, podcastCardImage])],
		[1, toChapter([secondImage, firstImage, podcastCardImage])],
		[2, toChapter([firstImage, podcastCardImage])],
	])
	expect(toFirstChapterImages({ chapterImages, podcastCardImage, isFilmImagePodcastCard: false })).toEqual([
		firstImage,
		secondImage,
	])

	// one image takes turns with the podcast card, unless the film already shows the podcast card
	const oneChapterImages = new Map([[0, toChapter([firstImage, podcastCardImage])]])
	expect(
		toFirstChapterImages({ chapterImages: oneChapterImages, podcastCardImage, isFilmImagePodcastCard: false }),
	).toEqual([firstImage, podcastCardImage])
	expect(
		toFirstChapterImages({ chapterImages: oneChapterImages, podcastCardImage, isFilmImagePodcastCard: true }),
	).toEqual([firstImage])
	const cardOnlyChapterImages = new Map([[0, toChapter([podcastCardImage])]])
	expect(
		toFirstChapterImages({ chapterImages: cardOnlyChapterImages, podcastCardImage, isFilmImagePodcastCard: true }),
	).toEqual([])
})

test("a failed image generation leaves the chapter on its other images, and is reported", async () => {
	stubChapterReads()
	storeResourceImages(0, 1)
	renderOriginal.mockRejectedValue(new TopicImageRenderFailure("rejected", "the image model rejected the scene"))
	const images = await prepareOneChapter(90)

	// the chapter shows what it has, and nothing is stored
	expect(await toImageKinds(images)).toEqual(["resource", "podcast-card"])
	expect(reportError).toHaveBeenCalled()
	expect(upload).not.toHaveBeenCalled()
})
