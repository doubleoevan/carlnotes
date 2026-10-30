import { sendAvatarDecodeFailure } from "@carlnotes/client/profileClient"
import { AVATAR_JPEG_QUALITY, MAX_AVATAR_PIXELS, toResizedImage } from "@carlnotes/core/lib/imageUpload"
import { Camera } from "lucide-react"

export {
	AVATAR_ACCEPT,
	AVATAR_REJECTIONS,
	TEAM_AVATAR_UPLOAD_FAILED_TEXT,
	toAvatarRejectionText,
} from "@carlnotes/core/lib/imageUpload"

// the file size from which the decode asks the browser for a 512-pixel-wide bitmap
const MIN_AVATAR_BYTES_FOR_RESIZED_DECODE = 1024 * 1024

// a chosen file resized and ready to send, or one that could not be decoded or resized
export type UploadableAvatar = { status: "ready"; resizedAvatarFile: File } | { status: "undecodable" }

/**
 * Returns an avatar file resized to 512 pixels on its longest edge, a PNG for a source that can be transparent and a
 * JPEG for a photo, or undecodable.
 */
export async function toUploadableAvatar(avatarFile: File): Promise<UploadableAvatar> {
	// resize the file, and report one that could not be decoded or resized by its content type and byte size
	const resizedAvatarFile = await resizeAvatar(avatarFile).catch((error: unknown) => {
		console.error("avatar decode failed", error)
		return null
	})
	if (!resizedAvatarFile) {
		void sendAvatarDecodeFailure({ contentType: avatarFile.type, byteSize: avatarFile.size })
		return { status: "undecodable" }
	}
	return { status: "ready", resizedAvatarFile }
}

// decode a chosen file and resize it to the stored size, or null if the canvas or the encode failed
async function resizeAvatar(avatarFile: File): Promise<File | null> {
	// resize to the stored size. an image already smaller keeps its size, and a canvas with no 2d context fails
	const bitmap = await decodeAvatar(avatarFile)
	const resizedImage = toResizedImage({
		width: bitmap.width,
		height: bitmap.height,
		mimeType: avatarFile.type,
		maxPixels: MAX_AVATAR_PIXELS,
	})
	const canvas = document.createElement("canvas")
	canvas.width = resizedImage.width
	canvas.height = resizedImage.height
	const context = canvas.getContext("2d")
	if (!context) {
		bitmap.close()
		return null
	}
	context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
	bitmap.close()

	// re-encode, dropping the metadata: a png for a source that can be transparent, a jpeg for a photo.
	// a null blob means the encode failed
	const resizedBlob = await new Promise<Blob | null>((resolve) => {
		canvas.toBlob(resolve, resizedImage.mimeType, AVATAR_JPEG_QUALITY)
	})
	if (!resizedBlob) {
		return null
	}
	const resizedName = `${avatarFile.name.replace(/\.[^.]+$/, "")}.${resizedImage.suffix}`
	return new File([resizedBlob], resizedName, { type: resizedImage.mimeType })
}

// decode a chosen file with the orientation the camera recorded, 512 pixels wide if the file is large.
// a HEIC or HEIF file the browser rejects is decoded by the HEIC decoder, loaded only then
async function decodeAvatar(avatarFile: File): Promise<ImageBitmap> {
	// the decode options. a large file decodes 512 pixels wide with its height to match.
	// ponytail: a large file narrower than 512 pixels is upscaled here and scaled back on the canvas, a double resample.
	// reading the dimensions from the file header first would size the decode by the longest edge instead
	const decodeOptions: ImageBitmapOptions = {
		imageOrientation: "from-image",
		...(avatarFile.size >= MIN_AVATAR_BYTES_FOR_RESIZED_DECODE
			? { resizeWidth: MAX_AVATAR_PIXELS, resizeQuality: "high" }
			: {}),
	}

	// the browser's own decoder first, then the HEIC decoder for a HEIC file the browser rejected
	try {
		return await createImageBitmap(avatarFile, decodeOptions)
	} catch (error) {
		if (!isHeicFile(avatarFile)) {
			throw error
		}
		const { heicTo } = await import("heic-to")
		return heicTo({ blob: avatarFile, type: "bitmap", options: decodeOptions })
	}
}

// whether a chosen file is HEIC or HEIF, by its type or its extension
function isHeicFile(avatarFile: File): boolean {
	return /^image\/hei[cf]$/.test(avatarFile.type) || /\.hei[cf]$/i.test(avatarFile.name)
}

/**
 * The first image in a drag and drop, or null if nothing dropped was an image.
 * The file input's accept filter never sees a drag and drop, so every avatar drop target screens with this.
 */
export function toDroppedImage(files: File[]): File | null {
	return files.find((file) => file.type.startsWith("image/")) ?? null
}

/**
 * The drop overlay that every round avatar target shows: the camera on a darkened circle in a dashed ring.
 */
export function AvatarDropOverlay() {
	return (
		<span className="border-primary pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-full border-2 border-dashed bg-black/55">
			<Camera className="size-5 text-white" />
		</span>
	)
}
