import { Camera } from "lucide-react"

// what a rejected avatar upload says, shared by every avatar picker that sends one
export const AVATAR_REJECTIONS: Record<string, string> = {
	"too-large": "That image is over 2MB.",
	empty: "That file was empty.",
	"unsupported-type": "PNG, JPEG, WebP or GIF only.",
}

/**
 * The first image in a drag and drop, or null when nothing dropped was an image.
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
