// the image resize plan: the longest edge allowed, no enlarging, and the format that keeps transparency

import { expect, test } from "bun:test"
import { MAX_ATTACHMENT_IMAGE_PIXELS, MAX_AVATAR_PIXELS, toResizedImage } from "./imageUpload"

// a camera photo shrinks to the longest edge allowed on its long side
test("a landscape or portrait photo shrinks to the longest edge", () => {
	expect(
		toResizedImage({ width: 4032, height: 3024, mimeType: "image/heic", maxPixels: MAX_ATTACHMENT_IMAGE_PIXELS }),
	).toEqual({ width: 2048, height: 1536, isTransparencyKept: false, mimeType: "image/jpeg", suffix: "jpg" })
	expect(toResizedImage({ width: 3024, height: 4032, mimeType: "image/jpeg", maxPixels: MAX_AVATAR_PIXELS })).toEqual({
		width: 384,
		height: 512,
		isTransparencyKept: false,
		mimeType: "image/jpeg",
		suffix: "jpg",
	})
})

// a small image keeps its size and a sliver keeps a pixel on its short edge
test("a small image is never enlarged and never collapses", () => {
	expect(toResizedImage({ width: 300, height: 200, mimeType: "image/jpeg", maxPixels: 512 })).toMatchObject({
		width: 300,
		height: 200,
	})
	expect(toResizedImage({ width: 5000, height: 1, mimeType: "image/jpeg", maxPixels: 512 })).toMatchObject({
		width: 512,
		height: 1,
	})
})

// a source that can be transparent re-encodes as a png, every other source as a jpeg
test("png, webp, and gif keep transparency as png", () => {
	for (const mimeType of ["image/png", "image/webp", "image/gif"]) {
		expect(toResizedImage({ width: 10, height: 10, mimeType, maxPixels: 512 })).toMatchObject({
			isTransparencyKept: true,
			mimeType: "image/png",
			suffix: "png",
		})
	}
	expect(toResizedImage({ width: 10, height: 10, mimeType: "image/heif", maxPixels: 512 }).mimeType).toBe("image/jpeg")
})
