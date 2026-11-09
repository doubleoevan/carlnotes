// the editor's image block, as both apps word and rule it: the labels, the count line, and the upload check

import type { ImageRegenerationQuota } from "@carlnotes/contracts/topicImages"
import { MAX_TOPIC_IMAGE_UPLOAD_BYTES, TOPIC_IMAGE_UPLOAD_TYPES } from "@carlnotes/contracts/topicImages"

// the block's labels
export const TOPIC_IMAGE_LABEL = "Image"
export const REGENERATE_LABEL = "Regenerate"
export const UPLOAD_LABEL = "Upload"
export const UPLOAD_IMAGE_LABEL = "Upload an image"
export const REMOVE_UPLOAD_LABEL = "Remove"
/**
 * Returns the key an editor mounts under, so a reload of the topic's count or image origin starts its own counts over.
 */
export function toTopicImageEditorKey(topic: {
	imageRegenerationQuota: { used: number } | null
	imageOrigin: string | null
}): string {
	return `${topic.imageRegenerationQuota?.used ?? "none"}:${topic.imageOrigin ?? "none"}`
}

// the image prompt's label, which its empty input shows too
export const TOPIC_IMAGE_PROMPT_LABEL = "Image prompt"

// the lines the block shows while a render runs, and after a render or a save fails
export const TOPIC_IMAGE_RENDERING_TEXT = "Drawing a new image. This takes about a minute."
export const TOPIC_IMAGE_RENDER_FAILED_TEXT = "The image didn't render. Try again."
export const TOPIC_IMAGE_SAVE_FAILED_TEXT = "The image didn't save."

// the rejection for an upload with the wrong type or an oversize file
const UPLOAD_TYPE_REJECTION = "The image must be a JPEG, PNG, or WebP."
const UPLOAD_SIZE_REJECTION = `The image must be ${MAX_TOPIC_IMAGE_UPLOAD_BYTES / (1024 * 1024)} MB or smaller.`

/**
 * Returns whether the editor has a regeneration left this month.
 */
export function hasRegenerationLeft(quota: ImageRegenerationQuota | null): boolean {
	return quota !== null && quota.used < quota.limit
}

/**
 * Returns the line under Regenerate: how many of the month's regenerations are used.
 */
export function toRegenerationCountLabel(quota: ImageRegenerationQuota): string {
	return `${quota.used} of ${quota.limit} used this month`
}

/**
 * Returns why a picked file cannot be uploaded, or null for a file the api takes.
 */
export function toUploadRejection(file: { size: number; type: string }): string | null {
	if (!(TOPIC_IMAGE_UPLOAD_TYPES as readonly string[]).includes(file.type)) {
		return UPLOAD_TYPE_REJECTION
	}
	return file.size > MAX_TOPIC_IMAGE_UPLOAD_BYTES ? UPLOAD_SIZE_REJECTION : null
}
