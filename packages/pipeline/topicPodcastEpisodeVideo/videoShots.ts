// a film segment's montage: its shots in order, each one image on screen for 5 to 8 seconds with one move, cut on the
// caption breaks, and how fast each image may move. the plan is the same every time the film renders

import { createHash } from "node:crypto"
import { VIDEO_HEIGHT, VIDEO_WIDTH } from "./videoFrames"
import { VIDEO_FRAMES_PER_SECOND } from "./videoTimeline"

// how many frames two shots in a row crossfade over, about 0.4 seconds
export const SHOT_CROSSFADE_FRAMES = 10

// the longest a shot is on screen, in seconds. a segment this long or shorter is one shot
export const SHOT_MAXIMUM_SCREEN_SECONDS = 8

// the longest and the shortest a shot is on screen, from its first frame to the end of its crossfade into the next
const SHOT_MAXIMUM_SCREEN_FRAMES = SHOT_MAXIMUM_SCREEN_SECONDS * VIDEO_FRAMES_PER_SECOND
const SHOT_MINIMUM_SCREEN_FRAMES = 5 * VIDEO_FRAMES_PER_SECOND

// the longest and the shortest a shot that another shot follows runs from its cut to the next cut
const SHOT_MAXIMUM_FRAMES = SHOT_MAXIMUM_SCREEN_FRAMES - SHOT_CROSSFADE_FRAMES
const SHOT_MINIMUM_FRAMES = SHOT_MINIMUM_SCREEN_FRAMES - SHOT_CROSSFADE_FRAMES

// the longest a shot is planned to be on screen, so planned shots average 6 seconds
const SHOT_PLANNED_MAXIMUM_SCREEN_FRAMES = 7 * VIDEO_FRAMES_PER_SECOND
const SHOT_PLANNED_MAXIMUM_FRAMES = SHOT_PLANNED_MAXIMUM_SCREEN_FRAMES - SHOT_CROSSFADE_FRAMES

// how far a cut may move to land on a caption break
const CAPTION_BREAK_REACH_FRAMES = VIDEO_FRAMES_PER_SECOND

// the frames a segment needs after a cut for two more shots, each long enough
const TWO_SHOTS_MINIMUM_FRAMES = SHOT_MINIMUM_FRAMES + SHOT_MINIMUM_SCREEN_FRAMES

// how fast a zoom runs, compounding each second, and how far a pan travels each second as a share of the frame
const SHOT_ZOOM_RATE_PER_SECOND = 1.08
const SHOT_PAN_SHARE_PER_SECOND = 0.08

// the zoom any image may reach, and the most any image reaches, which a stored image twice the frame holds
const SHOT_ZOOM_LIMIT_MINIMUM = 1.25
const SHOT_ZOOM_LIMIT_MAXIMUM = 2

// the moves a shot makes
const VIDEO_SHOT_MOVES = ["zoom-in", "zoom-out", "pan-left", "pan-right"] as const
export type VideoShotMove = (typeof VIDEO_SHOT_MOVES)[number]

// one shot: which of the segment's images it shows, its first frame in the segment, its frames to the next cut, and
// its move
export type VideoShot = { imageIndex: number; startFrame: number; frameCount: number; move: VideoShotMove }

// a segment's frames, the frames where a caption starts, how many images it has, and the seed that makes its plan the
// same on every render
type ToVideoShotsOptions = { frameCount: number; captionBreakFrames: number[]; imageCount: number; seed: string }

/**
 * Returns a segment's shots in order. No shot is on screen longer than 8 seconds. Shots run 5 to 8 seconds and average
 * about 6, each cut moves to a caption break within a second if the shots stay that long, a segment of 8 seconds or
 * less is one shot, and a segment too short for two full shots is shared evenly. The images take turns in their order,
 * and no shot uses the move of the shot before it.
 */
export function toVideoShots({ frameCount, captionBreakFrames, imageCount, seed }: ToVideoShotsOptions): VideoShot[] {
	// place the cuts, then give each shot its image and its move
	const cutFrames = toCutFrames({ frameCount, captionBreakFrames, seed })
	const shots: VideoShot[] = []
	for (const [i, startFrame] of cutFrames.entries()) {
		// a shot runs to the next cut, or to the segment's end
		const endFrame = cutFrames[i + 1] ?? frameCount
		const move = toShotMove({ seed, shotIndex: i, previousMove: shots[i - 1]?.move })
		shots.push({ imageIndex: i % Math.max(imageCount, 1), startFrame, frameCount: endFrame - startFrame, move })
	}
	return shots
}

/**
 * Returns how many frames a shot is on screen: its own frames, and the crossfade into the next shot if one follows.
 */
export function toShotScreenFrameCount(shot: VideoShot, isLastShot: boolean): number {
	return shot.frameCount + (isLastShot ? 0 : SHOT_CROSSFADE_FRAMES)
}

// a segment's frames, its caption breaks, and its seed
type ToCutFramesOptions = Omit<ToVideoShotsOptions, "imageCount">

// the first frame of each shot of a segment, starting with frame zero. a segment with no frames has no shot
function toCutFrames({ frameCount, captionBreakFrames, seed }: ToCutFramesOptions): number[] {
	// add one shot at a time until the segment's frames are used up
	const cutFrames: number[] = []
	let shotStartFrame = 0
	while (shotStartFrame < frameCount) {
		// what is left fits in one shot, which ends the segment
		cutFrames.push(shotStartFrame)
		const remainingFrameCount = frameCount - shotStartFrame
		if (remainingFrameCount <= SHOT_MAXIMUM_SCREEN_FRAMES) {
			break
		}

		// too little is left for two full shots, so the last two share it evenly
		if (remainingFrameCount < TWO_SHOTS_MINIMUM_FRAMES) {
			cutFrames.push(shotStartFrame + Math.round(remainingFrameCount / 2))
			break
		}

		// plan the shot's length, and move its cut to a caption break in reach
		const plannedCutFrame =
			shotStartFrame + toPlannedShotFrames({ seed, shotIndex: cutFrames.length - 1, remainingFrameCount })
		shotStartFrame = toSnappedCutFrame({ plannedCutFrame, shotStartFrame, captionBreakFrames, frameCount })
	}
	return cutFrames
}

// the film's seed, the shot's index, and the segment's frames from the shot's first frame
type ToPlannedShotFramesOptions = { seed: string; shotIndex: number; remainingFrameCount: number }

// a shot's planned frames to its cut: drawn evenly between the shortest and the longest planned shot, then moved to the
// nearest length that leaves the segment either one last shot or room for two more
function toPlannedShotFrames({ seed, shotIndex, remainingFrameCount }: ToPlannedShotFramesOptions): number {
	const plannedRange = SHOT_PLANNED_MAXIMUM_FRAMES - SHOT_MINIMUM_FRAMES
	const seededShotFrameCount =
		SHOT_MINIMUM_FRAMES + Math.round(toSeededShare(`${seed}:${shotIndex}:length`) * plannedRange)
	return toFittingShotFrames(seededShotFrameCount, remainingFrameCount)
}

// a shot's frames moved, if they must, to the nearest length within a shot's limits that leaves the segment a last
// shot of 5 to 8 seconds or room for two more shots. returns the frames as given if no length does
function toFittingShotFrames(shotFrames: number, remainingFrameCount: number): number {
	for (let distance = 0; distance <= SHOT_MAXIMUM_FRAMES - SHOT_MINIMUM_FRAMES; distance++) {
		// try the nearest lengths on both sides, the shorter one first
		for (const candidateFrames of [shotFrames - distance, shotFrames + distance]) {
			if (isFittingShotFrames(candidateFrames, remainingFrameCount)) {
				return candidateFrames
			}
		}
	}
	return shotFrames
}

// whether a shot of these frames is within a shot's limits and leaves the segment a last shot of 5 to 8 seconds or
// room for two more shots
function isFittingShotFrames(shotFrames: number, remainingFrameCount: number): boolean {
	const afterShotFrameCount = remainingFrameCount - shotFrames
	const isShotWithinLimits = shotFrames >= SHOT_MINIMUM_FRAMES && shotFrames <= SHOT_MAXIMUM_FRAMES
	const isLastShotLeft =
		afterShotFrameCount >= SHOT_MINIMUM_SCREEN_FRAMES && afterShotFrameCount <= SHOT_MAXIMUM_SCREEN_FRAMES
	return isShotWithinLimits && (isLastShotLeft || afterShotFrameCount >= TWO_SHOTS_MINIMUM_FRAMES)
}

// a planned cut, the first frame of the shot it ends, the segment's caption breaks, and the segment's frames
type ToSnappedCutFrameOptions = {
	plannedCutFrame: number
	shotStartFrame: number
	captionBreakFrames: number[]
	frameCount: number
}

/**
 * Returns a cut moved to the nearest caption break within a second of where it was planned, if the shot it ends and
 * the shots after it stay within their lengths. Returns the planned cut if no caption break does.
 */
export function toSnappedCutFrame({
	plannedCutFrame,
	shotStartFrame,
	captionBreakFrames,
	frameCount,
}: ToSnappedCutFrameOptions): number {
	// the caption breaks in reach that keep every shot within its length
	const reachableBreakFrames = captionBreakFrames.filter(
		(captionBreakFrame) =>
			Math.abs(captionBreakFrame - plannedCutFrame) <= CAPTION_BREAK_REACH_FRAMES &&
			isFittingShotFrames(captionBreakFrame - shotStartFrame, frameCount - shotStartFrame),
	)

	// the nearest of them, or the planned cut
	const toDistance = (captionBreakFrame: number): number => Math.abs(captionBreakFrame - plannedCutFrame)
	const [nearestBreakFrame] = reachableBreakFrames.toSorted((first, second) => toDistance(first) - toDistance(second))
	return nearestBreakFrame ?? plannedCutFrame
}

// the film's seed, the shot's index, and the move of the shot before it, if there is one
type ToShotMoveOptions = { seed: string; shotIndex: number; previousMove: VideoShotMove | undefined }

// a shot's move: one of the moves that the shot before it did not make
function toShotMove({ seed, shotIndex, previousMove }: ToShotMoveOptions): VideoShotMove {
	const otherMoves = VIDEO_SHOT_MOVES.filter((move) => move !== previousMove)
	const moveIndex = Math.floor(toSeededShare(`${seed}:${shotIndex}:move`) * otherMoves.length)
	return otherMoves[moveIndex] ?? "zoom-in"
}

// a number from 0 up to 1 that is the same for the same text, from the first four bytes of the text's hash
function toSeededShare(text: string): number {
	return createHash("sha256").update(text).digest().readUInt32BE(0) / 2 ** 32
}

// a caption's start in the audio and a segment's start in it, both in seconds, with the segment's frames
type ToCaptionBreakFramesOptions = { captionStartSeconds: number[]; segmentStartSeconds: number; frameCount: number }

/**
 * Returns the frames of a segment where a caption starts, from the captions' start times in the audio, without the
 * segment's first frame.
 */
export function toCaptionBreakFrames({
	captionStartSeconds,
	segmentStartSeconds,
	frameCount,
}: ToCaptionBreakFramesOptions): number[] {
	return captionStartSeconds
		.map((startSeconds) => Math.round((startSeconds - segmentStartSeconds) * VIDEO_FRAMES_PER_SECOND))
		.filter((captionBreakFrame) => captionBreakFrame > 0 && captionBreakFrame < frameCount)
}

/**
 * Returns how far an image may zoom before it looks soft: how many of its stored pixels cover one film pixel when it
 * fills or fits the frame, never under 1.25 and never over 2.
 */
export function toShotZoomLimit({ width, height }: { width: number; height: number }): number {
	const storedPixelsPerFilmPixel = Math.max(width / VIDEO_WIDTH, height / VIDEO_HEIGHT)
	return Math.min(SHOT_ZOOM_LIMIT_MAXIMUM, Math.max(SHOT_ZOOM_LIMIT_MINIMUM, storedPixelsPerFilmPixel))
}

/**
 * Returns how much a zoom grows each second: 8 percent, or less if that would pass the image's zoom limit before the
 * shot leaves the screen, so a slower zoom ends on the limit.
 */
export function toShotZoomRatePerSecond(zoomLimit: number, screenFrameCount: number): number {
	const screenSeconds = Math.max(screenFrameCount, 1) / VIDEO_FRAMES_PER_SECOND
	return Math.min(SHOT_ZOOM_RATE_PER_SECOND, zoomLimit ** (1 / screenSeconds))
}

/**
 * Returns the zoom a pan holds: enough for the frame to travel 8 percent of its width each second the shot is on
 * screen, up to the image's zoom limit.
 */
export function toShotPanZoom(zoomLimit: number, screenFrameCount: number): number {
	const screenSeconds = screenFrameCount / VIDEO_FRAMES_PER_SECOND
	return Math.min(zoomLimit, 1 + SHOT_PAN_SHARE_PER_SECOND * screenSeconds)
}
