// an image's pixel size as it shows, read from its metadata without decoding it
import type { Metadata } from "sharp"

// an image's width and height in pixels
export type ImageSize = { width: number; height: number }

/**
 * Returns an image's pixel size turned upright. An image stored on its side shows with its width and height swapped.
 */
export function toUprightImageSize({
	width = 0,
	height = 0,
	orientation = 1,
}: Pick<Metadata, "width" | "height" | "orientation">): ImageSize {
	return orientation >= 5 ? { width: height, height: width } : { width, height }
}
