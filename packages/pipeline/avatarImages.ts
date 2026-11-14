// an avatar's images: the resized re-encode an upload is stored as, and the small copy a share card draws

import sharp from "sharp"

// the formats an avatar may decode as, whatever type its request or its stored key claims
const AVATAR_FORMATS = new Set(["jpeg", "png", "webp", "gif"])

// the most pixels a side an uploaded avatar may declare. either app's picker uploads 512 pixels or fewer, and a small
// file that declares a huge image is rejected before it is decoded
const MAX_AVATAR_UPLOAD_PIXELS_PER_SIDE = 4096

// the most pixels of an avatar a card decodes, as many as a square of 12,000 pixels a side
const MAX_CARD_AVATAR_PIXELS = 12_000 * 12_000

// the longest edge a stored avatar keeps, the size the pickers upload
const STORED_AVATAR_EDGE_PIXELS = 512

// the jpeg quality of a stored avatar
const STORED_AVATAR_JPEG_QUALITY = 90

// a stored avatar: its re-encoded bytes and the type they are served as
export type StoredAvatar = { bytes: Uint8Array; contentType: "image/png" | "image/jpeg" }

/**
 * Returns the re-encode an uploaded avatar is stored as, never the bytes as sent: no longer than 512 pixels on its
 * longest edge, never enlarged, upright, with its metadata stripped, a jpeg for a jpeg and a png for anything else, so
 * transparent pixels stay transparent. Returns too-large for an image that declares more pixels a side than the limit,
 * and unsupported-type for bytes that are not a jpeg, a png, a webp, or a gif, both read from the header before
 * anything is decoded.
 */
export async function toStoredAvatar(
	avatarBytes: Uint8Array,
): Promise<StoredAvatar | "too-large" | "unsupported-type"> {
	try {
		// the header alone names the pixel size and the format
		const { width, height, format } = await sharp(avatarBytes).metadata()
		if (!width || !height || !AVATAR_FORMATS.has(format)) {
			return "unsupported-type"
		}
		if (width > MAX_AVATAR_UPLOAD_PIXELS_PER_SIDE || height > MAX_AVATAR_UPLOAD_PIXELS_PER_SIDE) {
			return "too-large"
		}

		// the image upright within the stored edge
		const resizedAvatar = sharp(avatarBytes)
			.rotate()
			.resize(STORED_AVATAR_EDGE_PIXELS, STORED_AVATAR_EDGE_PIXELS, { fit: "inside", withoutEnlargement: true })

		// a jpeg stays a jpeg, and anything else becomes a png
		if (format === "jpeg") {
			const jpegBytes = await resizedAvatar.jpeg({ quality: STORED_AVATAR_JPEG_QUALITY, mozjpeg: true }).toBuffer()
			return { bytes: new Uint8Array(jpegBytes), contentType: "image/jpeg" }
		}
		return { bytes: new Uint8Array(await resizedAvatar.png().toBuffer()), contentType: "image/png" }
	} catch {
		// bytes the decoder cannot read are not an image the app stores
		return "unsupported-type"
	}
}

/**
 * Returns an avatar as a png at the size a share card draws it, read a strip at a time so an image of any pixel size
 * is never held whole in memory. Throws an error for bytes that are not a jpeg, a png, a webp, or a gif, read from
 * the header before anything is decoded, and for an image past the card's pixel limit.
 */
export async function toCardAvatarPng(avatarBytes: Uint8Array, edgePixels: number): Promise<Uint8Array> {
	// the header alone names the format
	const { format } = await sharp(avatarBytes).metadata()
	if (!AVATAR_FORMATS.has(format)) {
		throw new Error(`a card draws no avatar in the ${format} format`)
	}

	// the avatar upright, cropped to the card's square
	const cardAvatarPng = await sharp(avatarBytes, { sequentialRead: true, limitInputPixels: MAX_CARD_AVATAR_PIXELS })
		.rotate()
		.resize(edgePixels, edgePixels, { fit: "cover", position: "centre" })
		.png()
		.toBuffer()
	return new Uint8Array(cardAvatarPng)
}
