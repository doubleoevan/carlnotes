// Approved pixels, bounds and the saved chapter decision govern animation on a retry.
import { expect, spyOn, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as storage from "@carlnotes/db/store"
import { runFfmpeg } from "@carlnotes/models/ffmpeg"
import sharp from "sharp"
import {
	acceptLocalPictureAnimation,
	CHAPTER_ANIMATION_CANDIDATE_LIMIT,
	canAnimateRegion,
	FILM_LOCAL_ANIMATION_LIMIT,
	isInsidePicture,
	pictureAnimationFilters,
} from "./pictureAnimation"
import { pictureAnimationChoices } from "./pictureAnimationChoices"
import { toVideoSceneBuildHash } from "./renderVideoScene"
import * as filmLock from "./topicVideoLock"
import { encodeVideoShot } from "./videoEncode"
import { toLowerThirdPng, toVideoStillPng } from "./videoFrames"
import { checkVideoSceneOutput } from "./videoSceneOutput"
import {
	planVideoScenes,
	resolveSavedVideoScenePlan,
	sha256Hash,
	toStoredVideoScenePlan,
	verifyVideoScenePlan,
} from "./videoScenePlan"
import { reserveChapterAnimation, saveVideoScenePlan } from "./videoSceneStorage"

const sourceImageHash = sha256Hash("waterfront")
const region = { sourceImageHash, effect: "water" as const, top: 610, bottom: 860, left: 470, right: 830 }
const videoSceneImages = [{ sourceImageHash: sourceImageHash, width: 1280, height: 720, origin: "resource" as const }]
const input = {
	episode: "episode",
	position: 0,
	frameCount: 240,
	startSeconds: 2,
	title: "Waterfront",
	captions: [],
	sourceImageHashes: [sourceImageHash],
	videoSceneImages,
}
const expected = planVideoScenes(input)

test("an existing animation selection survives the renderer rename for a retry and a competing film render", () => {
	// These are the two source fingerprints from before and after the scene image rename.
	const publishedBuild = "e14d44279057bdf0fafc7725276fae9d37277a2d0dfad6dee9c5efc04254b4ae"
	const renamedBuild = "aff8b4e73f4e1b688a572c3e6c131978644c6f442f8178863cb46b7cf36ad7aa"
	const previous = planVideoScenes({ ...input, renderBuild: publishedBuild })
	const selected = verifyVideoScenePlan({ ...previous, pictureAnimations: [region] }, previous)
	const saved = JSON.stringify(toStoredVideoScenePlan(selected))
	const current = planVideoScenes({ ...input, renderBuild: toVideoSceneBuildHash(renamedBuild) })

	// Both workers find the completed selection. A different build still has its own identity.
	for (const isRetry of [false, true]) {
		expect(reserveChapterAnimation(saved, current, isRetry, true, 100)).toEqual({
			result: { status: "ready", plan: selected },
		})
	}
	const changed = sha256Hash("different renderer")
	expect(toVideoSceneBuildHash(changed)).toBe(changed)
})

test("a retry reuses a first-format selection only for the same approved scene images", () => {
	const { videoSceneImages, ...fields } = expected
	const saved = JSON.stringify({
		...fields,
		version: 1,
		inputHash: sha256Hash("first renderer"),
		inventory: videoSceneImages.map(({ sourceImageHash, animationFileHash, ...image }) => ({
			...image,
			id: sourceImageHash,
			motion: animationFileHash,
		})),
		beats: fields.beats.map(({ sourceImageHash, ...shot }) => ({ ...shot, asset: sourceImageHash })),
		pictureMotions: [
			{
				effect: region.effect,
				top: region.top,
				bottom: region.bottom,
				left: region.left,
				right: region.right,
				asset: region.sourceImageHash,
			},
		],
	})
	expect(reserveChapterAnimation(saved, expected, true, true, 100).result).toEqual({
		status: "ready",
		plan: { ...expected, pictureAnimations: [region] },
	})
	expect(reserveChapterAnimation(saved, expected, false, true, 100).result.status).toBe("ready")
	const pending = JSON.stringify({ plan: JSON.parse(saved), until: 10_100, attempt: "first-worker" })
	expect(reserveChapterAnimation(pending, expected, false, true, 100).result).toEqual({ status: "wait" })
	const removed = planVideoScenes({ ...input, videoSceneImages: [] })
	expect(() => reserveChapterAnimation(saved, removed, true, true, 100)).toThrow("no longer approved")
})

test.skipIf(!Bun.which("ffmpeg"))(
	"a glint brightens visibly within its selected area and stays still outside",
	async () => {
		// render one cycle across a gray patch with the production filter
		const filters = pictureAnimationFilters({ effect: "glint", left: 0, top: 0, right: 50, bottom: 200 }, 0, 0, 96)
		const columns = 8
		const pixels = await runFfmpeg({
			ffmpegArguments: [
				"-f",
				"lavfi",
				"-i",
				"color=c=0x999999:s=512x576:r=24:d=0.04",
				"-filter_complex_threads",
				"1",
				"-filter_complex",
				[...filters, "[animation0]scale=8:1:flags=area,format=gray[samples]"].join(";"),
				"-map",
				"[samples]",
				"-frames:v",
				"96",
				"-c:v",
				"rawvideo",
				"-f",
				"rawvideo",
				"pipe:1",
			],
			timeoutMs: 10000,
		})

		// compare a column under the traveling highlight with one outside the selected half
		expect(pixels.length).toBe(96 * columns)
		const inside = pixels.filter((_, i) => i % columns === 1)
		const outside = pixels.filter((_, i) => i % columns === 6)
		expect(Math.max(...inside) - Math.min(...inside)).toBeGreaterThan(32)
		expect(new Set(outside).size).toBe(1)
	},
)

test.skipIf(!Bun.which("ffmpeg") || !Bun.which("ffprobe"))(
	"a moving first picture with attribution passes the publication format and frame checks",
	async () => {
		const directory = await mkdtemp(join(tmpdir(), "picture-animation-"))
		try {
			// Use the real image and title encoders so color range is checked after compositing.
			const stillPath = join(directory, "photo.png")
			const lowerThirdPath = join(directory, "title.png")
			const shotPath = join(directory, "chapter.mp4")
			const picture = await sharp({ create: { width: 1280, height: 720, channels: 3, background: "#2299aa" } })
				.jpeg()
				.toBuffer()
			await Bun.write(stillPath, await toVideoStillPng(picture))
			await Bun.write(lowerThirdPath, await toLowerThirdPng({ title: "Waterfront", detail: "Example" }))

			// Check the same output contract used before the chapter enters a ready film.
			await encodeVideoShot({
				stillPath,
				shotPath,
				pictureAnimation: region,
				zoomLimit: 1,
				move: "zoom-in",
				frameCount: 8,
				screenFrameCount: 8,
				isSegmentStart: true,
				isSegmentEnd: true,
				previousShot: null,
				lowerThird: { lowerThirdPath, shotStartSeconds: 0, isShownThroughout: true },
			})
			await checkVideoSceneOutput(shotPath, 8)
		} finally {
			await rm(directory, { recursive: true, force: true })
		}
	},
	30000,
)

test("replays the same region and refuses changed image bytes, borders, origins and untrusted effects", () => {
	const planned = verifyVideoScenePlan({ ...expected, pictureAnimations: [region] }, expected)
	expect(resolveSavedVideoScenePlan(JSON.stringify(planned), expected, true)).toEqual(planned)
	for (const invalid of [
		{ ...region, effect: "paper" },
		{ ...region, sourceImageHash: sha256Hash("other") },
		{ ...region, right: 1001 },
		{ ...region, left: 910 },
		{ ...region, effect: "crop=1:1" },
	]) {
		expect(() => verifyVideoScenePlan({ ...expected, pictureAnimations: [invalid] }, expected)).toThrow()
	}
	expect(() => verifyVideoScenePlan({ ...expected, pictureAnimations: [region, region] }, expected)).toThrow()
	expect(isInsidePicture(region, { width: 360, height: 720 })).toBe(false)
	expect(canAnimateRegion(region, "house")).toBe(false)
})

test("a chapter can save and replay ten moving pictures and rejects an eleventh", () => {
	// show an additional eligible picture beyond the planning limit
	const sourceImageHashes = Array.from({ length: 11 }, (_, index) => sha256Hash(`harbor-${index}`))
	const plan = planVideoScenes({
		...input,
		frameCount: 2000,
		sourceImageHashes,
		videoSceneImages: sourceImageHashes.map((sourceImageHash) => ({
			sourceImageHash,
			width: 1280,
			height: 720,
			origin: "resource",
		})),
	})

	// check the largest allowed selection against the same approved pictures on replay
	const regions = sourceImageHashes.map((sourceImageHash) => ({ ...region, sourceImageHash }))
	const selected = verifyVideoScenePlan(
		{ ...plan, pictureAnimations: regions.slice(0, CHAPTER_ANIMATION_CANDIDATE_LIMIT) },
		plan,
	)
	expect(selected.pictureAnimations).toHaveLength(10)
	expect(resolveSavedVideoScenePlan(JSON.stringify(selected), plan, true)).toEqual(selected)
	expect(() => verifyVideoScenePlan({ ...plan, pictureAnimations: regions }, plan)).toThrow()
})

test("concurrent renders join the reservation and a crashed planner consumes only one attempt", () => {
	const reserved = reserveChapterAnimation(null, expected, false, true, 100)
	expect(reserved.result.status).toBe("select")
	const bytes = JSON.stringify(reserved.save)
	expect(reserveChapterAnimation(bytes, expected, true, true, 200).result.status).toBe("wait")
	const expired = reserveChapterAnimation(bytes, expected, true, true, 1000000)
	expect(expired.save).toEqual(expected)
	expect(
		reserveChapterAnimation(JSON.stringify(toStoredVideoScenePlan(expected)), expected, true, true, 1000001),
	).toEqual({
		result: { status: "ready", plan: expected },
	})
	const replaced = planVideoScenes({ ...input, videoSceneImages: [] })
	expect(() => reserveChapterAnimation(bytes, replaced, true, true, 200)).toThrow("no longer approved")
})

test.each(["reservation", "selection", "commit"] as const)(
	"a failure during %s frees the next render",
	async (stage) => {
		const stop = new AbortController()
		let stored: Uint8Array = new Uint8Array()
		const lock = spyOn(filmLock, "withTopicVideoLock").mockImplementation((_episode, action) => action())
		const exists = spyOn(storage, "attachmentExists").mockImplementation(async () => stored.byteLength > 0)
		const read = spyOn(storage, "getAttachmentBytes").mockImplementation(async () => {
			if (stage === "commit") {
				stop.abort(Error("Film cancelled"))
			}
			return stored
		})
		const write = spyOn(storage, "uploadAttachment").mockImplementation(async (_key, bytes) => {
			stored = bytes
			if (stage === "reservation") {
				stop.abort(Error("Film cancelled"))
			}
		})
		try {
			let calls = 0
			const select = async (): Promise<(typeof region)[]> => {
				calls++
				if (stage === "selection") {
					throw Error("Selection failed")
				}
				return [region]
			}
			await expect(saveVideoScenePlan(expected, false, select, stop.signal)).rejects.toThrow(
				stage === "selection" ? "Selection failed" : "Film cancelled",
			)
			expect(JSON.parse(new TextDecoder().decode(stored))).toEqual(toStoredVideoScenePlan(expected))
			expect(await saveVideoScenePlan(expected, true, select)).toEqual(expected)
			expect(calls).toBe(stage === "reservation" ? 0 : 1)
		} finally {
			write.mockRestore()
			read.mockRestore()
			exists.mockRestore()
			lock.mockRestore()
		}
	},
)

test("a flat sky offers no water animation and a textured lower surface offers an identified crop", async () => {
	const width = 512,
		height = 288,
		pixels = Buffer.alloc(width * height * 3)
	for (let y = 0; y < height; y++) {
		const color = y < 160 ? [120, 187, 239] : [21, 86 + (y % 6) * 11, 129 + (y % 6) * 10]
		for (let x = 0; x < width; x++) {
			pixels.set(color, (y * width + x) * 3)
		}
	}
	const thumbnail = await sharp(pixels, { raw: { width, height, channels: 3 } })
		.png()
		.toBuffer()
	const { choices } = await pictureAnimationChoices(
		{
			sourceImageHash: sourceImageHash,
			width: 1280,
			height: 720,
			origin: "resource",
			thumbnail: async () => thumbnail,
		},
		1,
	)
	const water = [...choices].find(([, choice]) => choice.effect === "water")
	expect(water).toBeDefined()
	expect(water?.[0]).toBeGreaterThan(4)
	expect(water?.[1].top).toBeGreaterThanOrEqual(440)
})

test("repeated local effects stay available after eight distinct pictures", () => {
	// Each chapter receives the same set, and a repeat never takes another slot.
	const shown = new Set<string>()
	for (let i = 0; i < 8; i++) {
		expect(acceptLocalPictureAnimation(shown, String(i))).toBe(true)
	}
	expect(shown.size).toBe(FILM_LOCAL_ANIMATION_LIMIT)
	expect(acceptLocalPictureAnimation(shown, "0")).toBe(true)
	expect(acceptLocalPictureAnimation(shown, "ninth")).toBe(false)
	expect(shown.size).toBe(8)
})
