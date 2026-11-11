// the film timeline's tests: exact frame counts across many chapters, gaps, and empty segments
import { expect, test } from "bun:test"
import { toVideoTimeline, VIDEO_FRAMES_PER_SECOND } from "./videoTimeline"

// fifteen chapters at fractional times cover the audio exactly, with no frames gained or lost to rounding
test("fifteen chapters with fractional times add no drift and cover the duration", () => {
	// chapters of 61.37 seconds each after a 3.21 second intro, then a 9.9 second sign-off
	const chapterTimes = Array.from({ length: 15 }, (_, position) => ({
		position,
		startSeconds: 3.21 + position * 61.37,
		endSeconds: 3.21 + (position + 1) * 61.37,
	}))
	const durationSeconds = 3.21 + 15 * 61.37 + 9.9
	const segments = toVideoTimeline({ chapterTimes, durationSeconds })

	// every segment is there, and the frames add up to the audio's length on the grid
	expect(segments).toHaveLength(17)
	const frameCount = segments.reduce((sum, segment) => sum + segment.frameCount, 0)
	expect(frameCount).toBe(Math.round(durationSeconds * VIDEO_FRAMES_PER_SECOND))

	// each chapter starts within one frame of its own start time
	let startFrame = 0
	for (const segment of segments) {
		expect(Math.abs(startFrame - segment.startSeconds * VIDEO_FRAMES_PER_SECOND)).toBeLessThanOrEqual(0.5)
		startFrame += segment.frameCount
	}
})

// a gap between two chapters belongs to the earlier chapter, and a missing intro or sign-off is left out
test("a gap goes to the earlier chapter and an empty intro and sign-off are dropped", () => {
	const segments = toVideoTimeline({
		chapterTimes: [
			{ position: 1, startSeconds: 4, endSeconds: 6 },
			{ position: 0, startSeconds: 0, endSeconds: 3 },
		],
		durationSeconds: 6,
	})
	expect(segments).toEqual([
		{ kind: "chapter", position: 0, startSeconds: 0, frameCount: 96 },
		{ kind: "chapter", position: 1, startSeconds: 4, frameCount: 48 },
	])
})

// a chapter's hot takes take the end of its time, and a cut too near either end is not made
test("a chapter ends where its hot takes start, unless either would run under the minimum", () => {
	const segments = toVideoTimeline({
		chapterTimes: [
			{ position: 0, startSeconds: 0, endSeconds: 20 },
			{ position: 1, startSeconds: 20, endSeconds: 40 },
		],
		hotTakesStartSeconds: new Map([
			[0, 12.5],
			[1, 38],
		]),
		durationSeconds: 40,
	})

	// the frames still cover the audio, and only the first chapter is cut
	expect(segments).toEqual([
		{ kind: "chapter", position: 0, startSeconds: 0, frameCount: 300 },
		{ kind: "hot-takes", position: 0, startSeconds: 12.5, frameCount: 180 },
		{ kind: "chapter", position: 1, startSeconds: 20, frameCount: 480 },
	])
})
