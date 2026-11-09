// a topic image's files: the original at 3:2, the six derived sizes, their object keys, and the store that writes them

import { createHash } from "node:crypto"
import { type TopicImageSize, topicImageSizes } from "@carlnotes/contracts/enums"
import {
	TOPIC_IMAGE_DENSITIES,
	TOPIC_IMAGE_ORIGINAL_HEIGHT,
	TOPIC_IMAGE_ORIGINAL_WIDTH,
	TOPIC_IMAGE_PIXELS,
	type TOPIC_IMAGE_UPLOAD_TYPES,
	type TopicImageDensity,
	toTopicImageFileName,
} from "@carlnotes/contracts/topicImages"
import { uploadAttachment } from "@carlnotes/db/store"
import sharp from "sharp"

// the jpeg quality of a stored original and the webp quality of a derived file
const ORIGINAL_JPEG_QUALITY = 90
const DERIVED_WEBP_QUALITY = 82

// the file name of the stored original
const ORIGINAL_FILE_NAME = "original.jpg"

// a stored original: its jpeg bytes and its pixel size
export type TopicImageOriginal = { jpegBytes: Uint8Array; width: number; height: number }

// one derived file: its name, its bytes, and the size and density it is at
export type TopicImageFile = { fileName: string; bytes: Uint8Array; size: TopicImageSize; density: TopicImageDensity }

/**
 * Returns the upload type an image's first bytes say it is, or null for bytes that are not a jpeg, a png, or a webp.
 */
export function toTopicImageUploadType(imageBytes: Uint8Array): (typeof TOPIC_IMAGE_UPLOAD_TYPES)[number] | null {
	// each type's magic bytes: jpeg's marker, png's signature, and webp's RIFF container with its form type
	const isJpeg = imageBytes[0] === 0xff && imageBytes[1] === 0xd8 && imageBytes[2] === 0xff
	const isPng = imageBytes[0] === 0x89 && imageBytes[1] === 0x50 && imageBytes[2] === 0x4e && imageBytes[3] === 0x47
	const isWebp =
		new TextDecoder().decode(imageBytes.subarray(0, 4)) === "RIFF" &&
		new TextDecoder().decode(imageBytes.subarray(8, 12)) === "WEBP"
	return isJpeg ? "image/jpeg" : isPng ? "image/png" : isWebp ? "image/webp" : null
}

/**
 * Returns the original an image's bytes make: center-cropped to 3:2, resized to the original's size, every piece of
 * metadata stripped, and encoded as a jpeg. A render's output and an upload take the same path.
 */
// the most pixels an upload or a render may decode to: a 40 megapixel photo passes, and a small file that unpacks
// to a huge bitmap is rejected before it costs memory
const MAX_IMAGE_INPUT_PIXELS = 40_000_000

export async function toTopicImageOriginal(imageBytes: Uint8Array): Promise<TopicImageOriginal> {
	// sharp's cover fit crops the center to the ratio and resizes in one pass, and a fresh encode keeps no metadata
	const { data, info } = await sharp(imageBytes, { limitInputPixels: MAX_IMAGE_INPUT_PIXELS })
		.rotate()
		.resize(TOPIC_IMAGE_ORIGINAL_WIDTH, TOPIC_IMAGE_ORIGINAL_HEIGHT, { fit: "cover", position: "centre" })
		.jpeg({ quality: ORIGINAL_JPEG_QUALITY, mozjpeg: true })
		.toBuffer({ resolveWithObject: true })
	return { jpegBytes: new Uint8Array(data), width: info.width, height: info.height }
}

/**
 * Returns the six derived files of an original: each size at 1x and 2x, as webp.
 */
export async function toTopicImageFiles(originalJpeg: Uint8Array): Promise<TopicImageFile[]> {
	const derivedFiles: TopicImageFile[] = []
	for (const size of topicImageSizes) {
		for (const density of TOPIC_IMAGE_DENSITIES) {
			// each file is the original resized to the size's pixels times the density
			const { width, height } = TOPIC_IMAGE_PIXELS[size]
			const bytes = await sharp(originalJpeg)
				.resize(width * density, height * density, { fit: "cover" })
				.webp({ quality: DERIVED_WEBP_QUALITY })
				.toBuffer()
			// the file is named by its size and density
			derivedFiles.push({ fileName: toTopicImageFileName(size, density), bytes: new Uint8Array(bytes), size, density })
		}
	}
	return derivedFiles
}

/**
 * Returns the mean brightness, from 0 for black to 1 for white, of a horizontal strip of an image, given as the
 * strip's top and its height in fractions of the image's height.
 */
export async function toImageStripBrightness(
	imageBytes: Uint8Array,
	{ topFraction, heightFraction }: { topFraction: number; heightFraction: number },
): Promise<number> {
	// the strip's pixel rows, inside the image
	const image = sharp(imageBytes)
	const { width = 1, height = 1 } = await image.metadata()
	const top = Math.min(height - 1, Math.round(height * topFraction))
	const stripHeight = Math.max(1, Math.min(height - top, Math.round(height * heightFraction)))

	// the strip in grey, averaged
	const { channels } = await image.extract({ left: 0, top, width, height: stripHeight }).greyscale().stats()
	return (channels[0]?.mean ?? 0) / 255
}

/**
 * Returns an original at the given 3:2 size as a jpeg.
 */
export async function toTopicImageCardJpeg(
	originalJpeg: Uint8Array,
	width: number,
	height: number,
): Promise<Uint8Array> {
	const cardJpeg = await sharp(originalJpeg)
		.resize(width, height, { fit: "cover", position: "centre" })
		.jpeg({ quality: ORIGINAL_JPEG_QUALITY })
		.toBuffer()
	return new Uint8Array(cardJpeg)
}

/**
 * Returns the content hash an original is stored under: the sha256 of its bytes as 32 hex characters.
 */
export function toTopicImageHash(originalJpeg: Uint8Array): string {
	return createHash("sha256").update(originalJpeg).digest("hex").slice(0, 32)
}

/**
 * Returns the object key folder of a topic image, which holds its original and its derived files.
 */
function toTopicImageKeyPrefix(topicId: string, hash: string): string {
	return `topic-images/${topicId}/${hash}`
}

/**
 * Returns the object key folder of a podcast episode's image, which holds the same files as a topic image.
 */
function toPodcastEpisodeImageKeyPrefix(podcastEpisodeId: string, hash: string): string {
	return `podcast-episode-images/${podcastEpisodeId}/${hash}`
}

/**
 * Returns the object key of one derived file of a podcast episode's image.
 */
export function toPodcastEpisodeImageFileKey(podcastEpisodeId: string, hash: string, fileName: string): string {
	return `${toPodcastEpisodeImageKeyPrefix(podcastEpisodeId, hash)}/${fileName}`
}

/**
 * Returns the object key of a podcast episode image's original.
 */
export function toPodcastEpisodeImageOriginalKey(podcastEpisodeId: string, hash: string): string {
	return `${toPodcastEpisodeImageKeyPrefix(podcastEpisodeId, hash)}/${ORIGINAL_FILE_NAME}`
}

/**
 * Stores a podcast episode image's original and its six derived files under the original's content hash, and returns
 * the hash.
 */
export function storePodcastEpisodeImageFiles(podcastEpisodeId: string, original: TopicImageOriginal): Promise<string> {
	return storeImageFiles(original, (hash) => toPodcastEpisodeImageKeyPrefix(podcastEpisodeId, hash))
}

/**
 * Returns the object key of a topic image's original.
 */
export function toTopicImageOriginalKey(topicId: string, hash: string): string {
	return `${toTopicImageKeyPrefix(topicId, hash)}/${ORIGINAL_FILE_NAME}`
}

/**
 * Returns the object key of one derived file of a topic image.
 */
export function toTopicImageFileKey(topicId: string, hash: string, fileName: string): string {
	return `${toTopicImageKeyPrefix(topicId, hash)}/${fileName}`
}

/**
 * Returns every object key a topic image holds: its original and its six derived files.
 */
export function toTopicImageObjectKeys(topicId: string, hash: string): string[] {
	return toImageObjectKeys(toTopicImageKeyPrefix(topicId, hash))
}

/**
 * Returns every object key a podcast episode image holds: its original and its six derived files.
 */
export function toPodcastEpisodeImageObjectKeys(podcastEpisodeId: string, hash: string): string[] {
	return toImageObjectKeys(toPodcastEpisodeImageKeyPrefix(podcastEpisodeId, hash))
}

// the original, then each size at each density, under one image's key prefix
function toImageObjectKeys(keyPrefix: string): string[] {
	const fileNames = topicImageSizes.flatMap((size) =>
		TOPIC_IMAGE_DENSITIES.map((density) => toTopicImageFileName(size, density)),
	)
	return [`${keyPrefix}/${ORIGINAL_FILE_NAME}`, ...fileNames.map((fileName) => `${keyPrefix}/${fileName}`)]
}

/**
 * Stores an original and its six derived files under the original's content hash, and returns the hash.
 */
export function storeTopicImageFiles(topicId: string, original: TopicImageOriginal): Promise<string> {
	return storeImageFiles(original, (hash) => toTopicImageKeyPrefix(topicId, hash))
}

// derive the files, then write the original and every file into the folder named by the hash
async function storeImageFiles(original: TopicImageOriginal, toKeyPrefix: (hash: string) => string): Promise<string> {
	const hash = toTopicImageHash(original.jpegBytes)
	const keyPrefix = toKeyPrefix(hash)
	const derivedFiles = await toTopicImageFiles(original.jpegBytes)
	await Promise.all([
		uploadAttachment(`${keyPrefix}/${ORIGINAL_FILE_NAME}`, original.jpegBytes, "image/jpeg"),
		uploadDerivedImageFiles((fileName) => `${keyPrefix}/${fileName}`, derivedFiles),
	])
	return hash
}

/**
 * Writes derived files as webp, each at the object key the function names for its file name.
 */
export async function uploadDerivedImageFiles(
	toKey: (fileName: string) => string,
	derivedFiles: TopicImageFile[],
): Promise<void> {
	await Promise.all(
		derivedFiles.map((derivedFile) => uploadAttachment(toKey(derivedFile.fileName), derivedFile.bytes, "image/webp")),
	)
}
