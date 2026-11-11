// a podcast episode film's frames: each segment's still, composed at four times the film's size, and the lower third
// drawn over it

import { darkRoast } from "@carlnotes/nightshift/colors"
import sharp from "sharp"
import { type CardElement, toCardElementPng } from "../cardElementPng"

// the film's size, and how many times larger its stills are composed. the zoom moves a whole pixel of the still at a
// time, so a still four times the film's size moves a quarter of a film pixel at a time and the slow zoom stays smooth
export const VIDEO_WIDTH = 1280
export const VIDEO_HEIGHT = 720
const COMPOSED_SCALE = 4
const COMPOSED_WIDTH = VIDEO_WIDTH * COMPOSED_SCALE
const COMPOSED_HEIGHT = VIDEO_HEIGHT * COMPOSED_SCALE

// the espresso that the film fades through and that the lower third sits on, and the lower third's text colors
export const ESPRESSO = darkRoast.hero
const LOWER_THIRD_TITLE_COLOR = darkRoast.heroForeground
const LOWER_THIRD_DETAIL_COLOR = darkRoast.heroMuted

// how much a filled still's backdrop is blurred, in the still's own pixels, and darkened
const BACKDROP_BLUR_SIGMA = 20 * COMPOSED_SCALE
const BACKDROP_BRIGHTNESS = 0.45

// how close to 16:9 a wide image must be to cover the frame without a backdrop
const COVER_RATIO_TOLERANCE = 0.02

// the largest image a still is decoded from
const MAX_STILL_INPUT_PIXELS = 40_000_000

// Carl and Vienna's podcast card, the illustration that every podcast cover is drawn over. a chapter with no image of
// its own shows it
const PODCAST_COVER_ILLUSTRATION_URL = new URL("../../../apps/docs/design/podcast/cover-base.png", import.meta.url)

// where the podcast card's band starts, as a share of the illustration's width: under the dark band a cover's title
// sits on, so the 16:9 band shows both hosts, their mugs, and the microphone
const PODCAST_CARD_BAND_TOP_RATIO = 560 / 3000

// a still covers the frame, or fits inside it over a blurred backdrop of itself
export type VideoStillFit = "cover" | "fill"

/**
 * Returns whether an image covers the frame: a 16:9 image at least as wide as the film. Any other fits over a backdrop.
 */
export function toVideoStillFit({ width, height }: { width: number; height: number }): VideoStillFit {
	const filmRatio = VIDEO_WIDTH / VIDEO_HEIGHT
	const isFilmRatio = Math.abs(width / height - filmRatio) <= filmRatio * COVER_RATIO_TOLERANCE
	return isFilmRatio && width >= VIDEO_WIDTH ? "cover" : "fill"
}

/**
 * Returns an image as a still at four times the film's size. A wide 16:9 image covers the frame. Any other is centered
 * at most four times its own size, which is its own size on the film, over a blurred, darkened copy of itself. Throws
 * an error for an image that cannot be decoded.
 */
export async function toVideoStillPng(imageBytes: Uint8Array): Promise<Uint8Array> {
	// read the image's size, turned upright, from its first frame
	const uprightImage = sharp(imageBytes, { limitInputPixels: MAX_STILL_INPUT_PIXELS }).rotate()
	const uprightBytes = await uprightImage.png().toBuffer()
	const { width = 0, height = 0 } = await sharp(uprightBytes).metadata()

	// the backdrop covers the frame, and a covering image is the whole still
	const coverImage = sharp(uprightBytes)
		.flatten({ background: ESPRESSO })
		.resize(COMPOSED_WIDTH, COMPOSED_HEIGHT, { fit: "cover" })
	if (toVideoStillFit({ width, height }) === "cover") {
		return coverImage.png().toBuffer()
	}

	// otherwise blur and darken the backdrop, and scale the image to fit at most four times its own size
	const backdropBytes = await coverImage
		.blur(BACKDROP_BLUR_SIGMA)
		.modulate({ brightness: BACKDROP_BRIGHTNESS })
		.toBuffer()
	const foregroundBytes = await sharp(uprightBytes)
		.resize(Math.min(COMPOSED_WIDTH, width * COMPOSED_SCALE), Math.min(COMPOSED_HEIGHT, height * COMPOSED_SCALE), {
			fit: "inside",
		})
		.png()
		.toBuffer()

	// center the image over the backdrop
	return sharp(backdropBytes)
		.composite([{ input: foregroundBytes, gravity: "center" }])
		.png()
		.toBuffer()
}

// the podcast card's still, composed on the first load and kept for the process. its png is about 14 MB
let podcastCardStillPng: Promise<Uint8Array> | null = null

/**
 * Returns Carl and Vienna's podcast card as a still that covers the frame, for a chapter whose Finding has no image
 * that can be shown: the square illustration's full width, cut to a 16:9 band. The still is composed once for the
 * process, and every call returns the same bytes.
 */
export function loadPodcastCardStillPng(): Promise<Uint8Array> {
	// compose the still on the first call, and compose it again on the next call if the compose fails
	podcastCardStillPng ??= composePodcastCardStillPng().catch((error: unknown) => {
		podcastCardStillPng = null
		throw error
	})
	return podcastCardStillPng
}

// compose the podcast card's still from the illustration
async function composePodcastCardStillPng(): Promise<Uint8Array> {
	// read the illustration and its width
	const illustrationBytes = await Bun.file(PODCAST_COVER_ILLUSTRATION_URL).bytes()
	const { width = 0 } = await sharp(illustrationBytes).metadata()

	// cut the band at the film's shape, and compose it as any other still
	const bandBytes = await sharp(illustrationBytes)
		.extract({
			left: 0,
			top: Math.round(width * PODCAST_CARD_BAND_TOP_RATIO),
			width,
			height: Math.round((width * VIDEO_HEIGHT) / VIDEO_WIDTH),
		})
		.png()
		.toBuffer()
	return toVideoStillPng(bandBytes)
}

// the lower third's two lines: the title, and the detail under it
export type LowerThirdText = { title: string; detail: string }

/**
 * Returns the lower third as a transparent png at the film's size: the title in Karla semibold, at most two lines, and
 * the detail under it, on an espresso plate at the bottom left.
 */
export function toLowerThirdPng({ title, detail }: LowerThirdText): Promise<Uint8Array> {
	// the title stops at two lines with an ellipsis, and the detail at one
	const titleElement: CardElement = {
		type: "div",
		props: {
			style: { display: "block", lineClamp: 2, fontSize: 30, fontWeight: 600, lineHeight: 1.2 },
			children: title,
		},
	}
	const detailElement: CardElement = {
		type: "div",
		props: {
			style: { display: "block", lineClamp: 1, fontSize: 22, color: LOWER_THIRD_DETAIL_COLOR, marginTop: 6 },
			children: detail,
		},
	}

	// the plate at the bottom left of an otherwise transparent frame
	const plateElement: CardElement = {
		type: "div",
		props: {
			style: {
				display: "flex",
				flexDirection: "column",
				position: "absolute",
				left: 56,
				bottom: 40,
				maxWidth: 960,
				padding: "16px 24px",
				borderRadius: 12,
				backgroundColor: ESPRESSO,
				color: LOWER_THIRD_TITLE_COLOR,
				fontFamily: "Karla",
			},
			children: [titleElement, detailElement],
		},
	}
	const frameElement: CardElement = {
		type: "div",
		props: { style: { display: "flex", width: "100%", height: "100%" }, children: [plateElement] },
	}
	return toCardElementPng({ cardElement: frameElement, width: VIDEO_WIDTH, height: VIDEO_HEIGHT })
}
