// the image draw's kept bytes, with the image model and storage stubbed: a draw's bytes are kept under the caller's
// key, a retry reads them and draws nothing, bytes that cannot be read are never kept, and a failed keep stops nothing
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as storage from "@carlnotes/db/store"
import * as topicImageModel from "@carlnotes/models/topicImageModel"
import * as monitoring from "@carlnotes/server/monitoring"
import sharp from "sharp"
import { deleteDrawnImage, renderTopicImageOriginal, toDrawnImageKey } from "./renderTopicImageOriginal"

// the key one render's drawn bytes are kept under, and a draw as written, with no house style to load
const DRAWN_IMAGE_KEY = toDrawnImageKey("topic-image-render", "render-1")
const DRAW = { scene: "A bridge in fog at first light.", isHouseStyle: false, model: "image-model" }

// the objects in storage by key, the image model's spy, the upload's spy, and the queries sent
let storedObjects: Map<string, Uint8Array>
let renderImage: ReturnType<typeof spyOn<typeof topicImageModel, "renderTopicImage">>
let upload: ReturnType<typeof spyOn<typeof storage, "uploadAttachment">>
let sentQueries: SentQuery[]

// an image model that draws a small png, and storage that keeps what is uploaded to it
beforeEach(async () => {
	const pngBytes = await sharp({ create: { width: 60, height: 40, channels: 3, background: "#804020" } })
		.png()
		.toBuffer()
	renderImage = spyOn(topicImageModel, "renderTopicImage").mockResolvedValue({
		outcome: "rendered",
		imageBytes: new Uint8Array(pngBytes),
	})

	// storage that holds nothing yet
	storedObjects = new Map()
	spyOn(storage, "attachmentExists").mockImplementation(async (objectKey) => storedObjects.has(objectKey))
	spyOn(storage, "getAttachmentBytes").mockImplementation(async (objectKey) => storedObjects.get(objectKey) as never)
	upload = spyOn(storage, "uploadAttachment").mockImplementation(async (objectKey, bytes) => {
		storedObjects.set(objectKey, bytes)
	})

	// a delete takes each key out of storage, and the pending deletion's insert goes to the stubbed pool
	spyOn(storage, "deleteStoredObjects").mockImplementation(async (objectKeys) => {
		for (const objectKey of objectKeys) {
			storedObjects.delete(objectKey)
		}
	})
	sentQueries = stubConnectionPool()
})

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// the draw is the paid step, and the resizes and uploads after it are what fail
test("a retry after a failed upload reads the kept bytes and draws nothing", async () => {
	// the first attempt draws once and keeps the model's bytes, with their pending deletion recorded first
	const firstOriginal = await renderTopicImageOriginal({ ...DRAW, drawnImageKey: DRAWN_IMAGE_KEY })
	expect(renderImage).toHaveBeenCalledTimes(1)
	expect([...storedObjects.keys()]).toEqual([DRAWN_IMAGE_KEY])
	expect(sentQueries[0]?.text).toStartWith('insert into "pending_object_deletions"')
	expect(sentQueries[0]?.values[0]).toBe(DRAWN_IMAGE_KEY)

	// the attempt after a failed upload gets the same original with no model call
	const retryOriginal = await renderTopicImageOriginal({ ...DRAW, drawnImageKey: DRAWN_IMAGE_KEY })
	expect(renderImage).toHaveBeenCalledTimes(1)
	expect(retryOriginal).toEqual(firstOriginal)

	// the kept bytes go once the image is current
	await deleteDrawnImage(DRAWN_IMAGE_KEY)
	expect(storedObjects.size).toBe(0)
})

test("a draw with no key keeps nothing", async () => {
	await renderTopicImageOriginal(DRAW)
	expect(storedObjects.size).toBe(0)
	expect(sentQueries).toEqual([])
})

// bytes that made no original would fail every retry that read them
test("bytes that cannot be read are never kept, so the next attempt draws again", async () => {
	renderImage.mockResolvedValueOnce({ outcome: "rendered", imageBytes: new Uint8Array([1, 2, 3]) })
	await expect(renderTopicImageOriginal({ ...DRAW, drawnImageKey: DRAWN_IMAGE_KEY })).rejects.toThrow()
	expect(storedObjects.size).toBe(0)

	// the next attempt draws a readable image
	await renderTopicImageOriginal({ ...DRAW, drawnImageKey: DRAWN_IMAGE_KEY })
	expect(renderImage).toHaveBeenCalledTimes(2)
})

test("a failed keep is reported, and the draw stands", async () => {
	const reportError = spyOn(monitoring, "reportError").mockImplementation(() => {})
	upload.mockRejectedValue(new Error("the bucket is unreachable"))
	const original = await renderTopicImageOriginal({ ...DRAW, drawnImageKey: DRAWN_IMAGE_KEY })
	expect(original.jpegBytes.byteLength).toBeGreaterThan(0)
	expect(reportError).toHaveBeenCalledTimes(1)
})

// a spent budget and a rejection draw nothing, so there is nothing to keep
test("a render that drew nothing keeps nothing", async () => {
	renderImage.mockResolvedValue({ outcome: "rejected", reason: "the prompt was refused" } as never)
	await expect(renderTopicImageOriginal({ ...DRAW, drawnImageKey: DRAWN_IMAGE_KEY })).rejects.toThrow(
		"the prompt was refused",
	)
	expect(storedObjects.size).toBe(0)
})
