// a podcast episode film's ffmpeg runs: one shot from its still, the join of shots or parts by stream copy, and the
// film's mux with its audio and captions. each run has a timeout and stops once the render's signal aborts

import { runFfmpeg } from "@carlnotes/models/ffmpeg"
import { ESPRESSO, VIDEO_HEIGHT, VIDEO_WIDTH } from "./videoFrames"
import { SHOT_CROSSFADE_FRAMES, toShotPanZoom, toShotZoomRatePerSecond, type VideoShotMove } from "./videoShots"
import {
	LOWER_THIRD_FADE_SECONDS,
	LOWER_THIRD_IN_SECONDS,
	LOWER_THIRD_OUT_SECONDS,
	SEGMENT_FADE_SECONDS,
	toSegmentSeconds,
	VIDEO_FRAMES_PER_SECOND,
} from "./videoTimeline"

// every run's H.264 settings. the same settings in every run let shots and parts join by stream copy, and a keyframe
// every two seconds that never moves for a scene change opens every run on a keyframe and keeps seeks fast
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

// how long a run's encode may take before it is killed: a minute to start, and twelve times the run's length. a
// worker with one core encodes a run in about three times its length
const ENCODE_START_TIMEOUT_MS = 60_000
const ENCODE_TIMEOUT_MS_PER_SECOND = 12_000

// how long a run that encodes no video may take before it is killed. a join and a rebuilt film's remux copy their
// streams, and the film's mux also encodes the audio
const STREAM_COPY_TIMEOUT_MS = 5 * 60 * 1000
const FILM_MUX_TIMEOUT_MS = 10 * 60 * 1000

// the film's size and frame rate as zoompan's options, and a zoom's center
const ZOOM_OUTPUT = `s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:fps=${VIDEO_FRAMES_PER_SECOND}`
const ZOOM_CENTER = "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"

// the espresso the film fades through, as ffmpeg writes a color
const ESPRESSO_COLOR = `0x${ESPRESSO.slice(1)}`

// one shot's picture: its still's file, how far its image may zoom, its move, its frames to the next cut, and the
// frames it is on screen, which include its crossfade into the next shot
export type VideoShotPicture = {
	stillPath: string
	zoomLimit: number
	move: VideoShotMove
	frameCount: number
	screenFrameCount: number
}

// one shot's run: the shot's picture, the picture of the shot before it, or null for a segment's first shot, the lower
// third png with the seconds from the segment's start to the shot's and whether it stays once it fades in, or null for a
// shot the lower third never reaches, whether the shot starts or ends its segment, and the file it writes
export type VideoShotEncode = VideoShotPicture & {
	previousShot: VideoShotPicture | null
	lowerThird: { lowerThirdPath: string; shotStartSeconds: number; isShownThroughout: boolean } | null
	isSegmentStart: boolean
	isSegmentEnd: boolean
	shotPath: string
}

/**
 * Encodes one shot, video only: its still with its move, the still before it fading out over the first frames, the
 * lower third if it reaches the shot, and a fade from or to espresso at its segment's ends. The encode is killed at
 * its timeout or once the signal aborts.
 */
export async function encodeVideoShot(videoShotEncode: VideoShotEncode, signal?: AbortSignal): Promise<void> {
	await runFfmpeg({
		ffmpegArguments: toVideoShotArguments(videoShotEncode),
		timeoutMs: toEncodeTimeoutMs(videoShotEncode.frameCount),
		signal,
	})
}

/**
 * Returns ffmpeg's arguments for one shot. The still zooms or pans for its frames. The still before it keeps its own
 * move for the crossfade's frames and fades out over them. The lower third keeps the fades of its segment's first 8
 * seconds, whichever shot they fall in, or stays once it fades in if it shows throughout. A segment's first shot fades
 * in from espresso, and its last fades out to it.
 */
export function toVideoShotArguments(videoShotEncode: VideoShotEncode): string[] {
	// the shot's own still, with its move from its first frame
	const { previousShot, lowerThird, frameCount, isSegmentStart, isSegmentEnd } = videoShotEncode
	const inputArguments = ["-i", videoShotEncode.stillPath]
	const filters = [`[0:v]${toShotMoveFilter({ shotPicture: videoShotEncode, frameOffset: 0, frameCount })}[shot]`]
	let shownLabel = "shot"

	// the still before it keeps moving where its own run stopped, and fades out over the shot
	if (previousShot) {
		const crossfadeSeconds = toSegmentSeconds(SHOT_CROSSFADE_FRAMES)
		const tailMoveFilter = toShotMoveFilter({
			shotPicture: previousShot,
			frameOffset: previousShot.frameCount,
			frameCount: SHOT_CROSSFADE_FRAMES,
		})
		inputArguments.push("-i", previousShot.stillPath)
		filters.push(`[1:v]${tailMoveFilter},format=yuva420p,fade=t=out:st=0:d=${crossfadeSeconds}:alpha=1[tail]`)
		filters.push("[shot][tail]overlay=0:0:eof_action=pass[crossfaded]")
		shownLabel = "crossfaded"
	}

	// the lower third over the shot, with its fades timed from the segment's start
	if (lowerThird) {
		const lowerThirdInputIndex = previousShot ? 2 : 1
		inputArguments.push(...toLowerThirdInput(lowerThird.lowerThirdPath))
		filters.push(`[${lowerThirdInputIndex}:v]format=rgba,${toLowerThirdFades(lowerThird)}[lowerThird]`)
		filters.push(`[${shownLabel}][lowerThird]overlay=0:0[titled]`)
		shownLabel = "titled"
	}

	// the fades at the segment's ends, then the film's pixel format
	const segmentFades = toSegmentFades({ frameCount, isSegmentStart, isSegmentEnd })
	filters.push(`[${shownLabel}]${[...segmentFades, "format=yuv420p"].join(",")}[segment]`)
	return [
		...["-y", ...inputArguments],
		...["-filter_complex", filters.join(";"), "-map", "[segment]", "-frames:v", String(frameCount)],
		...H264_ARGUMENTS,
		...["-an", videoShotEncode.shotPath],
	]
}

// a shot's picture, how many of its frames were drawn before this run, and how many frames this run draws
type ToShotMoveFilterOptions = { shotPicture: VideoShotPicture; frameOffset: number; frameCount: number }

// the zoompan filter that draws a still's move over some of its frames. a zoom grows by the same share each second, so
// it looks as fast at its end as at its start, and a pan holds its zoom and crosses the room that leaves evenly
function toShotMoveFilter({ shotPicture, frameOffset, frameCount }: ToShotMoveFilterOptions): string {
	// the frame of the shot that each drawn frame is, and the shot's zoom rate
	const { move, zoomLimit, screenFrameCount } = shotPicture
	const shotFrame = `(on+${frameOffset})`
	const zoomRate = Number(toShotZoomRatePerSecond(zoomLimit, screenFrameCount).toFixed(6))
	const zoomMoves = {
		"zoom-in": `z='pow(${zoomRate},${shotFrame}/${VIDEO_FRAMES_PER_SECOND})':${ZOOM_CENTER}`,
		"zoom-out": `z='pow(${zoomRate},(${screenFrameCount}-${shotFrame})/${VIDEO_FRAMES_PER_SECOND})':${ZOOM_CENTER}`,
	}

	// a pan's zoom, and how far across its room the frame has traveled
	const panZoom = Number(toShotPanZoom(zoomLimit, screenFrameCount).toFixed(6))
	const panProgress = `${shotFrame}/${screenFrameCount}`
	const panMoves = {
		"pan-left": `z='${panZoom}':x='(iw-iw/zoom)*(1-${panProgress})':y='ih/2-(ih/zoom/2)'`,
		"pan-right": `z='${panZoom}':x='(iw-iw/zoom)*${panProgress}':y='ih/2-(ih/zoom/2)'`,
	}
	return `zoompan=${{ ...zoomMoves, ...panMoves }[move]}:d=${frameCount}:${ZOOM_OUTPUT}`
}

// the lower third's fades for a shot that starts some seconds into its segment: in after 0.6 seconds of the segment,
// and out by its eighth second unless it shows throughout. the lower third's times are moved to the segment's, faded,
// and moved back
function toLowerThirdFades({
	shotStartSeconds,
	isShownThroughout,
}: Pick<NonNullable<VideoShotEncode["lowerThird"]>, "shotStartSeconds" | "isShownThroughout">): string {
	const fadeOutStartSeconds = LOWER_THIRD_OUT_SECONDS - LOWER_THIRD_FADE_SECONDS
	const fadeIn = `fade=t=in:st=${LOWER_THIRD_IN_SECONDS}:d=${LOWER_THIRD_FADE_SECONDS}:alpha=1`
	const fadeOut = `fade=t=out:st=${fadeOutStartSeconds}:d=${LOWER_THIRD_FADE_SECONDS}:alpha=1`
	const fades = isShownThroughout ? fadeIn : `${fadeIn},${fadeOut}`
	return `setpts=PTS+${shotStartSeconds}/TB,${fades},setpts=PTS-${shotStartSeconds}/TB`
}

// a run's frames, and whether the run starts or ends its segment
type ToSegmentFadesOptions = { frameCount: number; isSegmentStart: boolean; isSegmentEnd: boolean }

// the fades of a run at its segment's ends: in from espresso at the segment's start, and out to it at the segment's
// end. a run shorter than both fades splits its length between them
function toSegmentFades({ frameCount, isSegmentStart, isSegmentEnd }: ToSegmentFadesOptions): string[] {
	const runSeconds = toSegmentSeconds(frameCount)
	const fadeSeconds = Math.min(SEGMENT_FADE_SECONDS, runSeconds / 2)
	const fadeIn = `fade=t=in:st=0:d=${fadeSeconds}:color=${ESPRESSO_COLOR}`
	const fadeOut = `fade=t=out:st=${runSeconds - fadeSeconds}:d=${fadeSeconds}:color=${ESPRESSO_COLOR}`
	return [...(isSegmentStart ? [fadeIn] : []), ...(isSegmentEnd ? [fadeOut] : [])]
}

// the lower third png as an input that loops at the film's frame rate
function toLowerThirdInput(lowerThirdPath: string): string[] {
	return ["-framerate", String(VIDEO_FRAMES_PER_SECOND), "-loop", "1", "-i", lowerThirdPath]
}

// how long a run of some frames may encode before it is killed
function toEncodeTimeoutMs(frameCount: number): number {
	return ENCODE_START_TIMEOUT_MS + toSegmentSeconds(frameCount) * ENCODE_TIMEOUT_MS_PER_SECOND
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
 * Joins video-only shots or parts by stream copy, with no re-encode. The join is killed after five minutes or once
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
