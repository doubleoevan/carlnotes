// a film's generated chapter images, with the connection pool, storage, and the model calls stubbed: what reaches the
// scene writer, each image's framing, its moderation and storage, the stored image a second attempt reuses, a stopped
// render, and who pays
import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { restoreConnectionPool } from "@carlnotes/db/connectionPoolStub"
import {
	type ChapterImageGenerationSpies,
	ORIGINAL,
	OWNER_BILLING,
	STORED_JPEG,
	stubChapterImageGenerations,
	stubChapterReads,
	toCostUpdates,
} from "./chapterImageTestFixtures"
import { loadGeneratedChapterImages } from "./generatedChapterImages"

// the spies the tests read
let writeScene: ChapterImageGenerationSpies["writeScene"]
let renderOriginal: ChapterImageGenerationSpies["renderOriginal"]
let classifyImage: ChapterImageGenerationSpies["classifyImage"]
let attachmentExists: ChapterImageGenerationSpies["attachmentExists"]
let upload: ChapterImageGenerationSpies["upload"]

// the owner's key, the error reports, and the owner's spend cutoff, which the image generations never read
let provisionKey: ChapterImageGenerationSpies["provisionKey"]
let reportError: ChapterImageGenerationSpies["reportError"]
let isCutoffPassed: ChapterImageGenerationSpies["isCutoffPassed"]

// an image generation that succeeds on the owner's key, an image the moderation passes, and nothing stored yet
beforeEach(() => {
	;({ writeScene, renderOriginal, classifyImage, attachmentExists, upload, provisionKey, reportError, isCutoffPassed } =
		stubChapterImageGenerations())
})

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
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

	// the image is generated in the film house style at the film's size, on the same key
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

	// three image generations, each in a framing of its own
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

test("a generated image is checked, stored under its chapter's numbered key, and billed to the film", async () => {
	const sentQueries = stubChapterReads()
	const generatedChapterImageRefs = [
		{ position: 3, imageNumber: 0 },
		{ position: 3, imageNumber: 1 },
	]
	const generatedChapterImages = await loadGeneratedChapterImages({ ...OWNER_BILLING, generatedChapterImageRefs })
	expect(generatedChapterImages.newlyGeneratedChapterImageCount).toBe(2)

	// the moderation reads the jpeg as a data url, and the first jpeg keeps the key the api serves
	expect(classifyImage.mock.calls[0]?.[0].dataUrl).toStartWith("data:image/jpeg;base64,")
	const uploadedKeys = upload.mock.calls.map(([objectKey]: [string]) => objectKey).toSorted()
	expect(uploadedKeys).toEqual([
		"episodes/episode-1/video/chapter-3-image-s2-1.jpg",
		"episodes/episode-1/video/chapter-3-image-s2.jpg",
	])

	// the film row takes each image generation's cost
	const costUpdates = toCostUpdates(sentQueries)
	expect(costUpdates).toHaveLength(2)
	expect(costUpdates[0]?.text).toContain('"cost" = "topic_podcast_episode_videos"."cost" + $1')
	expect(Number(costUpdates[0]?.values[0])).toBeGreaterThan(0)
	expect(costUpdates[0]?.values).toContain("episode-1")
})

test("a second attempt reuses the stored image and generates nothing", async () => {
	attachmentExists.mockResolvedValue(true)
	const sentQueries = stubChapterReads()
	const generatedChapterImageRefs = [{ position: 1, imageNumber: 0 }]
	const generatedChapterImages = await loadGeneratedChapterImages({ ...OWNER_BILLING, generatedChapterImageRefs })
	expect(generatedChapterImages.jpegBytesByPosition.get(1)).toEqual([STORED_JPEG])

	// nothing is generated or billed
	expect(generatedChapterImages.newlyGeneratedChapterImageCount).toBe(0)
	expect(renderOriginal).not.toHaveBeenCalled()
	expect(toCostUpdates(sentQueries)).toEqual([])
})

test("a call that skips image generation reuses the stored image and generates none in place of the others", async () => {
	// the first image is stored and the second is not
	attachmentExists.mockImplementation(async (objectKey: string) => objectKey.endsWith("chapter-1-image-s2.jpg"))
	const sentQueries = stubChapterReads()
	const generatedChapterImageRefs = [
		{ position: 1, imageNumber: 0 },
		{ position: 1, imageNumber: 1 },
	]
	const generatedChapterImages = await loadGeneratedChapterImages({
		...OWNER_BILLING,
		isChapterImageGenerationSkipped: true,
		generatedChapterImageRefs,
	})

	// the stored image alone, with nothing generated or billed and no key provisioned
	expect(generatedChapterImages.jpegBytesByPosition.get(1)).toEqual([STORED_JPEG])
	expect(generatedChapterImages.newlyGeneratedChapterImageCount).toBe(0)
	expect(renderOriginal).not.toHaveBeenCalled()
	expect(provisionKey).not.toHaveBeenCalled()
	expect(toCostUpdates(sentQueries)).toEqual([])
})

test("the platform's image generations use the master key and add no cost to the film", async () => {
	const sentQueries = stubChapterReads()
	const generatedChapterImageRefs = [{ position: 1, imageNumber: 0 }]
	const generatedChapterImages = await loadGeneratedChapterImages({
		...OWNER_BILLING,
		isPlatformBilled: true,
		generatedChapterImageRefs,
	})
	expect(generatedChapterImages.newlyGeneratedChapterImageCount).toBe(1)
	expect(provisionKey).not.toHaveBeenCalled()
	expect(renderOriginal.mock.calls[0]?.[0].litellmApiKey).toBeUndefined()
	expect(toCostUpdates(sentQueries)).toEqual([])
})

test("an owner past the spend cutoff still generates every image", async () => {
	// the owner is past the cutoff before the image generations start
	stubChapterReads()
	isCutoffPassed.mockResolvedValue(true)
	const generatedChapterImageRefs = [
		{ position: 1, imageNumber: 0 },
		{ position: 1, imageNumber: 1 },
		{ position: 1, imageNumber: 2 },
	]

	// every image is generated, and the owner's spend is never read
	const ownerImages = await loadGeneratedChapterImages({ ...OWNER_BILLING, generatedChapterImageRefs })
	expect(ownerImages.newlyGeneratedChapterImageCount).toBe(3)
	expect(renderOriginal).toHaveBeenCalledTimes(3)
	expect(isCutoffPassed).not.toHaveBeenCalled()
})

test("a stopped render generates nothing more and throws an error", async () => {
	// the signal is aborted before the image generations start
	stubChapterReads()
	const stoppedRender = new AbortController()
	stoppedRender.abort(new Error("the render was stopped"))
	const generatedChapterImageRefs = [{ position: 1, imageNumber: 0 }]
	const stoppedGenerations = loadGeneratedChapterImages({
		...OWNER_BILLING,
		signal: stoppedRender.signal,
		generatedChapterImageRefs,
	})
	await expect(stoppedGenerations).rejects.toThrow("the render was stopped")
	expect(renderOriginal).not.toHaveBeenCalled()
	expect(reportError).not.toHaveBeenCalled()
})

test("an image the moderation flags is billed, not stored, and not shown", async () => {
	classifyImage.mockResolvedValue({ outcome: "classified", verdict: { isViolation: true, category: "violence" } })
	const sentQueries = stubChapterReads()
	const generatedChapterImageRefs = [{ position: 1, imageNumber: 0 }]
	const generatedChapterImages = await loadGeneratedChapterImages({ ...OWNER_BILLING, generatedChapterImageRefs })

	// the image generation is billed, and its image is not stored or shown
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
