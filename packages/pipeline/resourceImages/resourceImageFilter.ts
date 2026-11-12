// the filter a Resource's images pass before a film shows them: a photo or an illustration of enough colors, at least
// 200 pixels a side, of a shape the film's frame can hold, and one copy of each picture. a kept image is stored as a
// jpeg within twice the frame

import sharp from "sharp"
import { VIDEO_HEIGHT, VIDEO_WIDTH } from "../topicPodcastEpisodeVideo/videoFrames"
import { toUprightImageSize } from "../uprightImageSize"

// how many images a Resource keeps
export const RESOURCE_IMAGE_LIMIT = 6

// the version of this filter
export const RESOURCE_IMAGE_FILTER_VERSION = 1

// the box a stored image fits inside: twice the film's frame, so a zoom to 2 times stays sharp
const RESOURCE_IMAGE_STORED_WIDTH = VIDEO_WIDTH * 2
const RESOURCE_IMAGE_STORED_HEIGHT = VIDEO_HEIGHT * 2

// the image formats a film shows, as sharp names them. heif is avif's container
const RESOURCE_IMAGE_FORMATS = new Set(["jpeg", "png", "webp", "heif"])

// the shortest side a kept image has at least
const MIN_SIDE_PIXELS = 200

// the shapes the frame can hold, as width over height: from a 9:16 portrait to a 4.5:1 banner
const MIN_ASPECT_RATIO = 9 / 16
const MAX_ASPECT_RATIO = 4.5

// the fewest colors an image shows on a copy of 256 pixels a side, each color read at 5 bits a channel. a silhouette,
// an identicon, a logo, or an icon shows fewer
const COLOR_COUNT_SIDE_PIXELS = 256
const MIN_COLOR_COUNT = 64
const COLOR_CHANNEL_SHIFT = 3

// the fewest of 64 gray levels that a black-and-white photo shows, counting a level that holds at least 1 percent of
// the pixels and only the gray pixels, whose channels differ by 16 or less. a gray logo or text on white shows fewer,
// and a flat color graphic shows none
const GRAY_LEVEL_COUNT = 64
const GRAY_LEVEL_SHIFT = 2
const MIN_GRAY_LEVEL_COUNT = 12
const MIN_GRAY_LEVEL_PIXEL_SHARE = 0.01
const GRAY_PIXEL_MAX_CHANNEL_SPREAD = 16

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
 * illustration type, is too small, has a shape the frame cannot hold, or shows too few colors is left out. A copy of a kept
 * picture takes that picture's place if it is larger. A new picture goes last, or first if it is the link preview
 * image.
 */
export async function addResourceImage(
	keptResourceImages: KeptResourceImage[],
	candidate: ResourceImageCandidate,
): Promise<KeptResourceImage[]> {
	// leave out an image that cannot be read, is too small, has a shape the frame cannot hold, or shows too few colors
	const resourceImage = await readResourceImage(candidate)
	const isFrameable = resourceImage && isLargeEnough(resourceImage) && hasFrameAspectRatio(resourceImage)
	if (!isFrameable || !(await hasEnoughColors(candidate.imageBytes))) {
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

// whether an image's shortest side is long enough
function isLargeEnough({ width, height }: ImageSize): boolean {
	return Math.min(width, height) >= MIN_SIDE_PIXELS
}

// whether an image shows enough colors, or enough gray levels for a black-and-white photo, on a small copy over white
// if it has transparency
async function hasEnoughColors(imageBytes: Uint8Array): Promise<boolean> {
	// the image fitted inside 256 pixels a side, as rgb pixels even if it is stored in gray
	const rgbPixels = await sharp(imageBytes, { limitInputPixels: MAX_INPUT_PIXELS })
		.flatten({ background: "#ffffff" })
		.resize(COLOR_COUNT_SIDE_PIXELS, COLOR_COUNT_SIDE_PIXELS, { fit: "inside" })
		.removeAlpha()
		.toColourspace("srgb")
		.raw()
		.toBuffer()
		.catch(() => null)

	// pixels that do not decode, such as a cut-off jpeg's, show no color
	if (!rgbPixels) {
		return false
	}

	// count each pixel's color once, and the gray pixels at each gray level
	const colors = new Set<number>()
	const grayLevelPixelCounts = new Uint32Array(GRAY_LEVEL_COUNT)
	for (let i = 0; i + 2 < rgbPixels.length; i += 3) {
		// the pixel's color at 5 bits a channel
		const red = rgbPixels[i] ?? 0
		const green = rgbPixels[i + 1] ?? 0
		const blue = rgbPixels[i + 2] ?? 0
		colors.add(
			((red >> COLOR_CHANNEL_SHIFT) << 10) | ((green >> COLOR_CHANNEL_SHIFT) << 5) | (blue >> COLOR_CHANNEL_SHIFT),
		)

		// the gray level of a pixel that is gray
		if (Math.max(red, green, blue) - Math.min(red, green, blue) <= GRAY_PIXEL_MAX_CHANNEL_SPREAD) {
			const grayLevel = Math.floor((red + green + blue) / 3) >> GRAY_LEVEL_SHIFT
			grayLevelPixelCounts[grayLevel] = (grayLevelPixelCounts[grayLevel] ?? 0) + 1
		}
	}

	// a gray level counts if it holds enough of the pixels, so a logo's smoothed edges add none
	const minGrayLevelPixelCount = (rgbPixels.length / 3) * MIN_GRAY_LEVEL_PIXEL_SHARE
	const grayLevelCount = grayLevelPixelCounts.filter((pixelCount) => pixelCount >= minGrayLevelPixelCount).length
	return colors.size >= MIN_COLOR_COUNT || grayLevelCount >= MIN_GRAY_LEVEL_COUNT
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
