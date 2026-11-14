// preview card avatar tests: a large stored avatar and a provider photo are each inlined as a png at the size the
// card draws, and an avatar that decodes as another format draws the initials
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as store from "@carlnotes/db/store"
import { toOwnerImageDataUri } from "./previewImage"

// the size a card draws an avatar at, and a photo of 1264 by 848 pixels, far larger than that
const CARD_AVATAR_PIXELS = 56
const LARGE_PHOTO_URL = new URL("./fixtures/home-espresso-lite.jpg", import.meta.url)

// the network each test replaces
const originalFetch = globalThis.fetch

// put every spy and the network back after each test
afterEach(() => {
	mock.restore()
	globalThis.fetch = originalFetch
})

// the large photo's bytes
async function loadLargePhoto(): Promise<Uint8Array<ArrayBuffer>> {
	return new Uint8Array(await Bun.file(LARGE_PHOTO_URL).arrayBuffer())
}

// the pixel size a png data uri's header declares
function toPngSize(imageDataUri: string | null): { width: number; height: number } {
	const [dataUriPrefix, pngBase64 = ""] = (imageDataUri ?? "").split(",")
	expect(dataUriPrefix).toBe("data:image/png;base64")
	const pngBytes = Buffer.from(pngBase64, "base64")
	return { width: pngBytes.readUInt32BE(16), height: pngBytes.readUInt32BE(20) }
}

// a stored avatar of any pixel size is resized before a card inlines it
test("a large stored avatar is inlined as a png at the size the card draws", async () => {
	const largePhoto = await loadLargePhoto()
	const getAttachmentBytesSpy = spyOn(store, "getAttachmentBytes").mockResolvedValue(largePhoto)
	const ownerImageDataUri = await toOwnerImageDataUri({ avatarKey: "avatars/user-1/large.jpg" }, CARD_AVATAR_PIXELS)

	// the card reads the stored object and inlines a small square png in place of the stored bytes
	expect(getAttachmentBytesSpy).toHaveBeenCalledWith("avatars/user-1/large.jpg")
	expect(toPngSize(ownerImageDataUri)).toEqual({ width: CARD_AVATAR_PIXELS, height: CARD_AVATAR_PIXELS })
	expect(ownerImageDataUri?.length).toBeLessThan(largePhoto.byteLength / 4)
})

// a provider photo is fetched from its provider and resized the same way
test("a provider photo is fetched and inlined as a png at the size the card draws", async () => {
	const largePhoto = await loadLargePhoto()
	const fetchSpy = mock(async (_imageUrl: string) => new Response(largePhoto))
	globalThis.fetch = fetchSpy as unknown as typeof fetch
	const providerPhoto = { imageUrl: "https://lh3.googleusercontent.com/a/photo" }
	const ownerImageDataUri = await toOwnerImageDataUri(providerPhoto, CARD_AVATAR_PIXELS)

	// the photo comes from its provider's url, and the card inlines a small square png
	expect(fetchSpy.mock.calls[0]?.[0]).toBe("https://lh3.googleusercontent.com/a/photo")
	expect(toPngSize(ownerImageDataUri)).toEqual({ width: CARD_AVATAR_PIXELS, height: CARD_AVATAR_PIXELS })
})

// an avatar stored as it was sent may decode as a format a card never draws
test("a stored avatar that decodes as an svg draws the initials", async () => {
	const svgAvatar = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"/>')
	spyOn(store, "getAttachmentBytes").mockResolvedValue(svgAvatar)
	const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
	expect(await toOwnerImageDataUri({ avatarKey: "avatars/user-1/drawing.png" }, CARD_AVATAR_PIXELS)).toBeNull()
	expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
})

// a user on the initials publishes no image to inline
test("a user with no published avatar draws the initials", async () => {
	expect(await toOwnerImageDataUri(null, CARD_AVATAR_PIXELS)).toBeNull()
})
