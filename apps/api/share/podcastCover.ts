// a topic's show cover, drawn over its topic's image or the cover illustration, and the render and store path that
// every cover shares: satori and resvg draw the cover once, ffmpeg encodes it, and storage serves it after

import { FULL_PODCAST_COVER_SIZE, type PodcastCover, type PodcastCoverSize } from "@carlnotes/contracts/podcastEpisodes"
import { attachmentExists, getAttachmentBytes, uploadAttachment } from "@carlnotes/db/store"
import { runFfmpeg } from "@carlnotes/models/ffmpeg"
import { type CardElement, toCardElementPng, toImageDataUri } from "@carlnotes/pipeline/cardElementPng"
import { toTopicImageCardJpeg, toTopicImageOriginalKey } from "@carlnotes/pipeline/topicImages/topicImageFiles"
import { toPodcastCoverObjectKey } from "@carlnotes/server/podcastCoverPaths"
import { type CoverBandTones, toBottomBand, toCoverBandTones, toTopBand } from "./podcastCoverBands"
import {
	loadPodcastEpisodeImageDataUri,
	type PodcastEpisodeCover,
	toPodcastEpisodeCoverElement,
} from "./podcastEpisodeCover"

// the most bytes that Apple allows for a cover
export const MAX_PODCAST_COVER_BYTES = 512 * 1024

// the pixel size a topic image's square crop is drawn at under the cover
const TOPIC_IMAGE_SQUARE_SIZE = 1500

// the illustration that every cover is drawn over. the illustration has an empty band across its top 18 percent
// and an empty table across its bottom 25 percent
const PODCAST_COVER_ILLUSTRATION_URL = new URL("../../../apps/docs/design/podcast/cover-base.png", import.meta.url)

// ffmpeg's JPEG qualities to try, best first. a lower number is a larger and better file
const JPEG_QUALITIES = [3, 5, 8, 12, 18, 25]

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
	const coverObjectKey = toPodcastCoverObjectKey(podcastCover, size)
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

// the cover, its size, and the ground as a data uri: the topic image's square crop, or the illustration, read from
// storage or its file if not given
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
	// the cover's markup, drawn as a png at the cover's full size
	const coverElement =
		podcastCover.kind === "episode"
			? await loadPodcastEpisodeCoverElement(podcastCover, illustrationDataUri)
			: await loadShowCoverElement(podcastCover, illustrationDataUri)
	const coverPng = await toCardElementPng({
		cardElement: coverElement,
		width: FULL_PODCAST_COVER_SIZE,
		height: FULL_PODCAST_COVER_SIZE,
	})

	// return the best quality that fits the byte limit, or throw an error
	for (const quality of JPEG_QUALITIES) {
		const coverJpeg = await toScaledCoverJpeg({ coverPng, size, quality })
		if (coverJpeg.byteLength <= MAX_PODCAST_COVER_BYTES) {
			return coverJpeg
		}
	}
	throw new Error(`the ${podcastCover.kind} cover for ${podcastCover.id} does not fit ${MAX_PODCAST_COVER_BYTES} bytes`)
}

// a show cover over the topic image's square crop when the topic has one, and over the illustration otherwise
async function loadShowCoverElement(podcastCover: PodcastCover, illustrationDataUri?: string): Promise<CardElement> {
	const topicImageGround = illustrationDataUri ? null : await loadTopicImageGround(podcastCover)
	return toPodcastCoverElement(
		podcastCover,
		topicImageGround?.dataUri ?? illustrationDataUri ?? (await loadCoverIllustrationDataUri()),
		topicImageGround?.bandTones ?? null,
	)
}

// a podcast episode's cover over its own image, else its topic's, else the illustration
async function loadPodcastEpisodeCoverElement(
	podcastCover: PodcastEpisodeCover,
	illustrationDataUri?: string,
): Promise<CardElement> {
	const imageDataUri =
		illustrationDataUri ??
		(await loadPodcastEpisodeImageDataUri(podcastCover)) ??
		(await loadCoverIllustrationDataUri())
	return toPodcastEpisodeCoverElement(podcastCover, imageDataUri)
}

/**
 * Returns a cover's markup of the ground, the top band's line, and the title in the bottom band. Over a topic image
 * each band sits on a translucent gradient in its tone, and over the illustration they sit on its own empty bands.
 */
export function toPodcastCoverElement(
	podcastCover: PodcastCover,
	groundDataUri: string,
	bandTones: CoverBandTones | null = null,
): CardElement {
	return {
		type: "div",
		props: {
			style: { display: "flex", width: "100%", height: "100%", fontFamily: "Architects Daughter" },
			children: [
				{
					type: "img",
					props: {
						src: groundDataUri,
						width: FULL_PODCAST_COVER_SIZE,
						height: FULL_PODCAST_COVER_SIZE,
						style: { position: "absolute" },
					},
				},
				toTopBand(bandTones?.top ?? null),
				toBottomBand(podcastCover.title, bandTones?.bottom ?? null),
			],
		},
	}
}

// the topic image's square crop as a data uri, with each band's tone read from the image under it, or null for a
// cover over the illustration
async function loadTopicImageGround({
	topicId,
	topicImageHash,
}: PodcastCover): Promise<{ dataUri: string; bandTones: CoverBandTones } | null> {
	if (!topicImageHash) {
		return null
	}

	// the square crop of the stored original, and the tones of the bands over it
	const originalJpeg = await getAttachmentBytes(toTopicImageOriginalKey(topicId, topicImageHash))
	const squareJpeg = await toTopicImageCardJpeg(originalJpeg, TOPIC_IMAGE_SQUARE_SIZE, TOPIC_IMAGE_SQUARE_SIZE)
	return { dataUri: toImageDataUri(squareJpeg, "image/jpeg"), bandTones: await toCoverBandTones(squareJpeg) }
}

// the illustration as a data uri. a read that fails is tried again by the next cover
function loadCoverIllustrationDataUri(): Promise<string> {
	coverIllustrationDataUri ??= Bun.file(PODCAST_COVER_ILLUSTRATION_URL)
		.arrayBuffer()
		.then((coverIllustrationBytes) => toImageDataUri(new Uint8Array(coverIllustrationBytes), "image/png"))
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
	// the png on ffmpeg's input pipe and the JPEG on its output pipe
	const inputArguments = ["-f", "png_pipe", "-i", "pipe:0"]
	const outputArguments = [
		"-vf",
		`scale=${size}:${size}:flags=lanczos`,
		"-q:v",
		String(quality),
		"-f",
		"mjpeg",
		"pipe:1",
	]
	return runFfmpeg({ ffmpegArguments: [...inputArguments, ...outputArguments], inputBytes: coverPng })
}
