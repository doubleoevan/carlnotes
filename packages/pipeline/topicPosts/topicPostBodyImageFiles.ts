// a Topic Post's body image files: the upload's type judged by its bytes, the pixel count checked before it decodes,
// the column copy re-encoded with no metadata, the sheets of frames the moderation screens, and where the files
// are stored

import {
	TOPIC_POST_BODY_IMAGE_FILES,
	TOPIC_POST_BODY_IMAGE_MAX_SIDE,
	type TopicPostBodyImageFile,
} from "@carlnotes/contracts/topicPostBodyImages"
import { TOPIC_POST_COLUMN_WIDTH } from "@carlnotes/contracts/topicPosts"
import { recordPendingObjectDeletionBeforeUpload, uploadAttachment } from "@carlnotes/db/store"
import { createConcurrencyLimiter } from "@carlnotes/server/concurrency"
import sharp from "sharp"
import { DERIVED_WEBP_QUALITY, MAX_IMAGE_INPUT_PIXELS, toTopicImageUploadType } from "../topicImages/topicImageFiles"
import { toUprightImageSize } from "../uprightImageSize"

// the types a body image upload may be, judged by its bytes
export type TopicPostBodyImageUploadType = "image/jpeg" | "image/png" | "image/webp" | "image/gif"

// the most uploads that encode at once in this process, so a burst of large photos never holds every image thread
const runImageWork = createConcurrencyLimiter(2)

// the largest side of a still's moderation copy, and of each frame on an animation's sheet. a smaller copy costs less
// to send and classifies the same
const MODERATION_STILL_TILE_SIDE = 512
const MODERATION_ANIMATION_TILE_SIDE = 256

// the frames on one moderation sheet, and the most frames an animation may have, so every frame is screened in at most
// eight sheets
const MODERATION_SHEET_FRAME_COUNT = 16
export const ANIMATION_FRAME_LIMIT = 128

// a body image ready to store: each file's bytes, the column copy's pixel size, and the jpeg sheets of frames the
// moderation screens
export type TopicPostBodyImage = {
	files: Record<TopicPostBodyImageFile, Uint8Array>
	width: number
	height: number
	moderationJpegs: Uint8Array[]
}

// why a body image is rejected: bytes of no allowed type, or more pixels than the limit
export type TopicPostBodyImageRejection = "unsupported-type" | "too-large"

/**
 * Returns the upload type an image's first bytes say it is, or null for bytes that are not a jpeg, a png, a webp, or a
 * gif. An svg is text, so it is never one of them.
 */
export function toTopicPostBodyImageUploadType(imageBytes: Uint8Array): TopicPostBodyImageUploadType | null {
	// a gif's signature, either version, then the types a topic image upload takes
	const signature = new TextDecoder().decode(imageBytes.subarray(0, 6))
	return signature === "GIF87a" || signature === "GIF89a" ? "image/gif" : toTopicImageUploadType(imageBytes)
}

/**
 * Returns an upload's files: re-encoded as webp with no metadata, animated if the source is, upright, and a column
 * copy at twice the reading column's width, never enlarged. Returns a rejection for bytes of no allowed type or a file
 * that does not decode whole, and for an image whose pixels over every frame pass the limit, which is read from its
 * header before anything decodes.
 */
export async function toTopicPostBodyImage(
	imageBytes: Uint8Array,
): Promise<TopicPostBodyImage | { rejection: TopicPostBodyImageRejection }> {
	// the type by the bytes
	if (!toTopicPostBodyImageUploadType(imageBytes)) {
		return { rejection: "unsupported-type" }
	}

	// the header alone, which decodes no pixels
	const metadata = await sharp(imageBytes, { animated: true, limitInputPixels: false })
		.metadata()
		.catch(() => null)
	if (!metadata?.width || !metadata.height) {
		return { rejection: "unsupported-type" }
	}

	// every frame's pixels count, so a long animation of small frames is as large as one huge still, and an animation
	// has no more frames than the moderation screens
	const frameCount = metadata.pages ?? 1
	const frameHeight = metadata.pageHeight ?? metadata.height
	if (metadata.width * frameHeight * frameCount > MAX_IMAGE_INPUT_PIXELS || frameCount > ANIMATION_FRAME_LIMIT) {
		return { rejection: "too-large" }
	}

	// the encode and the moderation's frames, a few uploads at a time, and a broken file is no image
	return runImageWork(() =>
		toEncodedBodyImage(imageBytes, { frameCount, hasAlpha: metadata.hasAlpha === true }).catch(() => ({
			rejection: "unsupported-type" as const,
		})),
	)
}

// the image's frame count and whether it has transparency, read from its header
type BodyImageHeader = { frameCount: number; hasAlpha: boolean }

// the column copy, re-encoded, which drops every piece of metadata, and the moderation's sheets
async function toEncodedBodyImage(
	imageBytes: Uint8Array,
	{ frameCount, hasAlpha }: BodyImageHeader,
): Promise<TopicPostBodyImage> {
	// upright, shrunk to fit twice the column's width and the tallest side a body may name, never enlarged
	const { data: columnBytes, info: columnInfo } = await sharp(imageBytes, {
		animated: true,
		limitInputPixels: MAX_IMAGE_INPUT_PIXELS,
	})
		.rotate()
		.resize({
			width: TOPIC_POST_COLUMN_WIDTH * 2,
			height: TOPIC_POST_BODY_IMAGE_MAX_SIDE,
			fit: "inside",
			withoutEnlargement: true,
		})
		.webp({ quality: DERIVED_WEBP_QUALITY })
		.toBuffer({ resolveWithObject: true })

	// the column copy's size as it shows: one frame's height, upright
	const columnSize = toUprightImageSize({ width: columnInfo.width, height: columnInfo.pageHeight ?? columnInfo.height })
	return {
		files: { "column.webp": new Uint8Array(columnBytes) },
		width: columnSize.width,
		height: columnSize.height,
		moderationJpegs: await toModerationJpegs(imageBytes, { frameCount, hasAlpha }),
	}
}

// the jpegs the moderation screens: every frame, sixteen to a sheet, on white, and on black too where the image is
// transparent, so content that only one background shows is screened
async function toModerationJpegs(
	imageBytes: Uint8Array,
	{ frameCount, hasAlpha }: BodyImageHeader,
): Promise<Uint8Array[]> {
	// every frame decoded once, upright, each no larger than its tile
	const tileSide = frameCount > 1 ? MODERATION_ANIMATION_TILE_SIDE : MODERATION_STILL_TILE_SIDE
	const { data: frameBytes, info } = await sharp(imageBytes, {
		animated: true,
		limitInputPixels: MAX_IMAGE_INPUT_PIXELS,
	})
		.rotate()
		.resize({ width: tileSide, height: tileSide, fit: "inside", withoutEnlargement: true })
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true })

	// each frame's pixels, and the sheets of frames they fill
	const frameHeight = info.pageHeight ?? info.height
	const frameByteCount = info.width * frameHeight * 4
	const sheetFrameStarts = Array.from(
		{ length: Math.ceil(frameCount / MODERATION_SHEET_FRAME_COUNT) },
		(_, i) => i * MODERATION_SHEET_FRAME_COUNT,
	)
	const backgrounds = hasAlpha ? ["#ffffff", "#000000"] : ["#ffffff"]
	const sheetJpegs = sheetFrameStarts.flatMap((sheetFrameStart) => {
		// the sheet's frames laid out in a square grid
		const sheetFrameCount = Math.min(MODERATION_SHEET_FRAME_COUNT, frameCount - sheetFrameStart)
		const columnCount = Math.ceil(Math.sqrt(sheetFrameCount))
		const frameTiles = Array.from({ length: sheetFrameCount }, (_, i) => ({
			input: frameBytes.subarray((sheetFrameStart + i) * frameByteCount, (sheetFrameStart + i + 1) * frameByteCount),
			raw: { width: info.width, height: frameHeight, channels: 4 as const, premultiplied: info.premultiplied },
			left: (i % columnCount) * info.width,
			top: Math.floor(i / columnCount) * frameHeight,
		}))

		// one sheet for each background the image may show on
		const sheetSize = {
			width: info.width * columnCount,
			height: frameHeight * Math.ceil(sheetFrameCount / columnCount),
		}
		return backgrounds.map((background) =>
			sharp({ create: { ...sheetSize, channels: 3, background } })
				.composite(frameTiles)
				.jpeg()
				.toBuffer(),
		)
	})
	return (await Promise.all(sheetJpegs)).map((sheetJpeg) => new Uint8Array(sheetJpeg))
}

/**
 * Returns the object key of one file of a Topic Post's body image.
 */
export function toTopicPostBodyImageFileKey(
	topicPostId: string,
	imageId: string,
	file: TopicPostBodyImageFile,
): string {
	return `topic-post-body-images/${topicPostId}/${imageId}/${file}`
}

/**
 * Returns the object keys of every file of a Topic Post's body image.
 */
export function toTopicPostBodyImageObjectKeys(topicPostId: string, imageId: string): string[] {
	return TOPIC_POST_BODY_IMAGE_FILES.map((file) => toTopicPostBodyImageFileKey(topicPostId, imageId, file))
}

/**
 * Returns the key prefix every body image of a Topic Post is stored after.
 */
export function toTopicPostBodyImageKeyPrefix(topicPostId: string): string {
	return `topic-post-body-images/${topicPostId}/`
}

// the post and the image a store names, and the files it writes
type StoreTopicPostBodyImageOptions = { topicPostId: string; imageId: string; files: TopicPostBodyImage["files"] }

/**
 * Stores a body image's files, each first recorded as a pending deletion that the sweep tries after the upload grace,
 * so an image the post never saves is deleted. A save that names the image clears those records.
 */
export async function storeTopicPostBodyImage({
	topicPostId,
	imageId,
	files,
}: StoreTopicPostBodyImageOptions): Promise<void> {
	// each file's pending deletion goes in before its bytes, so no stored file is ever unrecorded
	for (const file of TOPIC_POST_BODY_IMAGE_FILES) {
		const objectKey = toTopicPostBodyImageFileKey(topicPostId, imageId, file)
		await recordPendingObjectDeletionBeforeUpload(objectKey)
		await uploadAttachment(objectKey, files[file], "image/webp")
	}
}
