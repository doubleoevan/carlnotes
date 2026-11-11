// a film's own image, with the connection pool and the model calls stubbed: the wide crop, which image a film shows,
// the first draw in the film house style, a film that already has its image, and a replaced image's rebuild
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as storage from "@carlnotes/db/store"
import * as litellm from "@carlnotes/models/litellm"
import sharp from "sharp"
import * as podcastEpisodeImageRenders from "../podcast/podcastEpisodeImageRenders"
import * as temporalClient from "../temporalClient"
import * as topicImageOriginals from "../topicImages/renderTopicImageOriginal"
import { type TopicImageOriginal, toTopicImageHash, toTopicImageOriginal } from "../topicImages/topicImageFiles"
import * as topicImageScenes from "../topicImages/writeTopicImageScene"
import {
	drawTopicPodcastEpisodeVideoImage,
	replaceTopicPodcastEpisodeVideoImage,
	TOPIC_PODCAST_EPISODE_VIDEO_IMAGE_FORMAT,
} from "./topicPodcastEpisodeVideoImage"
import { toShownImage } from "./topicPodcastEpisodeVideoInputs"

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
function spyImageDraw(): {
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
	expect(ownImage).toEqual({ imageHash: "film-hash", imageOriginalKey: "episodes/episode-1/video/image-film-hash.jpg" })

	// a film with no image of its own shows the podcast episode's, then the topic's
	expect(toShownImage({ ...hashes, podcastEpisodeImageHash: "episode-hash", topicImageHash: "topic-hash" })).toEqual({
		imageHash: "episode-hash",
		imageOriginalKey: "podcast-episode-images/episode-1/episode-hash/original.jpg",
	})
	expect(
		toShownImage({
			...hashes,
			podcastEpisodeImageHash: null,
			topicImageHash: "topic-hash",
			topicPodcastEpisodeVideoImageHash: null,
		}),
	).toEqual({ imageHash: "topic-hash", imageOriginalKey: "topic-images/topic-1/topic-hash/original.jpg" })

	// with no image anywhere, the podcast card has no stored original
	expect(toShownImage({ ...hashes, podcastEpisodeImageHash: null, topicImageHash: null }).imageOriginalKey).toBeNull()
})

test("a first draw writes a wide scene, draws it in the film house style, and bills the owner", async () => {
	// a film with no image yet, whose podcast episode's owner pays
	const { writeScene, renderOriginal, upload } = spyImageDraw()
	const sentQueries = stubTopicPodcastEpisodeVideoWithoutImage()
	expect(await drawTopicPodcastEpisodeVideoImage({ podcastEpisodeId: "episode-1" })).toBe(ORIGINAL_HASH)

	// the scene takes the film's framing on the owner's key, and the render is 16:9 at the film's size
	expect(writeScene.mock.calls[0]?.[0]).toMatchObject({ litellmApiKey: "sk-owner" })
	expect(writeScene.mock.calls[0]?.[0].framing).toContain("a wide establishing shot")
	expect(renderOriginal.mock.calls[0]?.[0]).toMatchObject({
		scene: "A harbor at dusk.",
		isHouseStyle: true,
		litellmApiKey: "sk-owner",
		format: {
			stylePromptName: "topic-podcast-episode-video-image-style",
			aspectRatio: "16:9",
			width: 1280,
			height: 720,
		},
	})

	// the jpeg lands in the film's folder, and the row takes its hash, its origin, and the image's cost
	expect(upload).toHaveBeenCalledWith(ORIGINAL_KEY, ORIGINAL.jpegBytes, "image/jpeg")
	const topicPodcastEpisodeVideoRowUpdate = toTopicPodcastEpisodeVideoRowUpdate(sentQueries)
	expect(topicPodcastEpisodeVideoRowUpdate?.values).toEqual(expect.arrayContaining([ORIGINAL_HASH, "generated"]))
	expect(topicPodcastEpisodeVideoRowUpdate?.values).not.toContain("0.000000")
})

test("a platform-billed draw runs on the master key and costs the film nothing", async () => {
	// the backfill's draw of a film with no image yet
	const { writeScene } = spyImageDraw()
	const sentQueries = stubTopicPodcastEpisodeVideoWithoutImage()
	await drawTopicPodcastEpisodeVideoImage({ podcastEpisodeId: "episode-1", isPlatformBilled: true })
	expect(writeScene.mock.calls[0]?.[0].litellmApiKey).toBeUndefined()
	expect(toTopicPodcastEpisodeVideoRowUpdate(sentQueries)?.values).toContain("0.000000")
})

test("a film that has its image draws nothing", async () => {
	const { writeScene, renderOriginal } = spyImageDraw()
	const sentQueries = stubConnectionPool(() => [["film-hash", "owner-1"]])
	expect(await drawTopicPodcastEpisodeVideoImage({ podcastEpisodeId: "episode-1" })).toBeNull()
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
	expect(pendingDeletions.mock.calls[0]?.[0]).toMatchObject({
		objectKeys: ["episodes/episode-1/video/image-hash-old.jpg"],
	})
	expect(rebuild).toHaveBeenCalledWith("episode-1")
})
