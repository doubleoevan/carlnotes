// the file types an avatar chooser offers. heic and heif are what an iphone camera writes
export const AVATAR_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif"

// the longest edge a stored avatar keeps. an avatar renders at 64 pixels, and this leaves room for a retina screen
export const MAX_AVATAR_PIXELS = 512

// the jpeg quality a resized photo re-encodes at
export const AVATAR_JPEG_QUALITY = 0.85

// the source types whose pixels can be transparent. a logo in one of these re-encodes as png, so its background stays clear
export const TRANSPARENT_IMAGE_TYPES = new Set(["image/png", "image/webp", "image/gif"])

// what a rejected avatar upload shows, shared by every avatar picker that sends one
export const AVATAR_REJECTIONS: Record<string, string> = {
	"too-large": "That image is over 2MB.",
	empty: "That file was empty.",
	"unsupported-type": "PNG, JPEG, WebP or GIF only.",
	undecodable: "That image couldn't be read. Try a JPEG or PNG.",
}

// the feedback for a failed upload without an api rejection reason
export const AVATAR_UPLOAD_FAILED_TEXT = "That didn't reach Carl. Try again."
