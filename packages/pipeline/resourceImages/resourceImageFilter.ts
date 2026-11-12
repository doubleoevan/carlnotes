// the filter a Resource's images pass before a film shows them: a photo or an illustration, of a size and a shape the
// film's frame can hold, and one copy of each picture. a kept image is stored as a jpeg within twice the frame

import sharp from "sharp"
import { VIDEO_HEIGHT, VIDEO_WIDTH } from "../topicPodcastEpisodeVideo/videoFrames"
import { toUprightImageSize } from "../uprightImageSize"

// how many images a Resource keeps
export const RESOURCE_IMAGE_LIMIT = 6

// the box a stored image fits inside: twice the film's frame, so a zoom to 2 times stays sharp
const RESOURCE_IMAGE_STORED_WIDTH = VIDEO_WIDTH * 2
const RESOURCE_IMAGE_STORED_HEIGHT = VIDEO_HEIGHT * 2

// the image formats a film shows, as sharp names them. heif is avif's container
const RESOURCE_IMAGE_FORMATS = new Set(["jpeg", "png", "webp", "heif"])

// the share of the film's frame an image covers at least, at its own size or fitted inside the frame
const MINIMUM_FRAME_SHARE = 1 / 3

// the shapes the frame can hold, as width over height: from a 2:3 portrait to a 21:9 banner
const MIN_ASPECT_RATIO = 2 / 3
const MAX_ASPECT_RATIO = 21 / 9

// a difference hash is 8 rows of 8 bits, read from a 9 by 8 gray copy of the image's 16:9 center. two images whose
// hashes differ by this many bits or fewer show the same picture
const DIFFERENCE_HASH_WIDTH = 9
const DIFFERENCE_HASH_HEIGHT = 8
const COPY_DIFFERENCE_BITS = 6

// the largest image the filter decodes, and the quality of the jpeg it stores
const MAX_INPUT_PIXELS = 40_000_000
const STORED_JPEG_QUALITY = 85

// one fetched image: where it came from, its bytes, and whether it is its page's link preview image
export type ResourceImageCandidate = { sourceUrl: string; imageBytes: Uint8Array; isLinkPreviewImage: boolean }

// one image the filter kept: the candidate with its own pixel size, turned upright, and its difference hash
export type KeptResourceImage = ResourceImageCandidate & { width: number; height: number; differenceHash: string }

// a kept image as it is stored: a jpeg and its pixel size
export type StoredResourceImageJpeg = { jpegBytes: Uint8Array; width: number; height: number }

/**
 * Returns the kept images with one more candidate filtered in. A candidate that cannot be decoded, is not a photo or
 * illustration type, covers too little of the frame, or has a shape the frame cannot hold is left out. A copy of a kept
 * picture takes that picture's place if it is larger. A new picture goes last, or first if it is the link preview
 * image.
 */
export async function addResourceImage(
	keptResourceImages: KeptResourceImage[],
	candidate: ResourceImageCandidate,
): Promise<KeptResourceImage[]> {
	// leave out an image that cannot be read or that the frame cannot hold
	const resourceImage = await readResourceImage(candidate)
	if (!resourceImage || !isFrameSized(resourceImage) || !hasFrameAspectRatio(resourceImage)) {
		return keptResourceImages
	}

	// find a kept image that shows the same picture
	const copyIndex = keptResourceImages.findIndex(
		(keptResourceImage) =>
			toDifferenceBitCount(keptResourceImage.differenceHash, resourceImage.differenceHash) <= COPY_DIFFERENCE_BITS,
	)
	const keptCopy = keptResourceImages[copyIndex]

	// a new picture goes last, or first if it is the link preview image
	if (!keptCopy) {
		return resourceImage.isLinkPreviewImage
			? [resourceImage, ...keptResourceImages]
			: [...keptResourceImages, resourceImage]
	}

	// of two copies keep the larger at the kept one's place, as the link preview image if either copy is
	const largerCopy =
		resourceImage.width * resourceImage.height > keptCopy.width * keptCopy.height ? resourceImage : keptCopy
	const mergedCopy = {
		...largerCopy,
		isLinkPreviewImage: keptCopy.isLinkPreviewImage || resourceImage.isLinkPreviewImage,
	}
	return keptResourceImages.map((keptResourceImage, i) => (i === copyIndex ? mergedCopy : keptResourceImage))
}

/**
 * Returns an image as the jpeg a Resource stores: upright, over white if it has transparency, and fitted inside 2560
 * by 1440 without being enlarged.
 */
export async function toStoredResourceImageJpeg(imageBytes: Uint8Array): Promise<StoredResourceImageJpeg> {
	// turn the image upright, fit it inside the stored box, and encode it
	const { data, info } = await sharp(imageBytes, { limitInputPixels: MAX_INPUT_PIXELS })
		.rotate()
		.flatten({ background: "#ffffff" })
		.resize(RESOURCE_IMAGE_STORED_WIDTH, RESOURCE_IMAGE_STORED_HEIGHT, { fit: "inside", withoutEnlargement: true })
		.jpeg({ quality: STORED_JPEG_QUALITY, mozjpeg: true })
		.toBuffer({ resolveWithObject: true })
	return { jpegBytes: new Uint8Array(data), width: info.width, height: info.height }
}

// read a candidate's format, upright pixel size, and difference hash, or null for bytes that are not an image a film
// shows
async function readResourceImage(candidate: ResourceImageCandidate): Promise<KeptResourceImage | null> {
	try {
		// only a photo or illustration type is read further
		const image = sharp(candidate.imageBytes, { limitInputPixels: MAX_INPUT_PIXELS })
		const metadata = await image.metadata()
		const uprightSize = toUprightImageSize(metadata)
		const isEmpty = uprightSize.width === 0 || uprightSize.height === 0
		if (!metadata.format || !RESOURCE_IMAGE_FORMATS.has(metadata.format) || isEmpty) {
			return null
		}

		// the hash is read from the upright picture
		const differenceHash = await toDifferenceHash(candidate.imageBytes, uprightSize)
		return { ...candidate, ...uprightSize, differenceHash }
	} catch {
		return null
	}
}

// an image's pixel size
type ImageSize = { width: number; height: number }

// whether an image covers enough of the film's frame, at its own size or fitted inside the frame if it is larger
function isFrameSized({ width, height }: ImageSize): boolean {
	const frameFit = Math.min(1, VIDEO_WIDTH / width, VIDEO_HEIGHT / height)
	const shownPixelCount = width * frameFit * height * frameFit
	return shownPixelCount >= VIDEO_WIDTH * VIDEO_HEIGHT * MINIMUM_FRAME_SHARE
}

// whether an image's shape is one the film's frame can hold
function hasFrameAspectRatio({ width, height }: ImageSize): boolean {
	const shape = width / height
	return shape >= MIN_ASPECT_RATIO && shape <= MAX_ASPECT_RATIO
}

// an image's difference hash: one bit for each pixel of a small gray copy of its 16:9 center, set if the pixel is
// brighter than the one to its right. a resized copy of a picture gets nearly the same bits
async function toDifferenceHash(imageBytes: Uint8Array, { width, height }: ImageSize): Promise<string> {
	// the image's center at the film's shape
	const centerWidth = Math.min(width, Math.round((height * VIDEO_WIDTH) / VIDEO_HEIGHT))
	const centerHeight = Math.min(height, Math.round((width * VIDEO_HEIGHT) / VIDEO_WIDTH))
	const center = {
		left: Math.floor((width - centerWidth) / 2),
		top: Math.floor((height - centerHeight) / 2),
		width: centerWidth,
		height: centerHeight,
	}

	// the center as 9 by 8 gray pixels, over white if the image has transparency
	const grayPixels = await sharp(imageBytes, { limitInputPixels: MAX_INPUT_PIXELS })
		.rotate()
		.extract(center)
		.flatten({ background: "#ffffff" })
		.resize(DIFFERENCE_HASH_WIDTH, DIFFERENCE_HASH_HEIGHT, { fit: "fill" })
		.greyscale()
		.raw()
		.toBuffer()

	// read the pixels row by row
	let differenceHash = ""
	for (let row = 0; row < DIFFERENCE_HASH_HEIGHT; row++) {
		for (let column = 0; column < DIFFERENCE_HASH_WIDTH - 1; column++) {
			// compare each pixel with the one to its right
			const pixel = grayPixels[row * DIFFERENCE_HASH_WIDTH + column] ?? 0
			const rightPixel = grayPixels[row * DIFFERENCE_HASH_WIDTH + column + 1] ?? 0
			differenceHash += pixel > rightPixel ? "1" : "0"
		}
	}
	return differenceHash
}

// how many bits two difference hashes differ by
function toDifferenceBitCount(firstDifferenceHash: string, secondDifferenceHash: string): number {
	// count the places where the two hashes hold different bits
	let differenceBitCount = 0
	for (let i = 0; i < firstDifferenceHash.length; i++) {
		if (firstDifferenceHash[i] !== secondDifferenceHash[i]) {
			differenceBitCount++
		}
	}
	return differenceBitCount
}
