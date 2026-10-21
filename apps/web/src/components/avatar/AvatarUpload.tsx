import { sendAvatarDecodeFailure } from "@carlnotes/client/profileClient"
import { Camera } from "lucide-react"

// the file types an avatar chooser offers. heic and heif are what an iphone camera writes
export const AVATAR_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif"

// the longest edge a stored avatar keeps. an avatar renders at 64 pixels, and this leaves room for a retina screen
const MAX_AVATAR_PIXELS = 512

// the jpeg quality a resized photo re-encodes at
const AVATAR_JPEG_QUALITY = 0.85

// the source types whose pixels can be transparent. a logo in one of these re-encodes as png, so its background stays clear
const TRANSPARENT_IMAGE_TYPES = new Set(["image/png", "image/webp", "image/gif"])

// the file size from which the decode asks the browser for a 512-pixel-wide bitmap
const MIN_AVATAR_BYTES_FOR_RESIZED_DECODE = 1024 * 1024

// what a rejected avatar upload shows, shared by every avatar picker that sends one
export const AVATAR_REJECTIONS: Record<string, string> = {
	"too-large": "That image is over 2MB.",
	empty: "That file was empty.",
	"unsupported-type": "PNG, JPEG, WebP or GIF only.",
	undecodable: "That image couldn't be read. Try a JPEG or PNG.",
}

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
	const scale = Math.min(1, MAX_AVATAR_PIXELS / Math.max(bitmap.width, bitmap.height))
	const canvas = document.createElement("canvas")
	canvas.width = Math.round(bitmap.width * scale)
	canvas.height = Math.round(bitmap.height * scale)
	const context = canvas.getContext("2d")
	if (!context) {
		bitmap.close()
		return null
	}
	context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
	bitmap.close()

	// re-encode, dropping the metadata: a png for a source that can be transparent, a jpeg for a photo.
	// a null blob means the encode failed
	const isTransparencyKept = TRANSPARENT_IMAGE_TYPES.has(avatarFile.type)
	const resizedType = isTransparencyKept ? "image/png" : "image/jpeg"
	const resizedBlob = await new Promise<Blob | null>((resolve) => {
		canvas.toBlob(resolve, resizedType, AVATAR_JPEG_QUALITY)
	})
	if (!resizedBlob) {
		return null
	}
	const resizedName = `${avatarFile.name.replace(/\.[^.]+$/, "")}.${isTransparencyKept ? "png" : "jpg"}`
	return new File([resizedBlob], resizedName, { type: resizedType })
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
