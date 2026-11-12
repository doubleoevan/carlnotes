// a film's own image, with the connection pool and the model calls stubbed: the wide crop, which image a film shows,
// the first image generation in the film house style, a film that already has its image, and a replaced image's rebuild
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as storage from "@carlnotes/db/store"
import * as litellm from "@carlnotes/models/litellm"
import sharp from "sharp"
import * as podcastEpisodeImageRenders from "../podcast/podcastEpisodeImageRenders"
import { toTestImageBytes } from "../resourceImages/resourceImageTestFixtures"
import * as temporalClient from "../temporalClient"
import * as topicImageOriginals from "../topicImages/renderTopicImageOriginal"
import { type TopicImageOriginal, toTopicImageHash, toTopicImageOriginal } from "../topicImages/topicImageFiles"
import * as topicImageScenes from "../topicImages/writeTopicImageScene"
import {
	generateTopicPodcastEpisodeVideoImage,
	replaceTopicPodcastEpisodeVideoImage,
	TOPIC_PODCAST_EPISODE_VIDEO_IMAGE_FORMAT,
} from "./topicPodcastEpisodeVideoImage"
import { loadShownImageStill, toShownImage } from "./topicPodcastEpisodeVideoInputs"
import * as videoFrames from "./videoFrames"

// an original at the film's frame size, and the key its hash names under the film's folder
const ORIGINAL: TopicImageOriginal = { jpegBytes: new Uint8Array([1, 2, 3]), width: 1280, height: 720 }
const ORIGINAL_HASH = toTopicImageHash(ORIGINAL.jpegBytes)
const ORIGINAL_KEY = `episodes/episode-1/video/image-${ORIGINAL_HASH}.jpg`

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// spy the scene's words, the owner's key, the scene writer, the image render, and the upload
function spyImageGeneration(): {
	writeScene: ReturnType<typeof spyOn>
	renderOriginal: ReturnType<typeof spyOn>
	upload: ReturnType<typeof spyOn>
} {
	spyOn(podcastEpisodeImageRenders, "loadPodcastEpisodeImageSceneInput").mockResolvedValue({
		topicName: "Agents that review code",
		topicPrompt: "",
		tags: [],
		findingTitles: [],
	})
	spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockResolvedValue("sk-owner")
	return {
		writeScene: spyOn(topicImageScenes, "writeTopicImageScene").mockResolvedValue("A harbor at dusk."),
		renderOriginal: spyOn(topicImageOriginals, "renderTopicImageOriginal").mockResolvedValue(ORIGINAL),
		upload: spyOn(storage, "uploadAttachment").mockResolvedValue(undefined),
	}
}

// answer the film read with a film that has no image yet and its podcast episode's owner, and the film row's write
// with the row it changed
function stubTopicPodcastEpisodeVideoWithoutImage(): SentQuery[] {
	return stubConnectionPool(({ text }) => {
		if (text.startsWith("select")) {
			return [[null, "owner-1"]]
		}
		return text.startsWith("update") ? [["film-1"]] : []
	})
}

// the film row's write, which sets the image
function toTopicPodcastEpisodeVideoRowUpdate(sentQueries: SentQuery[]): SentQuery | undefined {
	return sentQueries.find((sentQuery) => sentQuery.text.startsWith('update "topic_podcast_episode_videos"'))
}

test("an upload or a render is center-cropped to 16:9 at the film's frame size", async () => {
	// a tall image with a green band across its middle, between a red top and a blue bottom
	const toBandPng = (color: string): Promise<Buffer> =>
		sharp({ create: { width: 400, height: 300, channels: 3, background: color } })
			.png()
			.toBuffer()
	const tallPng = await sharp({ create: { width: 400, height: 900, channels: 3, background: "#ff0000" } })
		.composite([
			{ input: await toBandPng("#00ff00"), top: 300, left: 0 },
			{ input: await toBandPng("#0000ff"), top: 600, left: 0 },
		])
		.png()
		.toBuffer()

	// the original is the film's frame, as a jpeg
	const original = await toTopicImageOriginal(new Uint8Array(tallPng), TOPIC_PODCAST_EPISODE_VIDEO_IMAGE_FORMAT)
	expect([original.width, original.height]).toEqual([1280, 720])
	expect((await sharp(original.jpegBytes).metadata()).format).toBe("jpeg")

	// the crop kept the middle band alone, from the top row to the bottom row
	const { data, info } = await sharp(original.jpegBytes).raw().toBuffer({ resolveWithObject: true })
	const toPixel = (x: number, y: number): number[] => [
		...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3),
	]
	for (const [red, green, blue] of [toPixel(640, 2), toPixel(640, 360), toPixel(640, 717)]) {
		expect([(red ?? 0) < 60, (green ?? 0) > 200, (blue ?? 0) < 60]).toEqual([true, true, true])
	}
})

test("a film shows its own image, or else its podcast episode's, its topic's, or the podcast card", () => {
	const hashes = { podcastEpisodeId: "episode-1", topicId: "topic-1" }

	// the film's own image wins over the podcast episode's and the topic's
	const ownImage = toShownImage({
		...hashes,
		podcastEpisodeImageHash: "episode-hash",
		topicImageHash: "topic-hash",
		topicPodcastEpisodeVideoImageHash: "film-hash",
	})
	expect(ownImage).toEqual({
		imageHash: "film-hash",
		imageOriginalKey: "episodes/episode-1/video/image-film-hash.jpg",
		imageLargeOriginalKey: "episodes/episode-1/video/image-film-hash-original.jpg",
	})

	// a film with no image of its own shows the podcast episode's, then the topic's
	expect(toShownImage({ ...hashes, podcastEpisodeImageHash: "episode-hash", topicImageHash: "topic-hash" })).toEqual({
		imageHash: "episode-hash",
		imageOriginalKey: "podcast-episode-images/episode-1/episode-hash/original.jpg",
		imageLargeOriginalKey: null,
	})
	expect(
		toShownImage({
			...hashes,
			podcastEpisodeImageHash: null,
			topicImageHash: "topic-hash",
			topicPodcastEpisodeVideoImageHash: null,
		}),
	).toEqual({
		imageHash: "topic-hash",
		imageOriginalKey: "topic-images/topic-1/topic-hash/original.jpg",
		imageLargeOriginalKey: null,
	})

	// with no image anywhere, the podcast card has no stored original
	expect(toShownImage({ ...hashes, podcastEpisodeImageHash: null, topicImageHash: null }).imageOriginalKey).toBeNull()
})

test("a first image generation writes a wide scene, generates it in the film house style, and bills the owner", async () => {
	// a film with no image yet, whose podcast episode's owner pays
	const { writeScene, renderOriginal, upload } = spyImageGeneration()
	const sentQueries = stubTopicPodcastEpisodeVideoWithoutImage()
	expect(await generateTopicPodcastEpisodeVideoImage({ podcastEpisodeId: "episode-1" })).toBe(ORIGINAL_HASH)

	// the scene takes the film's framing on the owner's key, and the render is 16:9 at the 2K size on the model that
	// generates that size, with the larger original kept
	expect(writeScene.mock.calls[0]?.[0]).toMatchObject({ litellmApiKey: "sk-owner" })
	expect(writeScene.mock.calls[0]?.[0].framing).toContain("a wide establishing shot")
	expect(renderOriginal.mock.calls[0]?.[0]).toMatchObject({
		scene: "A harbor at dusk.",
		isHouseStyle: true,
		model: "gemini-3.1-flash-image",
		litellmApiKey: "sk-owner",
		format: {
			stylePromptName: "topic-podcast-episode-video-image-style",
			aspectRatio: "16:9",
			width: 1280,
			height: 720,
			drawSize: "2K",
			largeOriginalWidth: 2752,
			largeOriginalHeight: 1536,
		},
	})

	// the jpeg lands in the film's folder, and the row takes its hash, its origin, and the 2K image generation's cost
	expect(upload).toHaveBeenCalledWith(ORIGINAL_KEY, ORIGINAL.jpegBytes, "image/jpeg")
	const topicPodcastEpisodeVideoRowUpdate = toTopicPodcastEpisodeVideoRowUpdate(sentQueries)
	expect(topicPodcastEpisodeVideoRowUpdate?.values).toEqual(expect.arrayContaining([ORIGINAL_HASH, "generated"]))
	expect(topicPodcastEpisodeVideoRowUpdate?.values).toContain("0.101000")
})

test("a generated image with a larger original stores both files, and one without stores the jpeg alone", async () => {
	// an image generation whose original is larger than the film's frame
	const { renderOriginal, upload } = spyImageGeneration()
	const largeOriginalJpegBytes = new Uint8Array([9, 9, 9])
	renderOriginal.mockResolvedValue({ ...ORIGINAL, largeOriginalJpegBytes })
	stubTopicPodcastEpisodeVideoWithoutImage()
	await generateTopicPodcastEpisodeVideoImage({ podcastEpisodeId: "episode-1" })

	// the jpeg at the film's size names the image, and the larger original sits beside it
	const originalKey = `episodes/episode-1/video/image-${ORIGINAL_HASH}-original.jpg`
	expect(upload).toHaveBeenCalledWith(ORIGINAL_KEY, ORIGINAL.jpegBytes, "image/jpeg")
	expect(upload).toHaveBeenCalledWith(originalKey, largeOriginalJpegBytes, "image/jpeg")

	// an original with no larger jpeg, as an existing film's image has, stores one file
	upload.mockClear()
	renderOriginal.mockResolvedValue(ORIGINAL)
	await generateTopicPodcastEpisodeVideoImage({ podcastEpisodeId: "episode-1" })
	expect(upload).toHaveBeenCalledTimes(1)
})

test("a large render or upload keeps a larger original at the film's shape, and a small one keeps none", async () => {
	// a 3000 by 2000 image holds a 16:9 center of 3000 by 1688, so its larger original is the format's 2752 by 1536
	const toPng = (width: number, height: number): Promise<Uint8Array> =>
		toTestImageBytes({ width, height, picture: 1, format: "png" })
	const largeOriginal = await toTopicImageOriginal(await toPng(3000, 2000), TOPIC_PODCAST_EPISODE_VIDEO_IMAGE_FORMAT)
	const largeJpegMetadata = await sharp(largeOriginal.largeOriginalJpegBytes).metadata()
	expect([largeOriginal.width, largeOriginal.height]).toEqual([1280, 720])
	expect([largeJpegMetadata.width, largeJpegMetadata.height]).toEqual([2752, 1536])

	// an image between the two sizes is never enlarged, and one no larger than the frame keeps no larger original
	const middleOriginal = await toTopicImageOriginal(await toPng(1920, 1080), TOPIC_PODCAST_EPISODE_VIDEO_IMAGE_FORMAT)
	const middleJpegMetadata = await sharp(middleOriginal.largeOriginalJpegBytes).metadata()
	expect([middleJpegMetadata.width, middleJpegMetadata.height]).toEqual([1920, 1072])
	const smallOriginal = await toTopicImageOriginal(await toPng(1280, 720), TOPIC_PODCAST_EPISODE_VIDEO_IMAGE_FORMAT)
	expect(smallOriginal.largeOriginalJpegBytes).toBeUndefined()
})

test("a platform-billed image generation runs on the master key and costs the film nothing", async () => {
	// the backfill's image generation for a film with no image yet
	const { writeScene } = spyImageGeneration()
	const sentQueries = stubTopicPodcastEpisodeVideoWithoutImage()
	await generateTopicPodcastEpisodeVideoImage({ podcastEpisodeId: "episode-1", isPlatformBilled: true })
	expect(writeScene.mock.calls[0]?.[0].litellmApiKey).toBeUndefined()
	expect(toTopicPodcastEpisodeVideoRowUpdate(sentQueries)?.values).toContain("0.000000")
})

test("a film that has its image generates nothing", async () => {
	const { writeScene, renderOriginal } = spyImageGeneration()
	const sentQueries = stubConnectionPool(() => [["film-hash", "owner-1"]])
	expect(await generateTopicPodcastEpisodeVideoImage({ podcastEpisodeId: "episode-1" })).toBeNull()
	expect(writeScene).not.toHaveBeenCalled()
	expect(renderOriginal).not.toHaveBeenCalled()
	expect(toTopicPodcastEpisodeVideoRowUpdate(sentQueries)).toBeUndefined()
})

test("a replaced image stores the new file, schedules the old one for deletion, and starts the film's rebuild", async () => {
	// the film of episode-1, which shows the image hash-old on a private topic
	const upload = spyOn(storage, "uploadAttachment").mockResolvedValue(undefined)
	const pendingDeletions = spyOn(storage, "recordPendingObjectDeletions").mockResolvedValue(undefined)
	const rebuild = spyOn(temporalClient, "startTopicPodcastEpisodeVideoRebuild").mockResolvedValue(undefined)
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.startsWith('select "episode_id"')) {
			return [["episode-1"]]
		}

		// the image the new one replaces, with its topic
		return text.startsWith("select") ? [["hash-old", "topic-1", "private"]] : []
	})

	// an editor's upload replaces it
	const imageHash = await replaceTopicPodcastEpisodeVideoImage({
		topicPodcastEpisodeVideoId: "film-1",
		original: ORIGINAL,
		renderId: null,
		origin: "uploaded",
		imagePrompt: null,
		costDollars: 0,
	})
	expect(imageHash).toBe(ORIGINAL_HASH)
	expect(upload).toHaveBeenCalledWith(ORIGINAL_KEY, ORIGINAL.jpegBytes, "image/jpeg")

	// the row names the upload, the old file goes after the grace, and the intro and sign-off rebuild
	expect(toTopicPodcastEpisodeVideoRowUpdate(sentQueries)?.values).toEqual(
		expect.arrayContaining([ORIGINAL_HASH, "uploaded"]),
	)
	expect(pendingDeletions.mock.calls[0]?.[0].objectKeys).toEqual([
		"episodes/episode-1/video/image-hash-old.jpg",
		"episodes/episode-1/video/image-hash-old-original.jpg",
	])
	expect(rebuild).toHaveBeenCalledWith("episode-1")
})

test("a regenerated or uploaded image with a larger original stores both files", async () => {
	// the film of episode-1, which had no image of its own
	const upload = spyOn(storage, "uploadAttachment").mockResolvedValue(undefined)
	spyOn(temporalClient, "startTopicPodcastEpisodeVideoRebuild").mockResolvedValue(undefined)
	stubConnectionPool(({ text }) => {
		if (text.startsWith('select "episode_id"')) {
			return [["episode-1"]]
		}
		return text.startsWith("select") ? [[null, "topic-1", "private"]] : []
	})

	// an editor's regenerate, generated at the larger size
	const largeOriginalJpegBytes = new Uint8Array([9, 9, 9])
	await replaceTopicPodcastEpisodeVideoImage({
		topicPodcastEpisodeVideoId: "film-1",
		original: { ...ORIGINAL, largeOriginalJpegBytes },
		renderId: null,
		origin: "generated",
		imagePrompt: "a foggy morning over a bridge",
		costDollars: 0.101,
	})
	const originalKey = `episodes/episode-1/video/image-${ORIGINAL_HASH}-original.jpg`
	expect(upload.mock.calls.map((uploadCall) => uploadCall[0])).toEqual([ORIGINAL_KEY, originalKey])
})

test("the intro's still comes from the larger original, or from the film-size jpeg of an existing film", async () => {
	// storage holds the larger original of image-new, and only the film-size jpeg of image-old
	const largeOriginalJpeg = await toTestImageBytes({ width: 2752, height: 1536, picture: 1 })
	const filmSizeJpeg = await toTestImageBytes({ width: 1280, height: 720, picture: 1 })
	const readKeys: string[] = []
	spyOn(storage, "getAttachmentBytes").mockImplementation(async (objectKey: string) => {
		// record each read, then answer by the key
		readKeys.push(objectKey)
		if (objectKey === "image-new-original.jpg") {
			return new Uint8Array(largeOriginalJpeg)
		}
		if (objectKey.endsWith("-original.jpg")) {
			throw new Error("no such object")
		}

		// any other key is a film-size jpeg
		return new Uint8Array(filmSizeJpeg)
	})
	spyOn(videoFrames, "toVideoStillPng").mockImplementation(async (imageBytes: Uint8Array) => imageBytes)
	spyOn(videoFrames, "loadPodcastCardStillPng").mockResolvedValue(new Uint8Array([9]))

	// a new film zooms into its larger original, which holds a zoom to 2
	const newImageKeys = { imageOriginalKey: "image-new.jpg", imageLargeOriginalKey: "image-new-original.jpg" }
	expect(await loadShownImageStill(newImageKeys)).toMatchObject({ zoomLimit: 2, isPodcastCard: false })
	expect(readKeys).toEqual(["image-new-original.jpg"])

	// an existing film has no larger original, so its film-size jpeg is the still
	const oldImageKeys = { imageOriginalKey: "image-old.jpg", imageLargeOriginalKey: "image-old-original.jpg" }
	expect(await loadShownImageStill(oldImageKeys)).toMatchObject({ zoomLimit: 1.25, isPodcastCard: false })

	// a film with no image shows the podcast card
	const noImageKeys = { imageOriginalKey: null, imageLargeOriginalKey: null }
	expect(await loadShownImageStill(noImageKeys)).toMatchObject({ zoomLimit: 2, isPodcastCard: true })
})
