// a show cover's two text bands: the top band's line, the title in the bottom band, and each band's tone over a
// topic image, read from the brightness of the picture under it

import { FULL_PODCAST_COVER_SIZE } from "@carlnotes/contracts/podcastEpisodes"
import { darkRoast, latte, toColorChannels } from "@carlnotes/nightshift/colors"
import type { CardElement } from "@carlnotes/pipeline/cardElementPng"
import { toImageStripBrightness } from "@carlnotes/pipeline/topicImages/topicImageFiles"

// a text band's tone over a topic image: a dark band with the Dark roast text, or a light band with the Latte text
type CoverBandTone = "dark" | "light"

// the tone of the top band and of the title's band, each picked from the picture under it
export type CoverBandTones = { top: CoverBandTone; bottom: CoverBandTone }

// each tone's ground, which fades out away from the text, and its text colors. the dark ground is the espresso of
// the hero band and the light ground is a card's cream, both opaque enough at the text to read on any picture
const COVER_BAND_STYLES = {
	dark: { ground: latte.hero, groundAlpha: 0.9, text: darkRoast.foreground, accent: latte.heroAccent },
	light: { ground: latte.card, groundAlpha: 0.94, text: latte.foreground, accent: latte.badge },
} satisfies Record<CoverBandTone, { ground: string; groundAlpha: number; text: string; accent: string }>

// the brightness of the picture under a band, from 0 to 1, past which the band is light. a band leans dark, since
// Dark roast's cream text reads best at a cover's small sizes
const LIGHT_BAND_BRIGHTNESS = 0.7

// the side margin that no text crosses, the margin under the title, and the heights of the illustration's two bands,
// an empty band across its top 18 percent and an empty table across its bottom 25 percent
const SIDE_MARGIN = FULL_PODCAST_COVER_SIZE * 0.1
const BOTTOM_MARGIN = FULL_PODCAST_COVER_SIZE * 0.05
const TOP_BAND_FRACTION = 0.18
const BOTTOM_BAND_FRACTION = 0.25
const TOP_BAND_HEIGHT = FULL_PODCAST_COVER_SIZE * TOP_BAND_FRACTION
const BOTTOM_BAND_HEIGHT = FULL_PODCAST_COVER_SIZE * BOTTOM_BAND_FRACTION

// the font size of the top band's line, and the colors of its two parts over the illustration
const TOP_BAND_FONT_SIZE = 190
const BRAND_NAME_COLOR = latte.heroAccent
const PODCAST_WORD_COLOR = latte.heroForeground

// the title's color over the illustration, and how many lines a title may run
const TITLE_COLOR = latte.foreground
const MAX_TITLE_LINES = 3

// the longest title that each font size takes, largest size first,
// and the font size of a longer title
const TITLE_SIZE_STEPS = [
	{ maxChars: 14, fontSize: 260 },
	{ maxChars: 32, fontSize: 180 },
]
const SMALLEST_TITLE_FONT_SIZE = 120

/**
 * Returns the top band's line, centered in the band between the side margins, on its tone's gradient over a topic
 * image.
 */
export function toTopBand(tone: CoverBandTone | null): CardElement {
	const bandStyle = tone ? COVER_BAND_STYLES[tone] : null
	return {
		type: "div",
		props: {
			style: {
				position: "absolute",
				top: 0,
				left: 0,
				paddingLeft: SIDE_MARGIN,
				paddingRight: SIDE_MARGIN,
				width: FULL_PODCAST_COVER_SIZE,
				height: TOP_BAND_HEIGHT,
				backgroundImage: bandStyle ? toBandGradient("to bottom", bandStyle) : undefined,
				// the two parts sit on one line in the middle of the band
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				fontSize: TOP_BAND_FONT_SIZE,
				lineHeight: 1,
			},
			children: [
				{ type: "span", props: { style: { color: bandStyle?.accent ?? BRAND_NAME_COLOR }, children: "Coffee Break" } },
				{
					type: "span",
					props: { style: { color: bandStyle?.text ?? PODCAST_WORD_COLOR, marginLeft: 60 }, children: "podcast" },
				},
			],
		},
	}
}

/**
 * Returns the bottom band, with the title left-aligned, on its tone's gradient over a topic image.
 */
export function toBottomBand(title: string, tone: CoverBandTone | null): CardElement {
	const bandStyle = tone ? COVER_BAND_STYLES[tone] : null
	// the title wraps and stops at three lines with an ellipsis
	const titleElement: CardElement = {
		type: "div",
		props: {
			style: {
				display: "block",
				lineClamp: MAX_TITLE_LINES,
				fontSize: toPodcastCoverTitleFontSize(title),
				lineHeight: 1.1,
				color: bandStyle?.text ?? TITLE_COLOR,
			},
			children: title,
		},
	}
	return {
		type: "div",
		props: {
			style: {
				position: "absolute",
				top: FULL_PODCAST_COVER_SIZE - BOTTOM_BAND_HEIGHT,
				left: 0,
				paddingLeft: SIDE_MARGIN,
				paddingRight: SIDE_MARGIN,
				paddingBottom: BOTTOM_MARGIN,
				width: FULL_PODCAST_COVER_SIZE,
				height: BOTTOM_BAND_HEIGHT,
				backgroundImage: bandStyle ? toBandGradient("to top", bandStyle) : undefined,
				// the title sits at the bottom of the band, above the bottom margin
				display: "flex",
				flexDirection: "column",
				justifyContent: "flex-end",
			},
			children: [titleElement],
		},
	}
}

/**
 * Returns the font size of a cover's title, which steps down as the title gets longer.
 */
export function toPodcastCoverTitleFontSize(title: string): number {
	// the first size step that takes the title's length
	const titleSizeStep = TITLE_SIZE_STEPS.find(({ maxChars }) => title.length <= maxChars)
	return titleSizeStep?.fontSize ?? SMALLEST_TITLE_FONT_SIZE
}

// a band's gradient in its tone, opaque at the text's edge of the cover and clear toward the middle
function toBandGradient(
	direction: "to bottom" | "to top",
	{ ground, groundAlpha }: { ground: string; groundAlpha: number },
): string {
	const [red, green, blue] = toColorChannels(ground).channels
	return `linear-gradient(${direction}, rgba(${red}, ${green}, ${blue}, ${groundAlpha}), rgba(${red}, ${green}, ${blue}, 0))`
}

/**
 * Returns each band's tone over a topic image's square crop, read from the brightness of the strip under the band.
 */
export async function toCoverBandTones(squareJpeg: Uint8Array): Promise<CoverBandTones> {
	// the brightness under the top band and under the title's band
	const [topBrightness, bottomBrightness] = await Promise.all([
		toImageStripBrightness(squareJpeg, { topFraction: 0, heightFraction: TOP_BAND_FRACTION }),
		toImageStripBrightness(squareJpeg, { topFraction: 1 - BOTTOM_BAND_FRACTION, heightFraction: BOTTOM_BAND_FRACTION }),
	])
	return { top: toCoverBandTone(topBrightness), bottom: toCoverBandTone(bottomBrightness) }
}

/**
 * Returns a band's tone from the brightness of the picture under it: light over a bright picture, and dark otherwise.
 */
export function toCoverBandTone(brightness: number): CoverBandTone {
	return brightness > LIGHT_BAND_BRIGHTNESS ? "light" : "dark"
}
