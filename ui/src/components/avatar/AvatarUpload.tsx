import { Camera } from "lucide-react"

// the file types an avatar chooser offers. heic and heif are what an iphone camera writes
export const AVATAR_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif"

// the longest edge a stored avatar keeps. an avatar renders at 64 pixels, and this leaves room for a retina screen
const MAX_AVATAR_PIXELS = 512

// the jpeg quality a resized avatar re-encodes at
const AVATAR_JPEG_QUALITY = 0.85

// what a rejected avatar upload shows, shared by every avatar picker that sends one
export const AVATAR_REJECTIONS: Record<string, string> = {
	"too-large": "That image is over 2MB.",
	empty: "That file was empty.",
	"unsupported-type": "PNG, JPEG, WebP or GIF only.",
}

/**
 * An avatar file cut down to what the app stores: the longest edge at 512 pixels, re-encoded as JPEG
 * with its EXIF orientation applied. A file the browser cannot decode comes back unchanged.
 */
export async function toUploadableAvatar(avatarFile: File): Promise<File> {
	try {
		// decode with the orientation the camera recorded
		const bitmap = await createImageBitmap(avatarFile, { imageOrientation: "from-image" })

		// the scale that puts the longest edge at the limit. an image already smaller keeps its size
		const scale = Math.min(1, MAX_AVATAR_PIXELS / Math.max(bitmap.width, bitmap.height))
		const width = Math.round(bitmap.width * scale)
		const height = Math.round(bitmap.height * scale)

		// draw it down and re-encode. a canvas with no context means nothing can be drawn
		const canvas = document.createElement("canvas")
		canvas.width = width
		canvas.height = height
		const context = canvas.getContext("2d")
		if (!context) {
			return avatarFile
		}
		context.drawImage(bitmap, 0, 0, width, height)
		bitmap.close()

		// toBlob answers on a callback. a null blob means the encode failed
		const resizedBlob = await new Promise<Blob | null>((resolve) => {
			canvas.toBlob(resolve, "image/jpeg", AVATAR_JPEG_QUALITY)
		})
		if (!resizedBlob) {
			return avatarFile
		}
		return new File([resizedBlob], `${avatarFile.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" })
	} catch (error) {
		// a file the browser cannot decode comes back unchanged
		console.error("avatar resize failed", error)
		return avatarFile
	}
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
