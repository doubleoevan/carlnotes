// a podcast episode film's ffmpeg runs: one segment from its still, the join of segments or parts by stream copy, and
// the film's mux with its audio and captions. each run has a timeout and stops once the render's signal aborts

import { createHash } from "node:crypto"
import { runFfmpeg } from "@carlnotes/models/ffmpeg"
import { ESPRESSO, VIDEO_HEIGHT, VIDEO_WIDTH } from "./videoFrames"
import {
	LOWER_THIRD_FADE_SECONDS,
	LOWER_THIRD_IN_SECONDS,
	LOWER_THIRD_OUT_SECONDS,
	SEGMENT_FADE_SECONDS,
	SEGMENT_SLIDE_SECONDS,
	toSegmentSeconds,
	VIDEO_FRAMES_PER_SECOND,
	type VideoSegment,
} from "./videoTimeline"

// how far the slow zoom goes. a chapter's still drifts in a little. the intro zooms further in to the film's image,
// and the sign-off zooms back out of it
const CHAPTER_ZOOM_END = 1.35
const IMAGE_ZOOM_END = 1.8

// the edges of the frame a still can slide in from
const VIDEO_SLIDE_DIRECTIONS = ["left", "right", "top", "bottom"] as const
export type VideoSlideDirection = (typeof VIDEO_SLIDE_DIRECTIONS)[number]

// the overshoot of the slide's back ease. at 0.83 the still passes its place by 2.5 percent of the frame, 32 pixels
// across and 18 down, before it settles
const SLIDE_OVERSHOOT = 0.83

// every segment's H.264 settings. the same settings in every part let parts join by stream copy, and a keyframe every
// two seconds that never moves for a scene change opens every part on a keyframe and keeps seeks fast
const H264_ARGUMENTS = [
	"-c:v",
	"libx264",
	"-profile:v",
	"high",
	"-level",
	"4.0",
	"-pix_fmt",
	"yuv420p",
	"-r",
	String(VIDEO_FRAMES_PER_SECOND),
	"-preset",
	"veryfast",
	"-crf",
	"28",
	"-tune",
	"stillimage",
	"-maxrate",
	"1500k",
	"-bufsize",
	"3000k",
	"-g",
	String(VIDEO_FRAMES_PER_SECOND * 2),
	"-keyint_min",
	String(VIDEO_FRAMES_PER_SECOND * 2),
	"-sc_threshold",
	"0",
]

// the film's audio: AAC-LC at 96 kbps, one channel at 44.1 kHz, the same as the podcast episode's MP3
const AAC_ARGUMENTS = ["-c:a", "aac", "-b:a", "96k", "-ac", "1", "-ar", "44100"]

// how long a segment's encode may take before it is killed: a minute to start, and twelve times the segment's length.
// a worker with one core encodes a segment in about three times its length
const SEGMENT_ENCODE_START_TIMEOUT_MS = 60_000
const SEGMENT_ENCODE_TIMEOUT_MS_PER_SECOND = 12_000

// how long a run that encodes no video may take before it is killed. a join and a rebuilt film's remux copy their
// streams, and the film's mux also encodes the audio
const STREAM_COPY_TIMEOUT_MS = 5 * 60 * 1000
const FILM_MUX_TIMEOUT_MS = 10 * 60 * 1000

// one segment: its still and lower third pngs, its frames, which kind of segment it is, the edge its still slides in
// from, or null for a segment that fades in, and the file it writes. the kind sets the zoom, and an intro's and a
// sign-off's lower third stays for the whole segment
export type VideoSegmentEncode = {
	stillPath: string
	lowerThirdPath: string
	frameCount: number
	segmentKind: VideoSegment["kind"]
	slideDirection: VideoSlideDirection | null
	segmentPath: string
}

/**
 * Encodes one video-only segment: the still with a slow zoom, the lower third over it, a slide in or a slow fade from
 * espresso at its start, and a slow fade to espresso at its end. The encode is killed at its timeout or once the
 * signal aborts.
 */
export async function encodeVideoSegment(videoSegmentEncode: VideoSegmentEncode, signal?: AbortSignal): Promise<void> {
	// give the encode a minute to start and six times the segment's length
	const segmentSeconds = toSegmentSeconds(videoSegmentEncode.frameCount)
	await runFfmpeg({
		ffmpegArguments: toVideoSegmentArguments(videoSegmentEncode),
		timeoutMs: SEGMENT_ENCODE_START_TIMEOUT_MS + segmentSeconds * SEGMENT_ENCODE_TIMEOUT_MS_PER_SECOND,
		signal,
	})
}

// the film's podcast episode, and the chapter's position in it
type ToSlideDirectionOptions = { podcastEpisodeId: string; position: number }

/**
 * Returns the edge a chapter's still slides in from. The edge varies from chapter to chapter and is the same every
 * time the film renders.
 */
export function toSlideDirection({ podcastEpisodeId, position }: ToSlideDirectionOptions): VideoSlideDirection {
	// pick the edge by the first byte of a hash of the podcast episode and the position
	const [hashByte = 0] = createHash("sha256").update(`${podcastEpisodeId}:${position}`).digest()
	return VIDEO_SLIDE_DIRECTIONS[hashByte % VIDEO_SLIDE_DIRECTIONS.length] ?? "left"
}

/**
 * Returns ffmpeg's arguments for one segment. A chapter's still and its hot takes' zoom from 1 to 1.35 across the
 * frames, the intro's zooms in from 1 to 1.8, and the sign-off's zooms out from 1.8 to 1. Each zoom eases in and out.
 * The lower third fades in after 0.6 seconds, and a chapter's and its hot takes' fades out by 8 seconds. The segment fades out to espresso over 1.2
 * seconds. It fades in from espresso as slowly, or its still slides in over espresso in 0.9 seconds. A short segment
 * splits its length between its start and its end.
 */
export function toVideoSegmentArguments({
	stillPath,
	lowerThirdPath,
	frameCount,
	segmentKind,
	slideDirection,
	segmentPath,
}: VideoSegmentEncode): string[] {
	// the zoom is centered, at the film's size, and the sign-off's runs backward. it eases: it starts slowly, moves
	// fastest in the middle, and settles at the end
	const isFilmImageSegment = segmentKind === "intro" || segmentKind === "sign-off"
	const zoomEnd = isFilmImageSegment ? IMAGE_ZOOM_END : CHAPTER_ZOOM_END
	const zoomRange = Number((zoomEnd - 1).toFixed(4))
	const easedProgress = `(1-cos(PI*on/${Math.max(frameCount - 1, 1)}))/2`
	const zoomExpression =
		segmentKind === "sign-off" ? `${zoomEnd}-${zoomRange}*${easedProgress}` : `1+${zoomRange}*${easedProgress}`
	const zoomFilter = `zoompan=z='${zoomExpression}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frameCount}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:fps=${VIDEO_FRAMES_PER_SECOND}`

	// the lower third fades in, and a chapter's and its hot takes' fades out
	const lowerThirdFadeIn = `fade=t=in:st=${LOWER_THIRD_IN_SECONDS}:d=${LOWER_THIRD_FADE_SECONDS}:alpha=1`
	const lowerThirdFadeOutStart = LOWER_THIRD_OUT_SECONDS - LOWER_THIRD_FADE_SECONDS
	const lowerThirdFadeOut = isFilmImageSegment
		? ""
		: `,fade=t=out:st=${lowerThirdFadeOutStart}:d=${LOWER_THIRD_FADE_SECONDS}:alpha=1`

	// the whole segment fades out to espresso, and one with no slide fades in from it. a short segment splits its
	// length between the two fades
	const espressoColor = `0x${ESPRESSO.slice(1)}`
	const segmentSeconds = toSegmentSeconds(frameCount)
	const fadeSeconds = Math.min(SEGMENT_FADE_SECONDS, segmentSeconds / 2)
	const fadeIn = `fade=t=in:st=0:d=${fadeSeconds}:color=${espressoColor}`
	const fadeOut = `fade=t=out:st=${segmentSeconds - fadeSeconds}:d=${fadeSeconds}:color=${espressoColor}`
	const segmentFades = slideDirection ? fadeOut : `${fadeIn},${fadeOut}`

	// a sliding still moves in under the lower third, which keeps its place. a short segment's slide takes half its
	// length at most
	const slideSeconds = Math.min(SEGMENT_SLIDE_SECONDS, segmentSeconds / 2)
	const slideFilters = slideDirection ? toSlideFilters({ slideDirection, slideSeconds, espressoColor }) : []
	const filterGraph = [
		`[0:v]${zoomFilter}[zoomed]`,
		...slideFilters,
		`[1:v]format=rgba,${lowerThirdFadeIn}${lowerThirdFadeOut}[lowerThird]`,
		`[${slideDirection ? "slid" : "zoomed"}][lowerThird]overlay=0:0,${segmentFades},format=yuv420p[segment]`,
	].join(";")

	// the still is read once and the zoom draws every frame from it. the lower third loops at the film's frame rate, and
	// the output stops at the segment's frames
	const frameRate = String(VIDEO_FRAMES_PER_SECOND)
	return [
		...["-y", "-i", stillPath],
		...["-framerate", frameRate, "-loop", "1", "-i", lowerThirdPath],
		...["-filter_complex", filterGraph, "-map", "[segment]", "-frames:v", String(frameCount)],
		...H264_ARGUMENTS,
		...["-an", segmentPath],
	]
}

// the edge the still slides in from, how long the slide takes, and the espresso it slides over
type ToSlideFiltersOptions = { slideDirection: VideoSlideDirection; slideSeconds: number; espressoColor: string }

// the filters that slide the zoomed still in over an espresso frame, as the [slid] stream. the still starts outside
// the frame on its edge, moves fast, passes its place a little, and settles back on it, as if pulled in by hand
function toSlideFilters({ slideDirection, slideSeconds, espressoColor }: ToSlideFiltersOptions): string[] {
	// how far the still is from its place, as a share of the frame: -1 on the first frame and 0 once the slide is over.
	// a back ease in the time since the segment started, with no state from frame to frame
	const easeTime = `min(t/${slideSeconds},1)-1`
	const cubicWeight = Number((SLIDE_OVERSHOOT + 1).toFixed(4))
	const slideOffset = `(${cubicWeight}*pow(${easeTime},3)+${SLIDE_OVERSHOOT}*pow(${easeTime},2))`

	// move the still along one axis: from the left or the top it starts before the frame, and from the right or the
	// bottom it starts after it
	const isHorizontal = slideDirection === "left" || slideDirection === "right"
	const isFromStart = slideDirection === "left" || slideDirection === "top"
	const slidePosition = `${isFromStart ? "" : "-"}${isHorizontal ? "W" : "H"}*${slideOffset}`
	const overlayPosition = isHorizontal ? `x='${slidePosition}':y='0'` : `x='0':y='${slidePosition}'`

	// an espresso frame at the film's size and frame rate, and the still over it
	const backgroundSource = `color=c=${espressoColor}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:r=${VIDEO_FRAMES_PER_SECOND}`
	return [`${backgroundSource}[background]`, `[background][zoomed]overlay=${overlayPosition}[slid]`]
}

/**
 * Writes the concat demuxer's list of files, in order.
 */
export async function writeConcatList(filePaths: string[], listPath: string): Promise<void> {
	await Bun.write(listPath, `${filePaths.map((filePath) => `file '${filePath}'`).join("\n")}\n`)
}

// the concat list of the files to join, and the file the join writes
type JoinVideoOptions = { listPath: string; outputPath: string }

/**
 * Joins video-only segments or parts by stream copy, with no re-encode. The join is killed after five minutes or once
 * the signal aborts.
 */
export async function joinVideo({ listPath, outputPath }: JoinVideoOptions, signal?: AbortSignal): Promise<void> {
	await runFfmpeg({
		ffmpegArguments: ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outputPath],
		timeoutMs: STREAM_COPY_TIMEOUT_MS,
		signal,
	})
}

// the concat list of the three parts, the podcast episode's MP3, the WebVTT captions, and the film to write
type FilmMuxOptions = { listPath: string; audioPath: string; captionsPath: string; filmPath: string }

/**
 * Returns ffmpeg's arguments for the film: the parts joined by stream copy, the MP3 encoded once as AAC, and the
 * captions as a mov_text track, with the index at the front so the first frame plays before the whole file loads.
 */
export function toFilmMuxArguments({ listPath, audioPath, captionsPath, filmPath }: FilmMuxOptions): string[] {
	return [
		...["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-i", audioPath, "-i", captionsPath],
		...["-map", "0:v", "-map", "1:a", "-map", "2:s", "-c:v", "copy"],
		...AAC_ARGUMENTS,
		...["-c:s", "mov_text", "-metadata:s:s:0", "language=eng", "-movflags", "+faststart", filmPath],
	]
}

// the concat list of the three parts, the film that plays now, and the rebuilt film to write
type FilmRemuxOptions = { listPath: string; currentFilmPath: string; filmPath: string }

/**
 * Returns ffmpeg's arguments for a rebuilt film: the new parts joined by stream copy, with the audio and the captions
 * copied from the film that plays now.
 */
export function toFilmRemuxArguments({ listPath, currentFilmPath, filmPath }: FilmRemuxOptions): string[] {
	return [
		...["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-i", currentFilmPath],
		...["-map", "0:v", "-map", "1:a", "-map", "1:s", "-c", "copy", "-movflags", "+faststart", filmPath],
	]
}

/**
 * Writes the film from its parts, the podcast episode's MP3, and the captions. The mux is killed after ten minutes or
 * once the signal aborts.
 */
export async function muxFilm(filmMuxOptions: FilmMuxOptions, signal?: AbortSignal): Promise<void> {
	await runFfmpeg({
		ffmpegArguments: toFilmMuxArguments(filmMuxOptions),
		timeoutMs: FILM_MUX_TIMEOUT_MS,
		signal,
	})
}

/**
 * Writes a rebuilt film from its new parts and the film that plays now. The remux is killed after five minutes or once
 * the signal aborts.
 */
export async function remuxFilm(filmRemuxOptions: FilmRemuxOptions, signal?: AbortSignal): Promise<void> {
	await runFfmpeg({
		ffmpegArguments: toFilmRemuxArguments(filmRemuxOptions),
		timeoutMs: STREAM_COPY_TIMEOUT_MS,
		signal,
	})
}
