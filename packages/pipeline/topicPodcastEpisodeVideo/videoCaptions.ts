// a podcast episode film's captions: each turn timed within its chapter, cut into short cues, and written as WebVTT

import { runFfmpeg } from "@carlnotes/models/ffmpeg"
import { LOWER_THIRD_IN_SECONDS, LOWER_THIRD_OUT_SECONDS } from "./videoTimeline"

// a cue's most lines, the most characters on one line, and the longest a cue stays on screen
const CUE_MAX_LINES = 2
const CUE_LINE_MAX_CHARS = 42
const CUE_MAX_SECONDS = 7

// how far a turn boundary may move to land on a pause in the audio
const PAUSE_SNAP_SECONDS = 1.5

// a cue past this many characters ends at the next sentence or clause break instead of filling its lines
const CUE_BREAK_MIN_CHARS = 40

// the line setting that holds a cue above the lower third while the lower third shows. the cue's bottom sits at it
const ABOVE_LOWER_THIRD_LINE = "line:74%,end"

// the quiet that counts as a pause: below this loudness for at least this long
const PAUSE_NOISE = "-35dB"
const PAUSE_MIN_SECONDS = 0.3

// how long the silence detection may take before it is killed. it decodes the audio once
const PAUSE_DETECTION_TIMEOUT_MS = 5 * 60 * 1000

// one turn as the transcript shows it: who speaks, and what they say
type VideoCaptionTurn = { speakerName: string; text: string }

// one chapter's time in the audio and its turns in order
export type VideoCaptionChapter = { startSeconds: number; endSeconds: number; turns: VideoCaptionTurn[] }

// one cue: when it shows, its lines, and whether it sits above the lower third
export type VideoCaptionCue = { startSeconds: number; endSeconds: number; lines: string[]; isAboveLowerThird: boolean }

// the chapters, the middle of each pause in the audio, and where each chapter's hot takes start in the film, all in
// seconds
type ToVideoCaptionCuesOptions = {
	chapters: VideoCaptionChapter[]
	pauseSeconds: number[]
	hotTakesStartSeconds?: number[]
}

/**
 * Returns the film's caption cues. Each chapter's turns share its time by their characters, each boundary moves to a
 * nearby pause, and each turn is cut into cues of two short lines that name the speaker on the turn's first cue.
 */
export function toVideoCaptionCues({
	chapters,
	pauseSeconds,
	hotTakesStartSeconds = [],
}: ToVideoCaptionCuesOptions): VideoCaptionCue[] {
	return chapters.flatMap((chapter) => {
		// each turn's time in the chapter, then the turn's cues within that time
		const turnTimes = toVideoCaptionTurnTimes(chapter, pauseSeconds)
		const chapterCues = chapter.turns.flatMap((turn, i) => {
			const turnTime = turnTimes[i] ?? { startSeconds: chapter.startSeconds, endSeconds: chapter.startSeconds }
			return toTurnCues({ turn, ...turnTime })
		})

		// a cue that shows while the chapter's lower third or its hot takes' does sits above it
		const lowerThirdSegmentStartSeconds = [chapter.startSeconds, ...hotTakesStartSeconds]
		return chapterCues.map((cue) => ({
			...cue,
			isAboveLowerThird: lowerThirdSegmentStartSeconds.some(
				(segmentStartSeconds) =>
					cue.startSeconds < segmentStartSeconds + LOWER_THIRD_OUT_SECONDS &&
					cue.endSeconds > segmentStartSeconds + LOWER_THIRD_IN_SECONDS,
			),
		}))
	})
}

/**
 * Returns the cues as a WebVTT file, with the ampersands and angle brackets in each cue's text escaped.
 */
export function toWebVtt(cues: VideoCaptionCue[]): string {
	const cueBlocks = cues.map((cue) => {
		const cueSettings = cue.isAboveLowerThird ? ` ${ABOVE_LOWER_THIRD_LINE}` : ""
		const timing = `${toVttTimestamp(cue.startSeconds)} --> ${toVttTimestamp(cue.endSeconds)}${cueSettings}`
		return [timing, ...cue.lines.map(toVttCueText)].join("\n")
	})
	return `WEBVTT\n\n${cueBlocks.join("\n\n")}\n`
}

/**
 * Returns the middle of each pause in an audio file, found by one ffmpeg silence detection pass. The pass is killed
 * after five minutes or once the signal aborts.
 */
export async function detectPauseSeconds(audioPath: string, signal?: AbortSignal): Promise<number[]> {
	// print each detected silence's start and end to the output pipe, and decode nothing else
	const detectionBytes = await runFfmpeg({
		ffmpegArguments: [
			"-i",
			audioPath,
			"-af",
			`silencedetect=noise=${PAUSE_NOISE}:d=${PAUSE_MIN_SECONDS},ametadata=mode=print:file=-`,
			"-f",
			"null",
			"-",
		],
		timeoutMs: PAUSE_DETECTION_TIMEOUT_MS,
		signal,
	})
	return toPauseSeconds(new TextDecoder().decode(detectionBytes))
}

/**
 * Returns the middle of each pause from ffmpeg's printed silence starts and ends.
 */
export function toPauseSeconds(detectionText: string): number[] {
	// pair each silence start with the end after it
	const pauseSeconds: number[] = []
	let silenceStartSeconds: number | null = null
	for (const line of detectionText.split("\n")) {
		// a start opens a pause
		const [key, value] = line.trim().split("=")
		if (key === "lavfi.silence_start") {
			silenceStartSeconds = Number(value)
		}

		// an end closes the open pause at its middle
		if (key === "lavfi.silence_end" && silenceStartSeconds !== null) {
			pauseSeconds.push((silenceStartSeconds + Number(value)) / 2)
			silenceStartSeconds = null
		}
	}
	return pauseSeconds
}

/**
 * Returns each turn's start and end, sharing the chapter's time by characters, with each boundary between turns moved
 * to the nearest pause within reach.
 */
// ponytail: proportional timing with pause snapping drifts inside a long turn, word timestamps from a transcription
// call would be exact
export function toVideoCaptionTurnTimes(
	chapter: VideoCaptionChapter,
	pauseSeconds: number[],
): { startSeconds: number; endSeconds: number }[] {
	// the boundary after each turn, in proportion to the characters spoken so far
	const chapterSeconds = chapter.endSeconds - chapter.startSeconds
	const totalChars = chapter.turns.reduce((sum, turn) => sum + turn.text.length, 0) || 1
	let spokenChars = 0
	const boundarySeconds = chapter.turns.map((turn) => {
		spokenChars += turn.text.length
		return chapter.startSeconds + (chapterSeconds * spokenChars) / totalChars
	})

	// move each boundary but the chapter's end to the nearest pause after the last boundary
	let startSeconds = chapter.startSeconds
	return boundarySeconds.map((proportionalSeconds, i) => {
		const isLastTurn = i === boundarySeconds.length - 1
		const endSeconds = isLastTurn
			? chapter.endSeconds
			: toSnappedSeconds({
					proportionalSeconds,
					pauseSeconds,
					afterSeconds: startSeconds,
					beforeSeconds: chapter.endSeconds,
				})
		const turnTime = { startSeconds, endSeconds }
		startSeconds = endSeconds
		return turnTime
	})
}

// a boundary's time, the pauses, and the span the boundary must stay inside
type ToSnappedSecondsOptions = {
	proportionalSeconds: number
	pauseSeconds: number[]
	afterSeconds: number
	beforeSeconds: number
}

// the nearest pause within reach inside the span, or the proportional time if none is
function toSnappedSeconds({
	proportionalSeconds,
	pauseSeconds,
	afterSeconds,
	beforeSeconds,
}: ToSnappedSecondsOptions): number {
	const reachablePauses = pauseSeconds.filter(
		(pause) =>
			Math.abs(pause - proportionalSeconds) <= PAUSE_SNAP_SECONDS && pause > afterSeconds && pause < beforeSeconds,
	)
	const distanceTo = (pause: number): number => Math.abs(pause - proportionalSeconds)
	const nearestPause = reachablePauses.toSorted((first, second) => distanceTo(first) - distanceTo(second))[0]
	return nearestPause ?? proportionalSeconds
}

// one turn, and its time in the audio
type ToTurnCuesOptions = { turn: VideoCaptionTurn; startSeconds: number; endSeconds: number }

// one turn's cues, each timed by its share of the turn's characters, so no cue outlasts the longest cue time
function toTurnCues({
	turn,
	startSeconds,
	endSeconds,
}: ToTurnCuesOptions): Omit<VideoCaptionCue, "isAboveLowerThird">[] {
	// the turn's words after the speaker's name. a character's time counts the space after it
	const words = `${turn.speakerName}: ${turn.text}`.split(/\s+/).filter(Boolean)
	const turnSeconds = Math.max(endSeconds - startSeconds, 0.001)
	const turnChars = words.join(" ").length + 1

	// how many characters fit in the longest cue time at the turn's speaking rate, then the cues those allow
	const maxCueChars = Math.max(1, Math.floor((turnChars / turnSeconds) * CUE_MAX_SECONDS) - 1)
	const cueTexts = toCueTexts(words, maxCueChars)

	// time each cue by its share of the turn's characters
	let cueStartSeconds = startSeconds
	return cueTexts.map((text) => {
		const cueEndSeconds = cueStartSeconds + (turnSeconds * (text.length + 1)) / turnChars
		const cue = { startSeconds: cueStartSeconds, endSeconds: cueEndSeconds, lines: toCaptionLines(text) }
		cueStartSeconds = cueEndSeconds
		return cue
	})
}

// the words packed into cue texts. each fills up to two lines and the most characters, and ends early at a sentence or
// clause break once it is long enough
function toCueTexts(words: string[], maxCueChars: number): string[] {
	const cueTexts: string[] = []
	let cueText = ""
	for (const word of words) {
		// start a new cue if the word would overflow this one
		const candidateText = cueText ? `${cueText} ${word}` : word
		const isOverflowing = toCaptionLines(candidateText).length > CUE_MAX_LINES || candidateText.length > maxCueChars
		if (cueText && isOverflowing) {
			cueTexts.push(cueText)
			cueText = word
			continue
		}

		// add the word, and end the cue at a break once it is long enough
		cueText = candidateText
		if (cueText.length >= CUE_BREAK_MIN_CHARS && /[.!?,;:]$/.test(word)) {
			cueTexts.push(cueText)
			cueText = ""
		}
	}

	// the last cue takes the words left over
	if (cueText) {
		cueTexts.push(cueText)
	}
	return cueTexts
}

// a cue's text wrapped at word breaks into lines of at most the line limit. a longer word gets a line of its own
function toCaptionLines(text: string): string[] {
	// start a new line if the word would run past the line limit
	const lines: string[] = []
	let line = ""
	for (const word of text.split(" ")) {
		// the word joins the line unless the line would run too long
		const candidateLine = line ? `${line} ${word}` : word
		if (line && candidateLine.length > CUE_LINE_MAX_CHARS) {
			lines.push(line)
			line = word
			continue
		}
		line = candidateLine
	}

	// the last line takes the words left over
	if (line) {
		lines.push(line)
	}
	return lines
}

// a cue line as WebVTT cue text. an ampersand and an angle bracket are written as their escapes, so the line never
// reads as a tag or as a cue's timing arrow
function toVttCueText(line: string): string {
	return line.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

// a time in seconds as a WebVTT timestamp, hours:minutes:seconds.milliseconds
function toVttTimestamp(seconds: number): string {
	// split the time into its units, then pad each one
	const totalMilliseconds = Math.round(seconds * 1000)
	const hours = Math.floor(totalMilliseconds / 3_600_000)
	const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000)
	const wholeSeconds = Math.floor((totalMilliseconds % 60_000) / 1000)
	const milliseconds = totalMilliseconds % 1000
	const pad = (value: number, length = 2): string => String(value).padStart(length, "0")
	return `${pad(hours)}:${pad(minutes)}:${pad(wholeSeconds)}.${pad(milliseconds, 3)}`
}
