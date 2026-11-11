// a film's chapter stills, with the connection pool, storage, and the model calls stubbed: which chapters get an
// imagined image, what reaches the scene writer, each failure that leaves the podcast card, the stored image a second
// attempt reuses, who pays, and the settled still's file deleted once its frame is loaded
import { afterAll, afterEach, beforeAll, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as storage from "@carlnotes/db/store"
import * as litellm from "@carlnotes/models/litellm"
import type { ModerationClassification } from "@carlnotes/models/moderation"
import * as moderation from "@carlnotes/models/moderation"
import * as monitoring from "@carlnotes/server/monitoring"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import * as topicImageOriginals from "../topicImages/renderTopicImageOriginal"
import { TopicImageRenderFailure } from "../topicImages/renderTopicImageOriginal"
import type { TopicImageOriginal } from "../topicImages/topicImageFiles"
import * as topicImageScenes from "../topicImages/writeTopicImageScene"
import type { VideoChapterRow } from "./topicPodcastEpisodeVideoInputs"
import * as topicPodcastEpisodeVideoInputs from "./topicPodcastEpisodeVideoInputs"
import { loadImaginedChapterStillPngs, prepareChapterFrames } from "./videoChapterStills"
import * as videoFrames from "./videoFrames"
import type { VideoChapterFrame } from "./videoParts"
import { VIDEO_FRAMES_PER_SECOND, type VideoSegment } from "./videoTimeline"

// the stills the stubs return: a link preview's, the podcast card's, and an imagined image's
const LINK_PREVIEW_STILL = new Uint8Array([1])
const PODCAST_CARD_STILL = new Uint8Array([9])
const IMAGINED_STILL = new Uint8Array([5])

// a drawn original, and the jpeg a render's earlier attempt stored
const ORIGINAL: TopicImageOriginal = { jpegBytes: new Uint8Array([1, 2, 3]), width: 1280, height: 720 }
const STORED_JPEG = new Uint8Array([4, 5, 6])

// the film's podcast episode and its owner, who pays
const OWNER_BILLING = { podcastEpisodeId: "episode-1", ownerId: "owner-1", isPlatformBilled: false }

// the settings the tests change, and the folder the stills are written to
const restoreEnvSettings = saveEnvSettings([
	"TOPIC_PODCAST_EPISODE_VIDEO_IMAGINED_CHAPTER_IMAGE_MINIMUM_SECONDS",
	"TOPIC_PODCAST_EPISODE_VIDEO_IMAGINED_CHAPTER_IMAGE_LIMIT",
])
let workDirectory = ""
beforeAll(async () => {
	workDirectory = await mkdtemp(join(tmpdir(), "chapter-stills-test-"))
})
afterAll(async () => {
	await rm(workDirectory, { recursive: true, force: true })
})

// the spies every test reads
let writeScene: ReturnType<typeof spyOn>
let renderOriginal: ReturnType<typeof spyOn>
let classifyImage: ReturnType<typeof spyOn>
let attachmentExists: ReturnType<typeof spyOn>
let upload: ReturnType<typeof spyOn>
let provisionKey: ReturnType<typeof spyOn>
let reportError: ReturnType<typeof spyOn>

// a draw that succeeds on the owner's key, an image the moderation passes, and nothing stored yet
beforeEach(() => {
	writeScene = spyOn(topicImageScenes, "writeTopicImageScene").mockResolvedValue("A harbor at dusk.")
	renderOriginal = spyOn(topicImageOriginals, "renderTopicImageOriginal").mockResolvedValue(ORIGINAL)
	classifyImage = spyOn(moderation, "classifyImage").mockResolvedValue({
		outcome: "classified",
		verdict: { isViolation: false, category: null },
	})
	attachmentExists = spyOn(storage, "attachmentExists").mockResolvedValue(false)
	upload = spyOn(storage, "uploadAttachment").mockResolvedValue(undefined)
	provisionKey = spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockResolvedValue("sk-owner")
	reportError = spyOn(monitoring, "reportError").mockImplementation(() => {})

	// the stills, each a marker the tests tell apart
	spyOn(videoFrames, "toVideoStillPng").mockResolvedValue(IMAGINED_STILL)
	spyOn(videoFrames, "loadPodcastCardStillPng").mockResolvedValue(PODCAST_CARD_STILL)
})

// put the pool, every spy, and the settings back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
	restoreEnvSettings()
})

// answer the picked chapters' read with a row for each position the query names: the chapter's title, its Resource's
// title, and its Finding's public relevance explanation
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

// the film row's write that adds a draw's cost
function toCostUpdates(sentQueries: SentQuery[]): SentQuery[] {
	return sentQueries.filter((sentQuery) => sentQuery.text.startsWith('update "topic_podcast_episode_videos"'))
}

// a chapter row at a position, safe unless said otherwise
function toVideoChapterRow(position: number, isUnsafe = false): VideoChapterRow {
	return {
		position,
		title: `Chapter ${position}`,
		sourceUrl: `https://example.com/${position}`,
		startSeconds: 0,
		endSeconds: 0,
		isUnsafe,
	}
}

// a chapter's segment that runs a number of seconds
function toChapterSegment(position: number, seconds: number): VideoSegment {
	return { kind: "chapter", position, startSeconds: 0, frameCount: seconds * VIDEO_FRAMES_PER_SECOND }
}

// the names of the long chapters' settled stills in the work folder, in order
async function toLongChapterStillNames(): Promise<string[]> {
	const fileNames = await readdir(workDirectory)
	return fileNames.filter((fileName) => fileName.startsWith("long-chapter-")).toSorted()
}

test("the longest chapters with no link preview image get an imagined image, up to the limit", async () => {
	// two images at most. chapters 1 and 3 have a link preview image, chapter 2 is unsafe, and chapter 3 runs under 90
	// seconds
	Bun.env.TOPIC_PODCAST_EPISODE_VIDEO_IMAGINED_CHAPTER_IMAGE_LIMIT = "2"
	const linkPreviewStill = spyOn(topicPodcastEpisodeVideoInputs, "loadChapterLinkPreviewStillPng").mockImplementation(
		async (videoChapterRow) => ([1, 3].includes(videoChapterRow.position) ? LINK_PREVIEW_STILL : null),
	)
	stubChapterReads()

	// six chapters, of which 4, 0, and 5 are long, safe, and have no link preview image, longest first
	const loadChapterFrame = await prepareChapterFrames({
		...OWNER_BILLING,
		videoChapterRows: [0, 1, 3, 4, 5].map((position) => toVideoChapterRow(position)).concat(toVideoChapterRow(2, true)),
		segments: [
			toChapterSegment(0, 150),
			toChapterSegment(1, 100),
			toChapterSegment(2, 300),
			toChapterSegment(3, 89),
			toChapterSegment(4, 200),
			toChapterSegment(5, 120),
		],
		workDirectory,
	})

	// only a long chapter with a safe Resource is asked for its link preview image, and the two longest are drawn
	const askedPositions = linkPreviewStill.mock.calls.map(([videoChapterRow]) => videoChapterRow.position)
	expect(askedPositions.toSorted()).toEqual([0, 1, 4, 5])
	expect(upload.mock.calls.map((uploadCall: unknown[]) => String(uploadCall[0])).toSorted()).toEqual([
		"episodes/episode-1/video/chapter-0-image.jpg",
		"episodes/episode-1/video/chapter-4-image.jpg",
	])

	// the three long chapters with a still have it settled in the work folder, and each chapter's frame loads once
	expect(await toLongChapterStillNames()).toEqual([
		"long-chapter-0-still.png",
		"long-chapter-1-still.png",
		"long-chapter-4-still.png",
	])
	const chapterFrames: VideoChapterFrame[] = []
	for (const position of [0, 1, 2, 3, 4, 5]) {
		chapterFrames.push(await loadChapterFrame(position))
	}

	// the picked chapters show their imagined image, and the long chapter past the limit shows the podcast card
	expect(chapterFrames[0]?.stillPng).toEqual(IMAGINED_STILL)
	expect(chapterFrames[4]?.stillPng).toEqual(IMAGINED_STILL)
	expect(chapterFrames[5]?.stillPng).toEqual(PODCAST_CARD_STILL)

	// a link preview image stays, a short chapter loads its own, and one with none shows the podcast card
	expect(chapterFrames[1]?.stillPng).toEqual(LINK_PREVIEW_STILL)
	expect(chapterFrames[2]?.stillPng).toEqual(PODCAST_CARD_STILL)
	expect(chapterFrames[3]).toEqual({
		stillPng: LINK_PREVIEW_STILL,
		isLinkPreviewImage: true,
		lowerThirdText: { title: "Chapter 3", detail: "example.com" },
	})

	// only a link preview image is marked as one, which is the still that slides in
	const linkPreviewPositions = [0, 1, 2, 3, 4, 5].filter((position) => chapterFrames[position]?.isLinkPreviewImage)
	expect(linkPreviewPositions).toEqual([1, 3])

	// a settled still's file is deleted once its chapter's frame is loaded
	expect(await toLongChapterStillNames()).toEqual([])
})

test("a chapter that runs the minimum seconds is long, and a limit of zero turns imagined images off", async () => {
	// a chapter of exactly the minimum gets an image
	Bun.env.TOPIC_PODCAST_EPISODE_VIDEO_IMAGINED_CHAPTER_IMAGE_MINIMUM_SECONDS = "30"
	const linkPreviewStill = spyOn(topicPodcastEpisodeVideoInputs, "loadChapterLinkPreviewStillPng").mockResolvedValue(
		null,
	)
	stubChapterReads()
	const chapters = { videoChapterRows: [toVideoChapterRow(0)], segments: [toChapterSegment(0, 30)], workDirectory }
	const loadChapterFrame = await prepareChapterFrames({ ...OWNER_BILLING, ...chapters })
	expect((await loadChapterFrame(0)).stillPng).toEqual(IMAGINED_STILL)
	expect(renderOriginal).toHaveBeenCalledTimes(1)

	// at a limit of zero nothing is asked or drawn before the chapters are encoded
	Bun.env.TOPIC_PODCAST_EPISODE_VIDEO_IMAGINED_CHAPTER_IMAGE_LIMIT = "0"
	linkPreviewStill.mockClear()
	const loadUnimaginedChapterFrame = await prepareChapterFrames({ ...OWNER_BILLING, ...chapters })
	expect(linkPreviewStill).not.toHaveBeenCalled()

	// the chapter then loads its own still, which is the podcast card for a chapter with no link preview image
	expect((await loadUnimaginedChapterFrame(0)).stillPng).toEqual(PODCAST_CARD_STILL)
	expect(linkPreviewStill).toHaveBeenCalledTimes(1)
	expect(renderOriginal).toHaveBeenCalledTimes(1)
})

test("only the Finding's title and public relevance explanation reach the scene writer", async () => {
	const sentQueries = stubChapterReads()
	const imaginedChapterStillPngs = await loadImaginedChapterStillPngs({ ...OWNER_BILLING, positions: [2] })
	expect(imaginedChapterStillPngs.get(2)).toEqual(IMAGINED_STILL)

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

test("a drawn image is checked, stored under its chapter's key, and billed to the film", async () => {
	const sentQueries = stubChapterReads()
	await loadImaginedChapterStillPngs({ ...OWNER_BILLING, positions: [3] })

	// the moderation reads the jpeg as a data url, and the jpeg lands beside the film's parts
	expect(classifyImage.mock.calls[0]?.[0].dataUrl).toStartWith("data:image/jpeg;base64,")
	expect(upload).toHaveBeenCalledWith("episodes/episode-1/video/chapter-3-image.jpg", ORIGINAL.jpegBytes, "image/jpeg")

	// the film row takes the draw's cost
	const [costUpdate] = toCostUpdates(sentQueries)
	expect(costUpdate?.text).toContain('"cost" = "topic_podcast_episode_videos"."cost" + $1')
	expect(Number(costUpdate?.values[0])).toBeGreaterThan(0)
	expect(costUpdate?.values).toContain("episode-1")
})

test("a second attempt reuses the stored image and draws nothing", async () => {
	// the first attempt stored chapter 3's image
	attachmentExists.mockResolvedValue(true)
	const storedBytes = spyOn(storage, "getAttachmentBytes").mockResolvedValue(STORED_JPEG)
	const sentQueries = stubChapterReads()
	const imaginedChapterStillPngs = await loadImaginedChapterStillPngs({ ...OWNER_BILLING, positions: [3] })

	// the stored jpeg is the still, with no model call, no moderation call, no upload, and no cost
	expect(storedBytes).toHaveBeenCalledWith("episodes/episode-1/video/chapter-3-image.jpg")
	expect(imaginedChapterStillPngs.get(3)).toEqual(IMAGINED_STILL)
	expect(writeScene).not.toHaveBeenCalled()
	expect(renderOriginal).not.toHaveBeenCalled()
	expect(classifyImage).not.toHaveBeenCalled()
	expect(upload).not.toHaveBeenCalled()
	expect(toCostUpdates(sentQueries)).toEqual([])
})

test("the backfill draws on the master key and adds no cost", async () => {
	const sentQueries = stubChapterReads()
	const imaginedChapterStillPngs = await loadImaginedChapterStillPngs({
		...OWNER_BILLING,
		isPlatformBilled: true,
		positions: [1],
	})

	// no owner key is read, both model calls run without one, and the film row is not written
	expect(imaginedChapterStillPngs.get(1)).toEqual(IMAGINED_STILL)
	expect(provisionKey).not.toHaveBeenCalled()
	expect(writeScene.mock.calls[0]?.[0].litellmApiKey).toBeUndefined()
	expect(renderOriginal.mock.calls[0]?.[0].litellmApiKey).toBeUndefined()
	expect(toCostUpdates(sentQueries)).toEqual([])
})

test("a spent budget, a rejected draw, and a thrown error leave the podcast card and never throw", async () => {
	// each failure, as the draw or the storage throws it
	const failures: [string, () => void][] = [
		["a spent budget", () => renderOriginal.mockRejectedValue(new TopicImageRenderFailure("budget-spent", "spent"))],
		["a rejected draw", () => renderOriginal.mockRejectedValue(new TopicImageRenderFailure("rejected", "no"))],
		["a failed storage read", () => attachmentExists.mockRejectedValue(new Error("storage is down"))],
		["a failed upload", () => upload.mockRejectedValue(new Error("storage is down"))],
		["a failed key", () => provisionKey.mockRejectedValue(new Error("no key"))],
	]
	for (const [failureName, stubFailure] of failures) {
		// put the passing stubs back, then break one
		renderOriginal.mockResolvedValue(ORIGINAL)
		attachmentExists.mockResolvedValue(false)
		upload.mockResolvedValue(undefined)
		provisionKey.mockResolvedValue("sk-owner")
		reportError.mockClear()
		stubFailure()

		// the chapter gets no still, and the failure is reported with the film's podcast episode
		stubChapterReads()
		const imaginedChapterStillPngs = await loadImaginedChapterStillPngs({ ...OWNER_BILLING, positions: [0] })
		expect([failureName, imaginedChapterStillPngs.size]).toEqual([failureName, 0])
		expect(reportError.mock.calls[0]?.[2]).toMatchObject({
			podcastEpisodeId: "episode-1",
			step: "imagined-chapter-image",
		})
	}
})

test("a violation, an unreadable image, and a failed check leave the podcast card, and a skipped check passes", async () => {
	// what the image moderation returns, and whether the image is stored and shown
	const classifications: [ModerationClassification, boolean][] = [
		[{ outcome: "classified", verdict: { isViolation: true, category: "sexual" } }, false],
		[{ outcome: "unreadable" }, false],
		[{ outcome: "failed", error: new Error("the moderation endpoint returned 500") }, false],
		[{ outcome: "skipped" }, true],
	]
	for (const [classification, isShown] of classifications) {
		// draw one chapter's image under the classification
		classifyImage.mockResolvedValue(classification)
		upload.mockClear()
		const sentQueries = stubChapterReads()
		const imaginedChapterStillPngs = await loadImaginedChapterStillPngs({ ...OWNER_BILLING, positions: [0] })

		// an image that does not pass is neither stored nor shown, and its draw still costs the film
		expect([classification.outcome, imaginedChapterStillPngs.has(0)]).toEqual([classification.outcome, isShown])
		expect(upload).toHaveBeenCalledTimes(isShown ? 1 : 0)
		expect(toCostUpdates(sentQueries)).toHaveLength(1)
	}

	// only the failed check is reported, without the image
	expect(reportError).toHaveBeenCalledTimes(1)
	expect(reportError.mock.calls[0]?.[2]).toMatchObject({ step: "imagined-chapter-image-moderation", position: "0" })
})

test("a chapter whose imagined image fails shows the podcast card, and the render goes on", async () => {
	// the image model rejects the one long chapter's image
	spyOn(topicPodcastEpisodeVideoInputs, "loadChapterLinkPreviewStillPng").mockResolvedValue(null)
	renderOriginal.mockRejectedValue(new TopicImageRenderFailure("rejected", "no"))
	stubChapterReads()
	const loadChapterFrame = await prepareChapterFrames({
		...OWNER_BILLING,
		videoChapterRows: [toVideoChapterRow(0)],
		segments: [toChapterSegment(0, 120)],
		workDirectory,
	})
	expect((await loadChapterFrame(0)).stillPng).toEqual(PODCAST_CARD_STILL)
	expect(upload).not.toHaveBeenCalled()
})
