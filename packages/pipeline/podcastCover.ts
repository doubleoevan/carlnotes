// a podcast cover, drawn over its topic's image, its podcast episode's image, or the cover illustration, and the draw
// and store path that every cover shares: satori and resvg draw the cover once at its full size in a child process,
// ffmpeg encodes it at both sizes, and storage serves both after

import {
	FULL_PODCAST_COVER_SIZE,
	PODCAST_COVER_SIZES,
	type PodcastCover,
	type PodcastCoverSize,
} from "@carlnotes/contracts/podcastEpisodes"
import { attachmentExists, getAttachmentBytes, uploadAttachment } from "@carlnotes/db/store"
import { runFfmpeg } from "@carlnotes/models/ffmpeg"
import { toDataUrl } from "@carlnotes/server/dataUrl"
import { toPodcastCoverObjectKey } from "@carlnotes/server/podcastCoverPaths"
import type { CardElement } from "./cardElementPng"
import { toCardElementPngInChildProcess } from "./cardElementPngProcess"
import { type CoverBandTones, toBottomBand, toCoverBandTones, toTopBand } from "./podcastCoverBands"
import { loadPodcastCover } from "./podcastCoverRows"
import {
	loadPodcastEpisodeImageDataUri,
	type PodcastEpisodeCover,
	toPodcastEpisodeCoverElement,
} from "./podcastEpisodeCover"
import { toTopicImageCardJpeg, toTopicImageOriginalKey } from "./topicImages/topicImageFiles"

// the most bytes that Apple allows for a cover
export const MAX_PODCAST_COVER_BYTES = 512 * 1024

// the pixel size a topic image's square crop is drawn at under the cover
const TOPIC_IMAGE_SQUARE_SIZE = 1500

// the illustration that every cover is drawn over. the illustration has an empty band across its top 18 percent
// and an empty table across its bottom 25 percent
const PODCAST_COVER_ILLUSTRATION_URL = new URL("../../apps/docs/design/podcast/cover-base.png", import.meta.url)

// ffmpeg's JPEG qualities to try, best first. a lower number is a larger and better file
const JPEG_QUALITIES = [3, 5, 8, 12, 18, 25]

// the illustration as a data uri, read by the first cover that is drawn
let coverIllustrationDataUri: Promise<string> | undefined

// a cover's JPEG at each of its sizes
export type PodcastCoverJpegs = Record<PodcastCoverSize, Uint8Array>

// the draws waiting or under way, by the object key of the cover's full size
const pendingCoverDrawByObjectKey = new Map<string, Promise<PodcastCoverJpegs>>()

// the draw that the next draw waits for. a draw takes most of a second of one core and hundreds of megabytes in its
// child process, so this process draws one cover at a time
let lastCoverDraw: Promise<unknown> = Promise.resolve()

/**
 * Returns how many cover draws this process has waiting or under way.
 */
export function readPodcastCoverChainLength(): number {
	return pendingCoverDrawByObjectKey.size
}

/**
 * Returns a cover's JPEG at the given size, read from storage, or drawn and stored at both sizes if it is not there.
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
	return (await drawAndStorePodcastCovers(podcastCover))[size]
}

/**
 * Draws a cover once and stores it at both sizes, after the draws that this process started before it. A cover whose
 * draw is under way joins that draw.
 */
export function drawAndStorePodcastCovers(podcastCover: PodcastCover): Promise<PodcastCoverJpegs> {
	const drawKey = toPodcastCoverObjectKey(podcastCover, FULL_PODCAST_COVER_SIZE)
	const pendingCoverDraw = pendingCoverDrawByObjectKey.get(drawKey)
	if (pendingCoverDraw) {
		return pendingCoverDraw
	}

	// start a draw that waits for the draw before it, and keep it in the map until it settles
	const coverDraw = lastCoverDraw.then(() => drawAndUploadCovers(podcastCover))
	lastCoverDraw = coverDraw.catch(() => {})
	pendingCoverDrawByObjectKey.set(drawKey, coverDraw)

	// the draw leaves the map once it settles
	const forgetCoverDraw = (): void => {
		pendingCoverDrawByObjectKey.delete(drawKey)
	}
	coverDraw.then(forgetCoverDraw, forgetCoverDraw)
	return coverDraw
}

/**
 * Stores a podcast episode's cover at both sizes unless both are stored, and returns whether it drew. A podcast
 * episode that is gone, removed, or has no title yet has no cover to store.
 */
export async function storePodcastEpisodeCovers(podcastEpisodeId: string): Promise<boolean> {
	const loadedCover = await loadPodcastCover({ kind: "episode", id: podcastEpisodeId })
	if (!loadedCover) {
		return false
	}

	// a cover already stored at both sizes needs no draw
	const { podcastCover } = loadedCover
	const areSizesStored = await Promise.all(
		PODCAST_COVER_SIZES.map((size) => attachmentExists(toPodcastCoverObjectKey(podcastCover, size))),
	)
	if (areSizesStored.every(Boolean)) {
		return false
	}
	await drawAndStorePodcastCovers(podcastCover)
	return true
}

// the cover, and the ground as a data uri: the topic image's square crop, or the illustration, read from storage or
// its file if not given
type ToPodcastCoverJpegsOptions = { podcastCover: PodcastCover; illustrationDataUri?: string }

/**
 * Draws a cover once, in a child process, and returns it as a JPEG at each size, each under the byte limit.
 */
export async function toPodcastCoverJpegs({
	podcastCover,
	illustrationDataUri,
}: ToPodcastCoverJpegsOptions): Promise<PodcastCoverJpegs> {
	// the cover's markup, drawn as a png at the cover's full size
	const coverElement =
		podcastCover.kind === "episode"
			? await loadPodcastEpisodeCoverElement(podcastCover, illustrationDataUri)
			: await loadShowCoverElement(podcastCover, illustrationDataUri)
	const coverPng = await toCardElementPngInChildProcess({
		cardElement: coverElement,
		width: FULL_PODCAST_COVER_SIZE,
		height: FULL_PODCAST_COVER_SIZE,
	})

	// the one png scaled and encoded at each size, one size at a time
	const coverJpegs = {} as PodcastCoverJpegs
	for (const size of PODCAST_COVER_SIZES) {
		coverJpegs[size] = await toCoverJpegUnderLimit(podcastCover, coverPng, size)
	}
	return coverJpegs
}

// the png as a JPEG at one size, at the best quality that fits the byte limit. a cover that fits at no quality throws
async function toCoverJpegUnderLimit(
	podcastCover: PodcastCover,
	coverPng: Uint8Array,
	size: PodcastCoverSize,
): Promise<Uint8Array> {
	// try each quality, best first
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
	return { dataUri: toDataUrl("image/jpeg", squareJpeg), bandTones: await toCoverBandTones(squareJpeg) }
}

// the illustration as a data uri. a read that fails is tried again by the next cover
function loadCoverIllustrationDataUri(): Promise<string> {
	coverIllustrationDataUri ??= Bun.file(PODCAST_COVER_ILLUSTRATION_URL)
		.arrayBuffer()
		.then((coverIllustrationBytes) => toDataUrl("image/png", new Uint8Array(coverIllustrationBytes)))
		// forget a failed read, so a file that arrives later is found
		.catch((error) => {
			coverIllustrationDataUri = undefined
			throw error
		})
	return coverIllustrationDataUri
}

// draw the cover and store it at each size under that size's object key
async function drawAndUploadCovers(podcastCover: PodcastCover): Promise<PodcastCoverJpegs> {
	const coverJpegs = await toPodcastCoverJpegs({ podcastCover })
	await Promise.all(
		PODCAST_COVER_SIZES.map((size) =>
			uploadAttachment(toPodcastCoverObjectKey(podcastCover, size), coverJpegs[size], "image/jpeg"),
		),
	)
	return coverJpegs
}

// how long one cover's scale and encode may run before it is killed. a cover encodes in well under a second
const COVER_ENCODE_TIMEOUT_MS = 30_000

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
	const ffmpegArguments = [...inputArguments, ...outputArguments]
	return runFfmpeg({ ffmpegArguments, inputBytes: coverPng, timeoutMs: COVER_ENCODE_TIMEOUT_MS })
}
