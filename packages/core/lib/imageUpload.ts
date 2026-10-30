// the rules a picked image follows before it uploads: the types an avatar takes, the size an avatar or an attached photo
// resizes to, and the format it re-encodes as

import { isModerationRejectionMessage } from "@carlnotes/contracts/moderation"

// the file types an avatar chooser offers. heic and heif are what an iphone camera writes
export const AVATAR_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif"

// the longest edge a stored avatar keeps. an avatar renders at 64 pixels, and this leaves room for a retina screen
export const MAX_AVATAR_PIXELS = 512

// the longest edge a photo attached to chat or a topic keeps. a camera photo stays legible and far under the chat
// image limit
export const MAX_ATTACHMENT_IMAGE_PIXELS = 2048

// what a user is told about an image that can't be decoded
export const UNREADABLE_IMAGE_TEXT = "That image couldn't be read. Try a JPEG or PNG."

// the jpeg quality a resized photo re-encodes at
export const AVATAR_JPEG_QUALITY = 0.85

// the source types whose pixels can be transparent. a logo in one of these re-encodes as png, so its background stays clear
export const TRANSPARENT_IMAGE_TYPES = new Set(["image/png", "image/webp", "image/gif"])

// the size and format a picked image re-encodes to, and its type and file suffix
export type ResizedImage = {
	width: number
	height: number
	isTransparencyKept: boolean
	mimeType: "image/png" | "image/jpeg"
	suffix: "png" | "jpg"
}

/**
 * Returns the size a picked image resizes to, no longer than the longest edge allowed and never enlarged, and its
 * format: a png for a source that can be transparent, a jpeg for every other source.
 */
export function toResizedImage({
	width,
	height,
	mimeType,
	maxPixels,
}: {
	width: number
	height: number
	mimeType: string
	maxPixels: number
}): ResizedImage {
	// scale down to the longest edge allowed, keeping at least one pixel on each edge
	const scale = Math.min(1, maxPixels / Math.max(width, height))
	const isTransparencyKept = TRANSPARENT_IMAGE_TYPES.has(mimeType)
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
		isTransparencyKept,
		mimeType: isTransparencyKept ? "image/png" : "image/jpeg",
		suffix: isTransparencyKept ? "png" : "jpg",
	}
}

// what a rejected avatar upload shows, shared by every avatar picker that sends one
export const AVATAR_REJECTIONS: Record<string, string> = {
	"too-large": "That image is over 2MB.",
	empty: "That file was empty.",
	"unsupported-type": "PNG, JPEG, WebP or GIF only.",
	undecodable: UNREADABLE_IMAGE_TEXT,
}

// the feedback for a failed upload without an api rejection reason
export const AVATAR_UPLOAD_FAILED_TEXT = "That didn't reach Carl. Try again."

// the feedback for a team avatar upload that failed without an api rejection reason
export const TEAM_AVATAR_UPLOAD_FAILED_TEXT = "That image didn't reach Carl. Try again."

/**
 * Returns what a rejected avatar upload shows: the rule it broke, Carl's rejection of an image others may not see, or
 * the fallback text.
 */
export function toAvatarRejectionText(rejection: string, fallbackText: string): string {
	return AVATAR_REJECTIONS[rejection] ?? (isModerationRejectionMessage(rejection) ? rejection : fallbackText)
}
