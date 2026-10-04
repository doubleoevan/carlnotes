// a topic's show cover and each podcast episode's own cover, drawn over the cover illustration
// with satori and resvg, then encoded as a JPEG by ffmpeg
import { renderAsync } from "@resvg/resvg-js"
import { type PodcastCover, type PodcastCoverSize, toPodcastCoverKey } from "@shared/podcastEpisodes"
import satori from "satori"
import { attachmentExists, getAttachmentBytes, uploadAttachment } from "../../worker"
import type { CardElement } from "./previewImage"

// a cover's full size, which is the largest that Apple takes, and the most bytes that Apple allows for a cover
const FULL_PODCAST_COVER_SIZE = 3000
export const MAX_PODCAST_COVER_BYTES = 512 * 1024

// bump this when the cover's design changes, so every stored cover is drawn again
export const PODCAST_COVER_TEMPLATE_VERSION = "v4"

// the illustration that every cover is drawn over. the illustration has an empty band across its top 18 percent
// and an empty table across its bottom 25 percent
const PODCAST_COVER_ILLUSTRATION_URL = new URL("../../docs/design/podcast/cover-base.png", import.meta.url)

// the side margin that no text crosses, the margin under the title, and the heights of the illustration's two bands
const SIDE_MARGIN = FULL_PODCAST_COVER_SIZE * 0.1
const BOTTOM_MARGIN = FULL_PODCAST_COVER_SIZE * 0.05
const TOP_BAND_HEIGHT = FULL_PODCAST_COVER_SIZE * 0.18
const BOTTOM_BAND_HEIGHT = FULL_PODCAST_COVER_SIZE * 0.25

// the font size of the top band's line, and the colors of its two parts
const TOP_BAND_FONT_SIZE = 190
const BRAND_NAME_COLOR = "#f09050"
const PODCAST_WORD_COLOR = "#f3e9db"

// the title's color, and how many lines a title may run
const TITLE_COLOR = "#332a22"
const MAX_TITLE_LINES = 3

// the longest title that each font size takes, largest size first,
// and the font size of a longer title
const TITLE_SIZE_STEPS = [
	{ maxChars: 14, fontSize: 260 },
	{ maxChars: 32, fontSize: 180 },
]
const SMALLEST_TITLE_FONT_SIZE = 120

// ffmpeg's JPEG qualities to try, best first. a lower number is a larger and better file
const JPEG_QUALITIES = [3, 5, 8, 12, 18, 25]

// the font, read once at boot. satori takes font bytes, not a font-family name or a stylesheet
const displayFont = await Bun.file(new URL("./fonts/ArchitectsDaughter-Regular.ttf", import.meta.url)).arrayBuffer()

// the illustration as a data uri, read by the first cover that is drawn
let coverIllustrationDataUri: Promise<string> | undefined

// the renders under way, by the object key that each render stores its cover under
const pendingCoverRenderByObjectKey = new Map<string, Promise<Uint8Array>>()

// the render that the next render waits for.
// a render takes seconds of cpu and over a hundred megabytes, so this process draws one cover at a time
let lastCoverRender: Promise<unknown> = Promise.resolve()

/**
 * Returns a cover's JPEG at the given size, drawn and stored on the first request and read from storage after.
 */
export async function toCachedPodcastCoverJpeg(
	podcastCover: PodcastCover,
	size: PodcastCoverSize,
): Promise<Uint8Array> {
	// return the stored cover if one exists. the object key includes the cover's key, which changes with the title
	const { kind, id } = podcastCover
	const coverFileName = `${toPodcastCoverKey(podcastCover)}-${size}.jpg`
	const coverObjectKey = `podcast-covers/${PODCAST_COVER_TEMPLATE_VERSION}/${kind}/${id}/${coverFileName}`
	if (await attachmentExists(coverObjectKey)) {
		return getAttachmentBytes(coverObjectKey)
	}

	// a cover not yet in storage joins the render under way for its object key,
	// or starts a render that waits for the render before it
	let coverRender = pendingCoverRenderByObjectKey.get(coverObjectKey)
	if (!coverRender) {
		coverRender = lastCoverRender.then(() => renderAndStoreCover({ podcastCover, size, coverObjectKey }))
		lastCoverRender = coverRender.catch(() => {})

		// the render stays in the map until it settles
		pendingCoverRenderByObjectKey.set(coverObjectKey, coverRender)
		coverRender.finally(() => pendingCoverRenderByObjectKey.delete(coverObjectKey)).catch(() => {})
	}
	return coverRender
}

// the cover, its size, and the illustration as a data uri, read from its file if not given
type ToPodcastCoverJpegOptions = {
	podcastCover: PodcastCover
	size: PodcastCoverSize
	illustrationDataUri?: string
}

/**
 * Draws a cover over the illustration and returns it as a JPEG at the given size, under the byte limit.
 */
export async function toPodcastCoverJpeg({
	podcastCover,
	size,
	illustrationDataUri,
}: ToPodcastCoverJpegOptions): Promise<Uint8Array> {
	// satori lays the cover out as an svg, and resvg rasterizes it at the cover's full size on a worker thread
	const coverElement = toPodcastCoverElement(
		podcastCover,
		illustrationDataUri ?? (await loadCoverIllustrationDataUri()),
	)
	const coverSvg = await satori(coverElement as Parameters<typeof satori>[0], {
		width: FULL_PODCAST_COVER_SIZE,
		height: FULL_PODCAST_COVER_SIZE,
		fonts: [{ name: "Architects Daughter", data: displayFont, weight: 400, style: "normal" }],
	})
	const renderedImage = await renderAsync(coverSvg, { fitTo: { mode: "width", value: FULL_PODCAST_COVER_SIZE } })
	const coverPng = renderedImage.asPng()

	// return the best quality that fits the byte limit, or throw an error
	for (const quality of JPEG_QUALITIES) {
		const coverJpeg = await toScaledCoverJpeg({ coverPng, size, quality })
		if (coverJpeg.byteLength <= MAX_PODCAST_COVER_BYTES) {
			return coverJpeg
		}
	}
	throw new Error(`the ${podcastCover.kind} cover for ${podcastCover.id} does not fit ${MAX_PODCAST_COVER_BYTES} bytes`)
}

/**
 * Returns a cover's markup of the illustration, the top band's line, and the title in the bottom band.
 */
export function toPodcastCoverElement(podcastCover: PodcastCover, illustrationDataUri: string): CardElement {
	return {
		type: "div",
		props: {
			style: { display: "flex", width: "100%", height: "100%", fontFamily: "Architects Daughter" },
			children: [
				{
					type: "img",
					props: {
						src: illustrationDataUri,
						width: FULL_PODCAST_COVER_SIZE,
						height: FULL_PODCAST_COVER_SIZE,
						style: { position: "absolute" },
					},
				},
				toTopBand(),
				toBottomBand(podcastCover.title),
			],
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

// the top band's line, centered in the band between the side margins
function toTopBand(): CardElement {
	return {
		type: "div",
		props: {
			style: {
				position: "absolute",
				top: 0,
				left: SIDE_MARGIN,
				width: FULL_PODCAST_COVER_SIZE - SIDE_MARGIN * 2,
				height: TOP_BAND_HEIGHT,
				// the two parts sit on one line in the middle of the band
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				fontSize: TOP_BAND_FONT_SIZE,
				lineHeight: 1,
			},
			children: [
				{ type: "span", props: { style: { color: BRAND_NAME_COLOR }, children: "Coffee Break" } },
				{ type: "span", props: { style: { color: PODCAST_WORD_COLOR, marginLeft: 60 }, children: "podcast" } },
			],
		},
	}
}

// the bottom band, with the title left-aligned
function toBottomBand(title: string): CardElement {
	// the title wraps and stops at three lines with an ellipsis
	const titleElement: CardElement = {
		type: "div",
		props: {
			style: {
				display: "block",
				lineClamp: MAX_TITLE_LINES,
				fontSize: toPodcastCoverTitleFontSize(title),
				lineHeight: 1.1,
				color: TITLE_COLOR,
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
				left: SIDE_MARGIN,
				width: FULL_PODCAST_COVER_SIZE - SIDE_MARGIN * 2,
				height: BOTTOM_BAND_HEIGHT - BOTTOM_MARGIN,
				// the title sits at the bottom of the band, above the bottom margin
				display: "flex",
				flexDirection: "column",
				justifyContent: "flex-end",
			},
			children: [titleElement],
		},
	}
}

// the illustration as a data uri. a read that fails is tried again by the next cover
function loadCoverIllustrationDataUri(): Promise<string> {
	coverIllustrationDataUri ??= Bun.file(PODCAST_COVER_ILLUSTRATION_URL)
		.arrayBuffer()
		.then((coverIllustrationBytes) => `data:image/png;base64,${Buffer.from(coverIllustrationBytes).toString("base64")}`)
		// forget a failed read, so a file that arrives later is found
		.catch((error) => {
			coverIllustrationDataUri = undefined
			throw error
		})
	return coverIllustrationDataUri
}

// the cover, its size, and the object key that the cover is stored under
type RenderAndStoreCoverOptions = { podcastCover: PodcastCover; size: PodcastCoverSize; coverObjectKey: string }

// draw the cover and store it under its object key
async function renderAndStoreCover({
	podcastCover,
	size,
	coverObjectKey,
}: RenderAndStoreCoverOptions): Promise<Uint8Array> {
	const coverJpeg = await toPodcastCoverJpeg({ podcastCover, size })
	await uploadAttachment(coverObjectKey, coverJpeg, "image/jpeg")
	return coverJpeg
}

// the cover as a png, the size to scale it to, and ffmpeg's quality
type ToScaledCoverJpegOptions = { coverPng: Uint8Array; size: PodcastCoverSize; quality: number }

// scale the png to the size and encode it as an RGB JPEG with ffmpeg, through its pipes
async function toScaledCoverJpeg({ coverPng, size, quality }: ToScaledCoverJpegOptions): Promise<Uint8Array> {
	// run ffmpeg with the png on its input pipe and the JPEG on its output pipe
	const inputArguments = ["-hide_banner", "-loglevel", "error", "-f", "png_pipe", "-i", "pipe:0"]
	const outputArguments = [
		"-vf",
		`scale=${size}:${size}:flags=lanczos`,
		"-q:v",
		String(quality),
		"-f",
		"mjpeg",
		"pipe:1",
	]
	const ffmpegProcess = Bun.spawn(["ffmpeg", ...inputArguments, ...outputArguments], {
		stdin: coverPng,
		stdout: "pipe",
		stderr: "pipe",
	})

	// a failed encode throws an error with what ffmpeg printed
	const [coverJpeg, errorText, exitCode] = await Promise.all([
		new Response(ffmpegProcess.stdout).arrayBuffer(),
		new Response(ffmpegProcess.stderr).text(),
		ffmpegProcess.exited,
	])
	if (exitCode !== 0) {
		throw new Error(`ffmpeg exited with ${exitCode}: ${errorText.trim().slice(0, 500)}`)
	}
	return new Uint8Array(coverJpeg)
}
