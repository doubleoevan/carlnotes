// a film's chapter images, with the connection pool, storage, the Resource Image fetch, and the model calls stubbed:
// how many generated images a chapter lacks, which ones a film draws within its limit, each chapter's images in order,
// what reaches the scene writer, each failure that leaves a chapter on the images it has, the stored image a second
// attempt reuses, and who pays
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as monthlyBudgetCutoffs from "@carlnotes/db/monthlyBudgetCutoffs"
import * as storage from "@carlnotes/db/store"
import * as litellm from "@carlnotes/models/litellm"
import * as moderation from "@carlnotes/models/moderation"
import * as monitoring from "@carlnotes/server/monitoring"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import type { ResourceImage } from "../resourceImages/fetchResourceImages"
import * as resourceImageFetch from "../resourceImages/fetchResourceImages"
import * as topicImageOriginals from "../topicImages/renderTopicImageOriginal"
import { TopicImageRenderFailure } from "../topicImages/renderTopicImageOriginal"
import type { TopicImageOriginal } from "../topicImages/topicImageFiles"
import * as topicImageScenes from "../topicImages/writeTopicImageScene"
import { loadGeneratedChapterImages } from "./generatedChapterImages"
import type { VideoChapterRow } from "./topicPodcastEpisodeVideoInputs"
import {
	prepareChapterImages,
	toGeneratedChapterImageRefs,
	toMissingGeneratedChapterImageCount,
} from "./videoChapterImages"
import * as videoFrames from "./videoFrames"
import type { VideoSegmentImage } from "./videoParts"
import { VIDEO_FRAMES_PER_SECOND, type VideoSegment } from "./videoTimeline"

// the stills the stubs return, each a marker the tests tell apart: the podcast card's and the film's own image's
const PODCAST_CARD_STILL = new Uint8Array([9])
const FILM_IMAGE_STILL = new Uint8Array([7])

// a drawn original, and the jpeg an earlier render stored
const ORIGINAL: TopicImageOriginal = { jpegBytes: new Uint8Array([1, 2, 3]), width: 1280, height: 720 }
const STORED_JPEG = new Uint8Array([4, 5, 6])

// the film's podcast episode and its owner, who pays
const OWNER_BILLING = { podcastEpisodeId: "episode-1", ownerId: "owner-1", isPlatformBilled: false }

// the film's own image, which a segment with nothing else borrows
const FILM_IMAGE: VideoSegmentImage = { loadStillPng: async () => FILM_IMAGE_STILL, zoomLimit: 2 }

// the setting the tests change
const restoreEnvSettings = saveEnvSettings(["TOPIC_PODCAST_EPISODE_VIDEO_GENERATED_CHAPTER_IMAGE_LIMIT"])

// the spies every test reads
let loadOrFetchImages: ReturnType<typeof spyOn>
let writeScene: ReturnType<typeof spyOn>
let renderOriginal: ReturnType<typeof spyOn>
let classifyImage: ReturnType<typeof spyOn>
let attachmentExists: ReturnType<typeof spyOn>
let upload: ReturnType<typeof spyOn>

// the owner's key, the error reports, and the owner's spend cutoff, which the draws never read
let provisionKey: ReturnType<typeof spyOn>
let reportError: ReturnType<typeof spyOn>
let isCutoffPassed: ReturnType<typeof spyOn>

// each Resource's stored images, which a test sets before it prepares
let resourceImagesById = new Map<string, ResourceImage[]>()

// a draw that succeeds on the owner's key, an image the moderation passes, and nothing stored yet
beforeEach(() => {
	resourceImagesById = new Map()
	loadOrFetchImages = spyOn(resourceImageFetch, "loadOrFetchResourceImages").mockImplementation(
		async () => resourceImagesById,
	)
	writeScene = spyOn(topicImageScenes, "writeTopicImageScene").mockResolvedValue("A harbor at dusk.")
	renderOriginal = spyOn(topicImageOriginals, "renderTopicImageOriginal").mockResolvedValue(ORIGINAL)
	classifyImage = spyOn(moderation, "classifyImage").mockResolvedValue({
		outcome: "classified",
		verdict: { isViolation: false, category: null },
	})

	// storage that holds nothing yet, and reads a Resource Image's key back as its bytes
	attachmentExists = spyOn(storage, "attachmentExists").mockResolvedValue(false)
	upload = spyOn(storage, "uploadAttachment").mockResolvedValue(undefined)
	spyOn(storage, "getAttachmentBytes").mockImplementation(async (objectKey: string) =>
		objectKey.startsWith("resources/") ? new TextEncoder().encode(objectKey) : STORED_JPEG,
	)
	provisionKey = spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockResolvedValue("sk-owner")
	reportError = spyOn(monitoring, "reportError").mockImplementation(() => {})

	// an owner within the spend cutoff
	isCutoffPassed = spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(false)

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

// answer the chapters' read with a row for each position the query names: the chapter's title, its Resource's title,
// and its Finding's public relevance explanation
function stubChapterReads(): SentQuery[] {
	return stubConnectionPool(({ text, values }) => {
		if (!text.startsWith("select")) {
			return []
		}
		const positions = values.filter((value): value is number => typeof value === "number")
		return positions.map((position) => [
			position,
			`Chapter ${position}`,
			`Finding ${position}`,
			`Why ${position} matters`,
		])
	})
}

// the film row's writes that add a draw's cost
function toCostUpdates(sentQueries: SentQuery[]): SentQuery[] {
	return sentQueries.filter((sentQuery) => sentQuery.text.startsWith('update "topic_podcast_episode_videos"'))
}

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
		filmImage: FILM_IMAGE,
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

	// a limit with room draws the second round too, and a limit of zero draws none
	expect(toGeneratedChapterImageRefs(missingGeneratedChapterImageCounts, 40)).toHaveLength(6)
	expect(toGeneratedChapterImageRefs(missingGeneratedChapterImageCounts, 0)).toEqual([])
})

test("a chapter with enough Resource Images draws none, and shows them before the podcast card", async () => {
	stubChapterReads()
	storeResourceImages(0, 3)
	const images = await prepareOneChapter(120)

	// the three stored images, then the podcast card, with nothing drawn
	expect(await toImageKinds(images)).toEqual(["resource", "resource", "resource", "podcast-card"])
	expect(images.map((image) => image.zoomLimit)).toEqual([2, 2, 2, 2])
	expect(renderOriginal).not.toHaveBeenCalled()
	expect(loadOrFetchImages).toHaveBeenCalledWith(["resource-0"], undefined)
})

test("a long chapter with one Resource Image draws the difference", async () => {
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

test("a limit of zero draws none, and a chapter with nothing else borrows the film's image", async () => {
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
		filmImage: null,
	})
	expect(await toImageKinds(chapterImages.get(0)?.images ?? [])).toEqual(["podcast-card"])
	expect(await toImageKinds(podcastCardImages)).toEqual(["podcast-card"])
})

test("a limit of 3 across three chapters gives each chapter one generated image", async () => {
	Bun.env.TOPIC_PODCAST_EPISODE_VIDEO_GENERATED_CHAPTER_IMAGE_LIMIT = "3"
	stubChapterReads()
	const { chapterImages, drawnGeneratedChapterImageCount } = await prepareChapterImages({
		...OWNER_BILLING,
		videoChapterRows: [0, 1, 2].map((position) => toVideoChapterRow(position)),
		segments: [0, 1, 2].map((position) => toChapterSegment(position, 90)),
		filmImage: FILM_IMAGE,
	})
	expect(drawnGeneratedChapterImageCount).toBe(3)
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
		filmImage: FILM_IMAGE,
	})
	expect(chapterImages.get(4)?.lowerThirdText).toEqual({ title: "Chapter 4", detail: "example.com" })
})

test("only the Finding's title and public relevance explanation reach the scene writer", async () => {
	const sentQueries = stubChapterReads()
	const generatedChapterImageRefs = [{ position: 2, imageNumber: 0 }]
	const generatedChapterImages = await loadGeneratedChapterImages({ ...OWNER_BILLING, generatedChapterImageRefs })
	expect(generatedChapterImages.jpegBytesByPosition.get(2)).toEqual([ORIGINAL.jpegBytes])

	// the scene is written from the two public fields in the film's framing, on the owner's key
	const [sceneInput] = writeScene.mock.calls[0] ?? []
	expect(sceneInput).toEqual({
		topicName: "Finding 2",
		topicPrompt: "Why 2 matters",
		tags: [],
		findingTitles: [],
		framing: expect.stringContaining("a wide establishing shot"),
		litellmApiKey: "sk-owner",
	})

	// the image is drawn in the film house style at the film's size, on the same key
	expect(renderOriginal.mock.calls[0]?.[0]).toMatchObject({
		scene: "A harbor at dusk.",
		isHouseStyle: true,
		litellmApiKey: "sk-owner",
		format: { stylePromptName: "topic-podcast-episode-video-image-style", aspectRatio: "16:9" },
	})

	// the one read joins the chapter to its Resource and its Finding, and no private annotation or Personal sources table
	const [chapterRead] = sentQueries.filter((sentQuery) => sentQuery.text.startsWith("select"))
	expect(chapterRead?.text).toContain('"findings"."relevance_explanation"')
	expect(chapterRead?.text).toContain('"resources"."title"')
	expect(sentQueries.some((sentQuery) => /annotation|personal_source|comments|notes/.test(sentQuery.text))).toBe(false)
})

test("a chapter's second generated image takes another framing, from the same public words", async () => {
	stubChapterReads()
	const generatedChapterImageRefs = [0, 1, 2].map((imageNumber) => ({ position: 2, imageNumber }))
	await loadGeneratedChapterImages({ ...OWNER_BILLING, generatedChapterImageRefs })

	// three draws, each in a framing of its own
	const sceneInputs = writeScene.mock.calls.map(([sceneInput]: [{ framing: string; topicName: string }]) => sceneInput)
	const framings = sceneInputs.map((sceneInput: { framing: string }) => sceneInput.framing)
	expect(new Set(framings).size).toBe(3)
	expect(framings.some((framing: string) => framing.includes("a close view of one telling detail"))).toBe(true)

	// every scene reads the same title and explanation, and nothing else
	for (const sceneInput of sceneInputs) {
		expect(sceneInput).toMatchObject({
			topicName: "Finding 2",
			topicPrompt: "Why 2 matters",
			tags: [],
			findingTitles: [],
		})
	}
})

test("a drawn image is checked, stored under its chapter's numbered key, and billed to the film", async () => {
	const sentQueries = stubChapterReads()
	const generatedChapterImageRefs = [
		{ position: 3, imageNumber: 0 },
		{ position: 3, imageNumber: 1 },
	]
	const generatedChapterImages = await loadGeneratedChapterImages({ ...OWNER_BILLING, generatedChapterImageRefs })
	expect(generatedChapterImages.drawnGeneratedChapterImageCount).toBe(2)

	// the moderation reads the jpeg as a data url, and the first jpeg keeps the key the api serves
	expect(classifyImage.mock.calls[0]?.[0].dataUrl).toStartWith("data:image/jpeg;base64,")
	const uploadedKeys = upload.mock.calls.map(([objectKey]: [string]) => objectKey).toSorted()
	expect(uploadedKeys).toEqual([
		"episodes/episode-1/video/chapter-3-image-1.jpg",
		"episodes/episode-1/video/chapter-3-image.jpg",
	])

	// the film row takes each draw's cost
	const costUpdates = toCostUpdates(sentQueries)
	expect(costUpdates).toHaveLength(2)
	expect(costUpdates[0]?.text).toContain('"cost" = "topic_podcast_episode_videos"."cost" + $1')
	expect(Number(costUpdates[0]?.values[0])).toBeGreaterThan(0)
	expect(costUpdates[0]?.values).toContain("episode-1")
})

test("a second attempt reuses the stored image and draws nothing", async () => {
	attachmentExists.mockResolvedValue(true)
	const sentQueries = stubChapterReads()
	const generatedChapterImageRefs = [{ position: 1, imageNumber: 0 }]
	const generatedChapterImages = await loadGeneratedChapterImages({ ...OWNER_BILLING, generatedChapterImageRefs })
	expect(generatedChapterImages.jpegBytesByPosition.get(1)).toEqual([STORED_JPEG])

	// nothing is drawn or billed
	expect(generatedChapterImages.drawnGeneratedChapterImageCount).toBe(0)
	expect(renderOriginal).not.toHaveBeenCalled()
	expect(toCostUpdates(sentQueries)).toEqual([])
})

test("the platform's draws use the master key and add no cost to the film", async () => {
	const sentQueries = stubChapterReads()
	const generatedChapterImageRefs = [{ position: 1, imageNumber: 0 }]
	const generatedChapterImages = await loadGeneratedChapterImages({
		...OWNER_BILLING,
		isPlatformBilled: true,
		generatedChapterImageRefs,
	})
	expect(generatedChapterImages.drawnGeneratedChapterImageCount).toBe(1)
	expect(provisionKey).not.toHaveBeenCalled()
	expect(renderOriginal.mock.calls[0]?.[0].litellmApiKey).toBeUndefined()
	expect(toCostUpdates(sentQueries)).toEqual([])
})

test("an owner past the spend cutoff still draws every image", async () => {
	// the owner is past the cutoff before the draws start
	stubChapterReads()
	isCutoffPassed.mockResolvedValue(true)
	const generatedChapterImageRefs = [
		{ position: 1, imageNumber: 0 },
		{ position: 1, imageNumber: 1 },
		{ position: 1, imageNumber: 2 },
	]

	// every image is drawn, and the owner's spend is never read
	const ownerImages = await loadGeneratedChapterImages({ ...OWNER_BILLING, generatedChapterImageRefs })
	expect(ownerImages.drawnGeneratedChapterImageCount).toBe(3)
	expect(renderOriginal).toHaveBeenCalledTimes(3)
	expect(isCutoffPassed).not.toHaveBeenCalled()
})

test("a stopped render draws nothing more and throws an error", async () => {
	// the signal is aborted before the draws start
	stubChapterReads()
	const stoppedRender = new AbortController()
	stoppedRender.abort(new Error("the render was stopped"))
	const generatedChapterImageRefs = [{ position: 1, imageNumber: 0 }]
	const stoppedDraws = loadGeneratedChapterImages({
		...OWNER_BILLING,
		signal: stoppedRender.signal,
		generatedChapterImageRefs,
	})
	await expect(stoppedDraws).rejects.toThrow("the render was stopped")
	expect(renderOriginal).not.toHaveBeenCalled()
	expect(reportError).not.toHaveBeenCalled()
})

test("a failed draw leaves the chapter on its other images, and is reported", async () => {
	stubChapterReads()
	storeResourceImages(0, 1)
	renderOriginal.mockRejectedValue(new TopicImageRenderFailure("rejected", "the image model rejected the scene"))
	const images = await prepareOneChapter(90)

	// the chapter shows what it has, and nothing is stored
	expect(await toImageKinds(images)).toEqual(["resource", "podcast-card"])
	expect(reportError).toHaveBeenCalled()
	expect(upload).not.toHaveBeenCalled()
})

test("an image the moderation flags is billed, not stored, and not shown", async () => {
	classifyImage.mockResolvedValue({ outcome: "classified", verdict: { isViolation: true, category: "violence" } })
	const sentQueries = stubChapterReads()
	const generatedChapterImageRefs = [{ position: 1, imageNumber: 0 }]
	const generatedChapterImages = await loadGeneratedChapterImages({ ...OWNER_BILLING, generatedChapterImageRefs })

	// the draw is billed, and its image is not stored or shown
	expect(generatedChapterImages.jpegBytesByPosition.size).toBe(0)
	expect(upload).not.toHaveBeenCalled()
	expect(toCostUpdates(sentQueries)).toHaveLength(1)
})

test("a skipped moderation check lets the image through", async () => {
	classifyImage.mockResolvedValue({ outcome: "skipped" })
	stubChapterReads()
	const generatedChapterImageRefs = [{ position: 1, imageNumber: 0 }]
	const generatedChapterImages = await loadGeneratedChapterImages({ ...OWNER_BILLING, generatedChapterImageRefs })

	// the image is stored and shown
	expect(generatedChapterImages.jpegBytesByPosition.get(1)).toEqual([ORIGINAL.jpegBytes])
	expect(upload).toHaveBeenCalledTimes(1)
})
