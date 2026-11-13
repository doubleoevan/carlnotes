import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as store from "@carlnotes/db/store"
import sharp from "sharp"
import {
	ANIMATION_FRAME_LIMIT,
	storeTopicPostBodyImage,
	toTopicPostBodyImage,
	toTopicPostBodyImageUploadType,
} from "./topicPostBodyImageFiles"
import { toBombPng } from "./topicPostBodyImageTestFixtures"

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// a solid image of a size, as a png
function toSolidPng(width: number, height: number): Promise<Buffer> {
	return sharp({ create: { width, height, channels: 3, background: "#3366cc" } })
		.png()
		.toBuffer()
}

// an animated gif of solid frames of a size
async function toAnimatedGif(width: number, height: number, frameCount: number): Promise<Uint8Array> {
	const frames = await Promise.all(
		Array.from({ length: frameCount }, (_, i) =>
			sharp({ create: { width, height, channels: 3, background: i % 2 ? "#ffffff" : "#000000" } })
				.png()
				.toBuffer(),
		),
	)
	return new Uint8Array(
		await sharp(frames, { join: { animated: true } })
			.gif()
			.toBuffer(),
	)
}

test("only jpeg, png, webp, and gif bytes are upload types, whatever the file claims", async () => {
	// each allowed type by its bytes
	expect(toTopicPostBodyImageUploadType(new Uint8Array(await toSolidPng(4, 4)))).toBe("image/png")
	expect(toTopicPostBodyImageUploadType(await toAnimatedGif(4, 4, 2))).toBe("image/gif")

	// an svg and an html page are text, so neither is a type
	const svgBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
	expect(toTopicPostBodyImageUploadType(svgBytes)).toBeNull()
	expect(await toTopicPostBodyImage(svgBytes)).toEqual({ rejection: "unsupported-type" })
	expect(await toTopicPostBodyImage(new TextEncoder().encode("<html>photo.png</html>"))).toEqual({
		rejection: "unsupported-type",
	})
})

test("a decompression bomb is rejected from its header", async () => {
	expect(await toTopicPostBodyImage(toBombPng(50_000))).toEqual({ rejection: "too-large" })
})

test("an animation's pixels count over every frame", async () => {
	// 21 frames of 1400 by 1400 pass 40 megapixels together though each frame is small
	expect(await toTopicPostBodyImage(await toAnimatedGif(1400, 1400, 21))).toEqual({ rejection: "too-large" })
})

test("an animated gif stays animated, and its moderation screens every frame on one sheet", async () => {
	const bodyImage = await toTopicPostBodyImage(await toAnimatedGif(40, 30, 5))
	if ("rejection" in bodyImage) {
		throw new Error(bodyImage.rejection)
	}

	// both files keep every frame, and the size is one frame's
	for (const fileBytes of Object.values(bodyImage.files)) {
		const fileMetadata = await sharp(fileBytes, { animated: true }).metadata()
		expect(fileMetadata.format).toBe("webp")
		expect(fileMetadata.pages).toBe(5)
	}
	expect({ width: bodyImage.width, height: bodyImage.height }).toEqual({ width: 40, height: 30 })

	// five frames fill a grid three frames wide and two high, on one background or two
	expect(bodyImage.moderationJpegs.length).toBeGreaterThanOrEqual(1)
	const sheetMetadata = await sharp(bodyImage.moderationJpegs[0]).metadata()
	expect({ width: sheetMetadata.width, height: sheetMetadata.height }).toEqual({ width: 120, height: 60 })
})

test("a long animation's moderation screens every frame, sixteen to a sheet, and a longer one is too large", async () => {
	// forty frames of 10 by 10 fill two whole sheets four frames square and one of eight frames three wide, on each
	// background
	const bodyImage = await toTopicPostBodyImage(await toAnimatedGif(10, 10, 40))
	if ("rejection" in bodyImage) {
		throw new Error(bodyImage.rejection)
	}
	const sheetSizes = await Promise.all(
		bodyImage.moderationJpegs.map(async (sheetJpeg) => {
			const { width, height } = await sharp(sheetJpeg).metadata()
			return { width, height }
		}),
	)
	const backgroundCount = sheetSizes.length / 3
	expect(sheetSizes.filter(({ width, height }) => width === 40 && height === 40)).toHaveLength(2 * backgroundCount)
	expect(sheetSizes.filter(({ width, height }) => width === 30 && height === 30)).toHaveLength(backgroundCount)

	// an animation past the frame limit is rejected before it is screened
	expect(await toTopicPostBodyImage(await toAnimatedGif(4, 4, ANIMATION_FRAME_LIMIT + 1))).toEqual({
		rejection: "too-large",
	})
})

test("a transparent image is screened on white and on black, so what one background hides is still screened", async () => {
	// white text drawn on a clear background, which white would hide
	const clearPng = await sharp({ create: { width: 20, height: 10, channels: 4, background: "#ffffff00" } })
		.composite([{ input: { create: { width: 10, height: 10, channels: 4, background: "#ffffffff" } } }])
		.png()
		.toBuffer()
	const bodyImage = await toTopicPostBodyImage(new Uint8Array(clearPng))
	if ("rejection" in bodyImage) {
		throw new Error(bodyImage.rejection)
	}

	// the black sheet shows the white half against the black one
	expect(bodyImage.moderationJpegs).toHaveLength(2)
	const { channels } = await sharp(bodyImage.moderationJpegs[1]).stats()
	expect(channels[0]?.min).toBeLessThan(30)
	expect(channels[0]?.max).toBeGreaterThan(225)
})

test("a file cut short is rejected as no image, never thrown", async () => {
	// a jpeg's header and a few of its first bytes
	const jpegBytes = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#123456" } })
		.jpeg()
		.toBuffer()
	expect(await toTopicPostBodyImage(new Uint8Array(jpegBytes.subarray(0, 3000)))).toEqual({
		rejection: "unsupported-type",
	})
})

test("a phone photo loses its location and every other piece of metadata", async () => {
	// a jpeg with a camera and a GPS location in its EXIF
	const photoBytes = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#808080" } })
		.withExif({ IFD0: { Make: "Phone" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "37/1 46/1 30/1" } })
		.jpeg()
		.toBuffer()
	expect((await sharp(photoBytes).metadata()).exif).toBeDefined()

	// the photo's files
	const bodyImage = await toTopicPostBodyImage(new Uint8Array(photoBytes))
	if ("rejection" in bodyImage) {
		throw new Error(bodyImage.rejection)
	}

	// the stored file holds no EXIF, and a still is screened once
	for (const fileBytes of Object.values(bodyImage.files)) {
		const fileMetadata = await sharp(fileBytes).metadata()
		expect(fileMetadata.exif).toBeUndefined()
		expect(fileMetadata.xmp).toBeUndefined()
	}
	expect(bodyImage.moderationJpegs).toHaveLength(1)
})

test("the column copy fits twice the column's width and is never enlarged", async () => {
	// a wide image shrinks to twice the column, and a small one keeps its size
	const wideImage = await toTopicPostBodyImage(new Uint8Array(await toSolidPng(3000, 1000)))
	const smallImage = await toTopicPostBodyImage(new Uint8Array(await toSolidPng(800, 600)))
	if ("rejection" in wideImage || "rejection" in smallImage) {
		throw new Error("rejected")
	}
	expect({ width: wideImage.width, height: wideImage.height }).toEqual({ width: 1920, height: 640 })
	expect({ width: smallImage.width, height: smallImage.height }).toEqual({ width: 800, height: 600 })
})

test("each stored file is pending deletion an hour out before its bytes go up, so an upload never saved is deleted", async () => {
	// each pending row and each upload, in the order they happen
	const storeSteps: string[] = []
	const sentQueries = stubConnectionPool(({ text, values }) => {
		if (text.startsWith('insert into "pending_object_deletions"')) {
			storeSteps.push(`pending ${values[0]}`)
		}
		return []
	})

	// each upload, by its key
	spyOn(store, "uploadAttachment").mockImplementation(async (objectKey) => {
		storeSteps.push(`upload ${objectKey}`)
	})

	// one image's file, stored
	const files = { "column.webp": new Uint8Array([1]) }
	await storeTopicPostBodyImage({ topicPostId: "post-1", imageId: "image-1", files })

	// the file's pending row goes in before its bytes
	const columnKey = "topic-post-body-images/post-1/image-1/column.webp"
	expect(storeSteps).toEqual([`pending ${columnKey}`, `upload ${columnKey}`])

	// each row is due once the hour's grace has passed, when the sweep deletes a file no save cleared
	for (const sentQuery of sentQueries) {
		const nextTryAt = sentQuery.values.find((value) => typeof value === "string" && /^\d{4}-/.test(value))
		expect(new Date(String(nextTryAt)).getTime() - Date.now()).toBeGreaterThan(59 * 60 * 1000)
	}
})
