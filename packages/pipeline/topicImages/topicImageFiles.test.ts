// the topic image files: the center crop to 3:2 with its metadata stripped, the six derived sizes, and the object keys
import { expect, test } from "bun:test"
import { TOPIC_IMAGE_ORIGINAL_HEIGHT, TOPIC_IMAGE_ORIGINAL_WIDTH } from "@carlnotes/contracts/topicImages"
import sharp from "sharp"
import {
	toTopicImageFiles,
	toTopicImageHash,
	toTopicImageObjectKeys,
	toTopicImageOriginal,
	toTopicImageOriginalKey,
	toTopicImageUploadType,
} from "./topicImageFiles"

// a tall png with EXIF data, which an upload from a phone is
async function toTallPngWithExif(): Promise<Uint8Array> {
	const pngBytes = await sharp({
		create: { width: 400, height: 900, channels: 3, background: { r: 200, g: 120, b: 60 } },
	})
		.withExif({ IFD0: { Artist: "someone", Copyright: "theirs" } })
		.png()
		.toBuffer()
	return new Uint8Array(pngBytes)
}

test("an original is the center crop at 3:2, resized, as a jpeg with no metadata", async () => {
	const original = await toTopicImageOriginal(await toTallPngWithExif())
	expect([original.width, original.height]).toEqual([TOPIC_IMAGE_ORIGINAL_WIDTH, TOPIC_IMAGE_ORIGINAL_HEIGHT])

	// the stored bytes are a jpeg at the size with nothing but pixels in them
	const metadata = await sharp(original.jpegBytes).metadata()
	expect(metadata.format).toBe("jpeg")
	expect(metadata.width).toBe(TOPIC_IMAGE_ORIGINAL_WIDTH)
	expect(metadata.exif).toBeUndefined()
})

test("the six derived files are each size at 1x and 2x as webp", async () => {
	const original = await toTopicImageOriginal(await toTallPngWithExif())
	const derivedFiles = await toTopicImageFiles(original.jpegBytes)
	expect(derivedFiles.map((derivedFile) => derivedFile.fileName)).toEqual([
		"page.webp",
		"page@2x.webp",
		"list.webp",
		"list@2x.webp",
		"thumbnail.webp",
		"thumbnail@2x.webp",
	])

	// the 2x page file is twice the page size, as webp
	const page2x = derivedFiles.find((derivedFile) => derivedFile.fileName === "page@2x.webp")
	const metadata = await sharp(page2x?.bytes).metadata()
	expect([metadata.format, metadata.width, metadata.height]).toEqual(["webp", 720, 480])
})

test("the object keys are the original and the six files under the topic and the content hash", () => {
	const hash = toTopicImageHash(new Uint8Array([1, 2, 3]))
	expect(hash).toHaveLength(32)
	expect(toTopicImageOriginalKey("topic-1", hash)).toBe(`topic-images/topic-1/${hash}/original.jpg`)
	const objectKeys = toTopicImageObjectKeys("topic-1", hash)
	expect(objectKeys).toHaveLength(7)
	expect(objectKeys).toContain(`topic-images/topic-1/${hash}/thumbnail@2x.webp`)
})

test("an upload's type is read from its bytes, and a gif is not one", async () => {
	expect(toTopicImageUploadType(await toTallPngWithExif())).toBe("image/png")
	const jpegBytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#fff" } })
		.jpeg()
		.toBuffer()
	expect(toTopicImageUploadType(new Uint8Array(jpegBytes))).toBe("image/jpeg")

	// a webp's RIFF container, and a gif's signature
	const webpBytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#fff" } })
		.webp()
		.toBuffer()
	expect(toTopicImageUploadType(new Uint8Array(webpBytes))).toBe("image/webp")
	expect(toTopicImageUploadType(new TextEncoder().encode("GIF89a...."))).toBeNull()
})
