// Chapter plans are replayed against the approved input on every read.
import { expect, test } from "bun:test"
import {
	checkRetainedScenePictures,
	planVideoScenes,
	resolveSavedVideoScenePlan,
	sha256Hash,
	toRetainedPosterHash,
	toStoredVideoScenePlan,
	type VideoSceneInput,
	verifyVideoScenePlan,
} from "./videoScenePlan"
import { toVideoTimeline } from "./videoTimeline"

const sourceImageHash = sha256Hash("approved resource picture")
const input: VideoSceneInput = {
	episode: "episode",
	position: 2,
	startSeconds: 0,
	frameCount: 144,
	title: "North versus South",
	sourceImageHashes: [sourceImageHash],
	captions: [],
}

test("only matching reviewed animation survives in the scene images", () => {
	const animationFileHash = sha256Hash("reviewed rigid layers")
	const rig = {
		sourceImageHash: sourceImageHash,
		width: 1280,
		height: 720,
		origin: "house" as const,
		animationFileHash,
	}
	const withAnimation = planVideoScenes({ ...input, videoSceneImages: [rig] })
	const without = planVideoScenes({ ...input, videoSceneImages: [{ ...rig, animationFileHash: undefined }] })
	expect(withAnimation.videoSceneImages[0]?.animationFileHash).toBe(animationFileHash)
	expect(() => resolveSavedVideoScenePlan(JSON.stringify(withAnimation), without, true)).toThrow("missing")
	expect(() => planVideoScenes({ ...input, videoSceneImages: [{ ...rig, animationFileHash: "../../file" }] })).toThrow()
	expect(() => planVideoScenes({ ...input, sourceImageHashes: ["../page"] })).toThrow()
})

test("the renamed scene images preserve the published plan bytes and chapter hash", () => {
	const plan = planVideoScenes({
		...input,
		videoSceneImages: [{ sourceImageHash, width: 640, height: 480, origin: "resource" }],
	})
	// A worker from before the rename produced this hash for these exact chapter inputs.
	const stored = toStoredVideoScenePlan(plan)
	const hash = "302f6d797ebeac929166051de56bc93aaafb4b981347aa611f2a0d734538195d"
	expect(sha256Hash(JSON.stringify(stored))).toBe(hash)
	expect(resolveSavedVideoScenePlan(JSON.stringify(stored), plan, true)).toEqual(plan)
	expect(checkRetainedScenePictures(stored, plan.episode, plan.position, new Set([sourceImageHash]))).toBe(hash)
})

test("only a Comment segment that can display the poster retains its pixels", () => {
	const poster = { stillPng: Buffer.from("film poster"), zoomLimit: 2, isPodcastCard: false }
	const first = { kind: "hot-takes" as const, position: 0, startSeconds: 0, frameCount: 24 }
	const long = { ...first, frameCount: 24 * 90 }

	// a short segment shows the hosts alone. a later shot can show the film poster
	expect(toRetainedPosterHash("episode", [first], [], poster)).toBeNull()
	expect(toRetainedPosterHash("episode", [long], [], poster)).toBe(sha256Hash(poster.stillPng))
	expect(toRetainedPosterHash("episode", [long], [], { ...poster, isPodcastCard: true })).toBeNull()
})
test("a changed approved image or chapter invalidates a saved plan even with exactly the same title", () => {
	const plan = planVideoScenes(input)
	expect(verifyVideoScenePlan(JSON.parse(JSON.stringify(plan)), plan)).toEqual(plan)
	for (const changed of [
		{ sourceImageHashes: [sha256Hash("replacement")] },
		{ episode: "other" },
		{ position: 3 },
		{ startSeconds: 0.25 },
		{ title: "new title" },
	]) {
		expect(() => verifyVideoScenePlan(plan, planVideoScenes({ ...input, ...changed }))).toThrow()
	}
	for (const bad of [
		{ ...plan, code: "run" },
		{ ...plan, beats: [] },
		{ ...plan, beats: [{ ...plan.beats[0], end: 20 }] },
		{ ...plan, beats: [{ ...plan.beats[0], labels: [{ source: "url", start: 0, end: 2, frame: 0 }] }] },
	]) {
		expect(() => verifyVideoScenePlan(bad, plan)).toThrow()
	}
})

test("stage recovery and long chapters keep exact contiguous coverage through the final frame", () => {
	for (const frameCount of [1, 23, 24, 193, 4219, 24 * 3600]) {
		const plan = planVideoScenes({ ...input, frameCount, title: "The library" })
		const staged = plan
		let next = 0
		for (const beat of staged.beats) {
			expect(beat.start).toBe(next)
			expect(beat.end).toBeGreaterThan(beat.start)
			expect(beat.sourceImageHash).toBe(sourceImageHash)
			expect(beat.move).toBeDefined()
			next = beat.end
		}
		expect(next).toBe(frameCount)
	}
})

test("Finding frame counts use both rounded endpoints and stop at the Comment boundary", () => {
	const timeline = toVideoTimeline({
		chapterTimes: [{ position: 1, startSeconds: 0.021, endSeconds: 12.9 }],
		hotTakesStartSeconds: new Map([[1, 7.501]]),
		durationSeconds: 14.03,
	})
	const segment = timeline.find((item) => item.kind === "chapter")
	expect(segment?.frameCount).toBe(179)
	expect(timeline.reduce((sum, item) => sum + item.frameCount, 0)).toBe(Math.round(14.03 * 24))
})

test("saved scene images survive a restart and a retry fails visibly on a missing approved picture", () => {
	const expected = planVideoScenes({
		...input,
		videoSceneImages: [{ sourceImageHash: sourceImageHash, width: 600, height: 400, origin: "resource" }],
	})
	const saved = JSON.stringify(expected)
	expect(resolveSavedVideoScenePlan(saved, expected, true)).toEqual(expected)
	const another = sha256Hash("changed picture")
	const replacement = planVideoScenes({
		...input,
		sourceImageHashes: [another],
		videoSceneImages: [{ sourceImageHash: another, width: 600, height: 400, origin: "resource" }],
	})
	expect(() => resolveSavedVideoScenePlan(saved, replacement, true)).toThrow("missing or no longer approved")
	expect(resolveSavedVideoScenePlan(saved, replacement, false)).toEqual(replacement)
	expect(resolveSavedVideoScenePlan("{", expected, true)).toEqual(expected)
})

test("a poster change cannot republish a withdrawn chapter picture or borrow another episode's plan", () => {
	const plan = planVideoScenes({
		...input,
		videoSceneImages: [{ sourceImageHash: sourceImageHash, width: 640, height: 480, origin: "resource" }],
	})
	expect(() =>
		checkRetainedScenePictures(plan, input.episode, input.position, new Set([sourceImageHash])),
	).not.toThrow()
	expect(() => checkRetainedScenePictures(plan, input.episode, input.position, new Set())).toThrow("no longer approved")
	expect(() => checkRetainedScenePictures(plan, "another", input.position, new Set([sourceImageHash]))).toThrow()
})
