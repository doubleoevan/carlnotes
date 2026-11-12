// a segment's shot plan: no shot on screen over 8 seconds, shots of 5 to 8 seconds that average about 6, cuts on
// caption breaks, the images in turn, no move twice in a row, the same plan for the same seed, and each image's zoom
import { expect, test } from "bun:test"
import {
	SHOT_CROSSFADE_FRAMES,
	toCaptionBreakFrames,
	toShotPanZoom,
	toShotScreenFrameCount,
	toShotZoomLimit,
	toShotZoomRatePerSecond,
	toSnappedCutFrame,
	toVideoShots,
	type VideoShot,
} from "./videoShots"
import { VIDEO_FRAMES_PER_SECOND } from "./videoTimeline"

// a number of seconds as frames
const toFrames = (seconds: number): number => Math.round(seconds * VIDEO_FRAMES_PER_SECOND)

// a segment of some seconds with no caption break, planned over three images
function toPlainShots(seconds: number, seed = "episode-1:0"): VideoShot[] {
	return toVideoShots({ frameCount: toFrames(seconds), captionBreakFrames: [], imageCount: 3, seed })
}

// how many seconds each shot is on screen, with its crossfade into the next shot
function toScreenSeconds(shots: VideoShot[]): number[] {
	return shots.map((shot, i) => toShotScreenFrameCount(shot, i === shots.length - 1) / VIDEO_FRAMES_PER_SECOND)
}

test("no shot is on screen over 8 seconds, for any seed and any length", () => {
	for (let seconds = 1; seconds <= 420; seconds++) {
		// two seeds for each length, with a caption break every 3.7 seconds
		for (const seed of [`episode-${seconds}:0`, `episode-${seconds}:1`]) {
			const frameCount = toFrames(seconds)
			const captionBreakFrames = Array.from({ length: 120 }, (_, i) => toFrames(3.7 * (i + 1)))
			const shots = toVideoShots({ frameCount, captionBreakFrames, imageCount: 4, seed })

			// the shots cover the segment with no gap, and none is on screen too long
			expect(shots.reduce((frameSum, shot) => frameSum + shot.frameCount, 0)).toBe(frameCount)
			expect(
				shots.every((shot, i) => shot.startFrame === (shots[i - 1]?.startFrame ?? 0) + (shots[i - 1]?.frameCount ?? 0)),
			).toBe(true)
			expect(Math.max(...toScreenSeconds(shots))).toBeLessThanOrEqual(8)
		}
	}
})

test("a three minute chapter cuts about thirty times, in shots of 5 to 8 seconds that differ", () => {
	const screenSeconds = toScreenSeconds(toPlainShots(180))
	const meanSeconds = screenSeconds.reduce((secondSum, seconds) => secondSum + seconds, 0) / screenSeconds.length
	expect(screenSeconds.length).toBeGreaterThanOrEqual(26)
	expect(screenSeconds.length).toBeLessThanOrEqual(34)

	// every shot is long enough, they average about 6 seconds, and their lengths differ
	expect(Math.min(...screenSeconds)).toBeGreaterThanOrEqual(5)
	expect(meanSeconds).toBeGreaterThan(5.5)
	expect(meanSeconds).toBeLessThan(6.5)
	expect(new Set(screenSeconds).size).toBeGreaterThan(10)
})

test("a chapter of 8 seconds or less is one shot", () => {
	expect(toPlainShots(6)).toHaveLength(1)
	expect(toPlainShots(8)).toHaveLength(1)
	expect(toPlainShots(6)[0]).toMatchObject({ imageIndex: 0, startFrame: 0, frameCount: toFrames(6) })
})

test("a chapter of 9 seconds is shared by two shots of about 4.5 seconds", () => {
	const shots = toPlainShots(9)
	expect(shots.map((shot) => shot.frameCount)).toEqual([toFrames(4.5), toFrames(4.5)])
	expect(Math.max(...toScreenSeconds(shots))).toBeLessThanOrEqual(8)
})

test("the images take turns in their order, and none shows twice in a row", () => {
	const shots = toPlainShots(60)
	expect(shots.slice(0, 7).map((shot) => shot.imageIndex)).toEqual([0, 1, 2, 0, 1, 2, 0])
	expect(shots.every((shot, i) => shot.imageIndex !== shots[i - 1]?.imageIndex)).toBe(true)

	// two images take turns too
	const twoImageShots = toVideoShots({ frameCount: toFrames(45), captionBreakFrames: [], imageCount: 2, seed: "s" })
	expect(twoImageShots.slice(0, 4).map((shot) => shot.imageIndex)).toEqual([0, 1, 0, 1])
})

test("no shot uses the move of the shot before it, and every move is used", () => {
	const shots = toPlainShots(300)
	expect(shots.every((shot, i) => shot.move !== shots[i - 1]?.move)).toBe(true)
	expect(new Set(shots.map((shot) => shot.move)).size).toBe(4)
})

test("the same seed plans the same shots, and another seed plans others", () => {
	expect(toPlainShots(120, "episode-1:3")).toEqual(toPlainShots(120, "episode-1:3"))
	expect(toPlainShots(120, "episode-1:3")).not.toEqual(toPlainShots(120, "episode-1:4"))
})

test("a cut moves to a caption break within a second", () => {
	const cut = { plannedCutFrame: toFrames(6.2), shotStartFrame: 0, frameCount: toFrames(60) }
	expect(toSnappedCutFrame({ ...cut, captionBreakFrames: [toFrames(2), toFrames(6.6), toFrames(9)] })).toBe(
		toFrames(6.6),
	)

	// the nearer of two caption breaks in reach
	expect(toSnappedCutFrame({ ...cut, captionBreakFrames: [toFrames(5.5), toFrames(6.4)] })).toBe(toFrames(6.4))
})

test("a cut with no caption break near it stays where it was planned", () => {
	const cut = { plannedCutFrame: toFrames(6.2), shotStartFrame: 0, frameCount: toFrames(60) }
	expect(toSnappedCutFrame({ ...cut, captionBreakFrames: [toFrames(5.1), toFrames(7.3)] })).toBe(toFrames(6.2))
	expect(toSnappedCutFrame({ ...cut, captionBreakFrames: [] })).toBe(toFrames(6.2))
})

test("a caption break that would hold a shot on screen too long is passed over", () => {
	// a cut planned 7 seconds into a shot that starts at 20 seconds, and one caption break 7.9 seconds into it
	const cut = { plannedCutFrame: toFrames(27), shotStartFrame: toFrames(20), frameCount: toFrames(60) }
	expect(toSnappedCutFrame({ ...cut, captionBreakFrames: [toFrames(27.9)] })).toBe(toFrames(27))
})

test("the cuts of a planned chapter fall on its caption breaks", () => {
	// a caption break every second, so every cut has one in reach
	const frameCount = toFrames(120)
	const captionBreakFrames = Array.from({ length: 119 }, (_, i) => toFrames(i + 1))
	const shots = toVideoShots({ frameCount, captionBreakFrames, imageCount: 3, seed: "episode-1:2" })
	expect(shots.slice(1).every((shot) => captionBreakFrames.includes(shot.startFrame))).toBe(true)
	expect(Math.max(...toScreenSeconds(shots))).toBeLessThanOrEqual(8)
})

test("a segment's caption breaks are the frames where a caption starts inside it", () => {
	const captionBreakFrames = toCaptionBreakFrames({
		captionStartSeconds: [38, 40, 42.5, 47, 100, 101],
		segmentStartSeconds: 40,
		frameCount: toFrames(60),
	})
	expect(captionBreakFrames).toEqual([toFrames(2.5), toFrames(7)])
})

test("an image's zoom limit is what its stored pixels hold, from 1.25 to 2", () => {
	expect(toShotZoomLimit({ width: 2560, height: 1440 })).toBe(2)
	expect(toShotZoomLimit({ width: 5120, height: 2880 })).toBe(2)
	expect(toShotZoomLimit({ width: 1200, height: 630 })).toBe(1.25)
	expect(toShotZoomLimit({ width: 1280, height: 720 })).toBe(1.25)
	expect(toShotZoomLimit({ width: 800, height: 1067 })).toBeCloseTo(1.48, 2)
})

test("a zoom runs at 8 percent a second, or slower to end on its limit", () => {
	const sixSecondFrames = toFrames(6)
	expect(toShotZoomRatePerSecond(2, sixSecondFrames)).toBe(1.08)
	expect(1.08 ** 6).toBeCloseTo(1.59, 2)

	// a small image reaches its limit as the shot leaves the screen
	const slowRate = toShotZoomRatePerSecond(1.25, sixSecondFrames)
	expect(slowRate).toBeLessThan(1.08)
	expect(slowRate ** 6).toBeCloseTo(1.25, 5)
})

test("a pan holds the zoom that gives it room, up to the image's limit", () => {
	expect(toShotPanZoom(2, toFrames(6))).toBeCloseTo(1.48, 5)
	expect(toShotPanZoom(1.25, toFrames(6))).toBe(1.25)
	expect(SHOT_CROSSFADE_FRAMES).toBe(10)
})
