import { AVATAR_JPEG_QUALITY, toResizedImage } from "@carlnotes/core/lib/imageUpload"

// the file size from which the decode asks the browser for a bitmap already at the longest edge allowed
const MIN_BYTES_FOR_RESIZED_DECODE = 1024 * 1024

/**
 * Returns a picked image re-encoded no larger than the longest edge allowed, a png for a source that can be transparent
 * and a jpeg for a photo, with its metadata dropped. Returns null if the canvas or the encode failed, and throws an
 * error for a file that can't be decoded.
 */
export async function resizeImageFile(imageFile: File, maxPixels: number): Promise<File | null> {
	// the size to resize to. an image already smaller keeps its size
	const bitmap = await decodeImageFile(imageFile, maxPixels)
	const resizedImage = toResizedImage({
		width: bitmap.width,
		height: bitmap.height,
		mimeType: imageFile.type,
		maxPixels,
	})

	// a canvas at the resized size. one with no 2d context fails
	const canvas = document.createElement("canvas")
	canvas.width = resizedImage.width
	canvas.height = resizedImage.height
	const context = canvas.getContext("2d")
	if (!context) {
		bitmap.close()
		return null
	}
	// the bitmap is freed once drawn
	context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
	bitmap.close()

	// re-encode in the resized format. a null blob means the encode failed
	const resizedBlob = await new Promise<Blob | null>((resolve) => {
		canvas.toBlob(resolve, resizedImage.mimeType, AVATAR_JPEG_QUALITY)
	})
	if (!resizedBlob) {
		return null
	}

	// the file keeps its name with the new format's suffix
	const resizedName = `${imageFile.name.replace(/\.[^.]+$/, "")}.${resizedImage.suffix}`
	return new File([resizedBlob], resizedName, { type: resizedImage.mimeType })
}

// decode a picked file with the orientation the camera recorded, at the longest edge allowed if the file is large.
// a HEIC or HEIF file the browser rejects is decoded by the HEIC decoder, loaded only then
async function decodeImageFile(imageFile: File, maxPixels: number): Promise<ImageBitmap> {
	// the decode options. a large file decodes at the allowed width with its height to match.
	// ponytail: a large file narrower than the allowed width is upscaled here and scaled back on the canvas, a double
	// resample. reading the dimensions from the file header first would size the decode by the longest edge instead
	const decodeOptions: ImageBitmapOptions = {
		imageOrientation: "from-image",
		...(imageFile.size >= MIN_BYTES_FOR_RESIZED_DECODE ? { resizeWidth: maxPixels, resizeQuality: "high" } : {}),
	}

	// the browser's own decoder first, then the HEIC decoder for a HEIC file the browser rejected
	try {
		return await createImageBitmap(imageFile, decodeOptions)
	} catch (error) {
		// only a HEIC file gets the second decoder
		if (!isHeicFile(imageFile)) {
			throw error
		}
		const { heicTo } = await import("heic-to")
		return heicTo({ blob: imageFile, type: "bitmap", options: decodeOptions })
	}
}

// whether a picked file is HEIC or HEIF, by its type or its extension
function isHeicFile(imageFile: File): boolean {
	return /^image\/hei[cf]$/.test(imageFile.type) || /\.hei[cf]$/i.test(imageFile.name)
}
