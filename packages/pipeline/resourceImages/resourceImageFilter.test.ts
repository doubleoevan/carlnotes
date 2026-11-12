// the Resource Image filter over images drawn by sharp: the file types, the smallest size, the shapes, one copy of each
// picture with the larger kept, the link preview image's place, and the stored jpeg's size
import { expect, test } from "bun:test"
import sharp from "sharp"
import {
	addResourceImage,
	type KeptResourceImage,
	type ResourceImageCandidate,
	toStoredResourceImageJpeg,
} from "./resourceImageFilter"
import { type ToTestImageBytesOptions, toTestImageBytes } from "./resourceImageTestFixtures"

// a candidate from a test picture, with a url that names its size
async function toResourceImageCandidate(
	testImage: ToTestImageBytesOptions,
	isLinkPreviewImage = false,
): Promise<ResourceImageCandidate> {
	return {
		sourceUrl: `https://cdn.example.com/${testImage.picture}-${testImage.width}x${testImage.height}`,
		imageBytes: await toTestImageBytes(testImage),
		isLinkPreviewImage,
	}
}

// filter candidates in, in order, as a fetch does
async function keepResourceImages(candidates: ResourceImageCandidate[]): Promise<KeptResourceImage[]> {
	let keptResourceImages: KeptResourceImage[] = []
	for (const candidate of candidates) {
		keptResourceImages = await addResourceImage(keptResourceImages, candidate)
	}
	return keptResourceImages
}

// the pixel sizes of the kept images, in order
function toSizes(keptResourceImages: KeptResourceImage[]): string[] {
	return keptResourceImages.map((keptResourceImage) => `${keptResourceImage.width}x${keptResourceImage.height}`)
}

test("a thumbnail is too small, and a 640 by 480 image just passes", async () => {
	const keptResourceImages = await keepResourceImages([
		await toResourceImageCandidate({ width: 425, height: 239, picture: 1 }),
		await toResourceImageCandidate({ width: 639, height: 480, picture: 2 }),
		await toResourceImageCandidate({ width: 640, height: 480, picture: 3 }),
	])
	expect(toSizes(keptResourceImages)).toEqual(["640x480"])
})

test("a tall screenshot does not fit, and a portrait photo is kept", async () => {
	const keptResourceImages = await keepResourceImages([
		await toResourceImageCandidate({ width: 800, height: 1600, picture: 1 }),
		await toResourceImageCandidate({ width: 800, height: 1067, picture: 2 }),
		await toResourceImageCandidate({ width: 2400, height: 600, picture: 3 }),
	])
	expect(toSizes(keptResourceImages)).toEqual(["800x1067"])
})

test("a gif, an svg, and bytes that are no image are dropped, and a png and a webp are kept", async () => {
	const svgBytes = new TextEncoder().encode(
		'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800"/></svg>',
	)
	const keptResourceImages = await keepResourceImages([
		await toResourceImageCandidate({ width: 1200, height: 800, picture: 1, format: "gif" }),
		{ sourceUrl: "https://cdn.example.com/drawing.svg", imageBytes: svgBytes, isLinkPreviewImage: false },
		{ sourceUrl: "https://cdn.example.com/page", imageBytes: new Uint8Array([1, 2, 3]), isLinkPreviewImage: false },
		await toResourceImageCandidate({ width: 1200, height: 800, picture: 2, format: "png" }),
		await toResourceImageCandidate({ width: 1200, height: 801, picture: 3, format: "webp" }),
	])
	expect(toSizes(keptResourceImages)).toEqual(["1200x800", "1200x801"])
})

test("a resized copy is dropped, and the larger copy is kept as the link preview image", async () => {
	const keptResourceImages = await keepResourceImages([
		await toResourceImageCandidate({ width: 780, height: 439, picture: 1 }),
		await toResourceImageCandidate({ width: 1200, height: 675, picture: 2 }),
		await toResourceImageCandidate({ width: 5089, height: 2867, picture: 1 }, true),
	])
	expect(toSizes(keptResourceImages)).toEqual(["5089x2867", "1200x675"])
	expect(keptResourceImages.map((keptResourceImage) => keptResourceImage.isLinkPreviewImage)).toEqual([true, false])
})

test("a link preview image that repeats a larger page image is dropped", async () => {
	const keptResourceImages = await keepResourceImages([
		await toResourceImageCandidate({ width: 2560, height: 1440, picture: 1 }),
		await toResourceImageCandidate({ width: 1120, height: 630, picture: 1 }, true),
	])
	expect(toSizes(keptResourceImages)).toEqual(["2560x1440"])
	expect(keptResourceImages[0]?.sourceUrl).toBe("https://cdn.example.com/1-2560x1440")
})

test("a link preview image that fails the filter is dropped", async () => {
	const keptResourceImages = await keepResourceImages([
		await toResourceImageCandidate({ width: 1200, height: 675, picture: 1 }),
		await toResourceImageCandidate({ width: 300, height: 200, picture: 2 }, true),
	])
	expect(keptResourceImages.some((keptResourceImage) => keptResourceImage.isLinkPreviewImage)).toBe(false)
})

test("a link preview image that the content does not show goes first", async () => {
	const keptResourceImages = await keepResourceImages([
		await toResourceImageCandidate({ width: 1200, height: 675, picture: 1 }),
		await toResourceImageCandidate({ width: 1200, height: 676, picture: 2 }),
		await toResourceImageCandidate({ width: 1200, height: 630, picture: 3 }, true),
	])
	expect(toSizes(keptResourceImages)).toEqual(["1200x630", "1200x675", "1200x676"])
})

test("a large image is stored within 2560 by 1440, and a small one is not enlarged", async () => {
	const largeJpeg = await toStoredResourceImageJpeg(await toTestImageBytes({ width: 6000, height: 3380, picture: 1 }))
	const smallJpeg = await toStoredResourceImageJpeg(await toTestImageBytes({ width: 1200, height: 630, picture: 1 }))
	const tallJpeg = await toStoredResourceImageJpeg(await toTestImageBytes({ width: 2000, height: 2600, picture: 1 }))

	// each fits inside the stored box, and none is enlarged
	expect([largeJpeg.width, largeJpeg.height]).toEqual([2556, 1440])
	expect([smallJpeg.width, smallJpeg.height]).toEqual([1200, 630])
	expect([tallJpeg.width, tallJpeg.height]).toEqual([1108, 1440])
	expect((await sharp(largeJpeg.jpegBytes).metadata()).format).toBe("jpeg")
})
