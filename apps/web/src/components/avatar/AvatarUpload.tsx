import { sendAvatarDecodeFailure } from "@carlnotes/client/profileClient"
import { MAX_AVATAR_PIXELS } from "@carlnotes/core/lib/imageUpload"
import { Camera } from "lucide-react"
import { resizeImageFile } from "@/lib/imageResize"

export {
	AVATAR_REJECTIONS,
	PICKED_IMAGE_ACCEPT,
	TEAM_AVATAR_UPLOAD_FAILED_TEXT,
	toAvatarRejectionText,
} from "@carlnotes/core/lib/imageUpload"

// a chosen file resized and ready to send, or one that could not be decoded or resized
export type UploadableAvatar = { status: "ready"; resizedAvatarFile: File } | { status: "undecodable" }

/**
 * Returns an avatar file resized to 512 pixels on its longest edge, a PNG for a source that can be transparent and a
 * JPEG for a photo, or undecodable.
 */
export async function toUploadableAvatar(avatarFile: File): Promise<UploadableAvatar> {
	// resize the file, and report one that could not be decoded or resized by its content type and byte size
	const resizedAvatarFile = await resizeImageFile(avatarFile, MAX_AVATAR_PIXELS).catch((error: unknown) => {
		console.error("avatar decode failed", error)
		return null
	})
	if (!resizedAvatarFile) {
		void sendAvatarDecodeFailure({ contentType: avatarFile.type, byteSize: avatarFile.size })
		return { status: "undecodable" }
	}
	return { status: "ready", resizedAvatarFile }
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
