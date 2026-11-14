// avatar image tests: the pixel and format checks that run before an upload is decoded, the resized re-encode an
// upload is stored as, and the small copy a share card draws of a jpeg, a png, a webp, or a gif alone
import { expect, test } from "bun:test"
import sharp from "sharp"
import { toCardAvatarPng, toStoredAvatar } from "./avatarImages"

// a solid image of a pixel size, as the format a test names
async function toTestImage(
	{ width, height, alpha = 1 }: { width: number; height: number; alpha?: number },
	format: "png" | "jpeg" | "webp" | "gif" | "tiff",
): Promise<Uint8Array> {
	const image = sharp({ create: { width, height, channels: 4, background: { r: 140, g: 90, b: 43, alpha } } })
	return new Uint8Array(await image.toFormat(format).toBuffer())
}

// a small file that declares more pixels a side than the limit is rejected from its header alone
test("an upload past the pixel limit is too large, whatever its bytes", async () => {
	const hugeImage = await toTestImage({ width: 5000, height: 300 }, "png")
	expect(hugeImage.byteLength).toBeLessThan(2 * 1024 * 1024)
	expect(await toStoredAvatar(hugeImage)).toBe("too-large")
})

// bytes that are not an image are not stored
test("bytes the decoder cannot read are an unsupported type", async () => {
	expect(await toStoredAvatar(new Uint8Array([137, 80, 78, 71]))).toBe("unsupported-type")
	expect(await toStoredAvatar(new TextEncoder().encode("not an image"))).toBe("unsupported-type")
})

// an image the decoder reads in another format is rejected from its header, whatever type its request claimed
test("an upload that decodes as a tiff or an svg is an unsupported type", async () => {
	const tiffImage = await toTestImage({ width: 64, height: 64 }, "tiff")
	const svgImage = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"/>')
	expect((await sharp(tiffImage).metadata()).format).toBe("tiff")
	expect(await toStoredAvatar(tiffImage)).toBe("unsupported-type")
	expect(await toStoredAvatar(svgImage)).toBe("unsupported-type")
})

// each of the four formats an avatar may decode as is stored
test("a jpeg, a png, a webp, and a gif are each stored", async () => {
	for (const format of ["jpeg", "png", "webp", "gif"] as const) {
		const storedAvatar = await toStoredAvatar(await toTestImage({ width: 64, height: 64 }, format))
		expect(storedAvatar).toMatchObject({ contentType: format === "jpeg" ? "image/jpeg" : "image/png" })
	}
})

// a large jpeg is stored as a jpeg within the stored edge, at its own shape
test("a large jpeg is stored as a jpeg no longer than 512 pixels on its longest edge", async () => {
	const storedAvatar = await toStoredAvatar(await toTestImage({ width: 2000, height: 1000 }, "jpeg"))
	if (typeof storedAvatar === "string") {
		throw new Error(`the jpeg was rejected as ${storedAvatar}`)
	}

	// within the stored edge at its own shape, still a jpeg
	const { width, height, format } = await sharp(storedAvatar.bytes).metadata()
	expect(storedAvatar.contentType).toBe("image/jpeg")
	expect({ width, height, format }).toEqual({ width: 512, height: 256, format: "jpeg" })
})

// a picker's upload is already small, so it keeps its pixel size, and a transparent logo stays transparent
test("a small transparent png keeps its size and its transparent pixels", async () => {
	const storedAvatar = await toStoredAvatar(await toTestImage({ width: 300, height: 300, alpha: 0 }, "png"))
	if (typeof storedAvatar === "string") {
		throw new Error(`the png was rejected as ${storedAvatar}`)
	}

	// the same pixel size, as a png whose first pixel is still fully transparent
	const { data, info } = await sharp(storedAvatar.bytes).raw().toBuffer({ resolveWithObject: true })
	expect(storedAvatar.contentType).toBe("image/png")
	expect({ width: info.width, height: info.height, channels: info.channels }).toEqual({
		width: 300,
		height: 300,
		channels: 4,
	})
	expect(data[3]).toBe(0)
})

// a webp becomes a png, which every reader of a stored avatar serves
test("a webp is stored as a png", async () => {
	const storedAvatar = await toStoredAvatar(await toTestImage({ width: 64, height: 64 }, "webp"))
	expect(storedAvatar).toMatchObject({ contentType: "image/png" })
})

// a card draws an avatar at the size it asks for, whatever the stored image's pixel size
test("a card avatar is a png at the drawn size", async () => {
	const cardAvatarPng = await toCardAvatarPng(await toTestImage({ width: 3000, height: 2000 }, "png"), 56)
	const { width, height, format } = await sharp(cardAvatarPng).metadata()
	expect({ width, height, format }).toEqual({ width: 56, height: 56, format: "png" })
})

// an avatar stored as it was sent may be any format its bytes decode as, and a card draws the four alone
test("a card draws no avatar that decodes as a tiff or an svg", async () => {
	const tiffImage = await toTestImage({ width: 64, height: 64 }, "tiff")
	const svgImage = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"/>')
	await expect(toCardAvatarPng(tiffImage, 56)).rejects.toThrow("a card draws no avatar in the tiff format")
	await expect(toCardAvatarPng(svgImage, 56)).rejects.toThrow("a card draws no avatar in the svg format")
})
