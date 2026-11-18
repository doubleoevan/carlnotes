// Check which pictures can use the film's single provider request and how retries resolve it.
import { expect, spyOn, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as storage from "@carlnotes/db/store"
import { runFfmpeg } from "@carlnotes/models/ffmpeg"
import { decideGeneratedAnimation, loadOrGenerateAnimation } from "./generatedAnimationStorage"
import { prepareSilentPictureAnimation, selectGeneratedAnimation } from "./generatedPictureAnimation"
import * as filmLock from "./topicVideoLock"
import { planVideoScenes, sha256Hash } from "./videoScenePlan"

test("only a shown generated illustration with selected animation can use Omni", () => {
	const origins = ["resource", "house", "generated", "generated"] as const
	const sceneImages = origins.map((origin, index) => ({
		sourceImageHash: sha256Hash(String(index)),
		width: 1280,
		height: 720,
		origin,
		...(index === 2 ? { animationFileHash: sha256Hash("reviewed") } : {}),
	}))
	const plan = planVideoScenes({
		episode: "episode",
		position: 0,
		frameCount: 1200,
		startSeconds: 0,
		title: "",
		captions: [],
		sourceImageHashes: sceneImages.map((i) => i.sourceImageHash),
		sceneImages,
	})
	const regions = sceneImages.map((i) => ({
		sourceImageHash: i.sourceImageHash,
		effect: "foliage" as const,
		left: 100,
		right: 400,
		top: 200,
		bottom: 400,
	}))

	// Prefer the approved loop for its source. Ignore fetched pictures, the hosts and any unused picture.
	expect(selectGeneratedAnimation({ ...plan, pictureAnimations: regions })).toEqual(regions[3])
	expect(
		selectGeneratedAnimation({
			...plan,
			beats: plan.beats.filter((b) => b.sourceImageHash !== sceneImages[3]?.sourceImageHash),
			pictureAnimations: regions,
		}),
	).toBeUndefined()
	expect(selectGeneratedAnimation(plan)).toBeUndefined()
})

test("one paid call per film survives a retry, a changed source, a timeout and provider failure", () => {
	const reserved = { sourceImageHash: "same", status: "pending" as const, started: 100 }
	expect(
		decideGeneratedAnimation({ asset: "same", started: 100, status: "ready", digest: "cached" }, "same", 200, true),
	).toEqual({
		kind: "reuse",
		animationFileHash: "cached",
	})
	expect(decideGeneratedAnimation(null, "same", 100, false).kind).toBe("generate")
	expect(decideGeneratedAnimation(null, "same", 100, true).kind).toBe("skip")
	expect(decideGeneratedAnimation(reserved, "other", 200, false).kind).toBe("skip")
	expect(decideGeneratedAnimation(reserved, "same", 200, true).kind).toBe("wait")
	expect(decideGeneratedAnimation(reserved, "same", 1_000_000, false).kind).toBe("skip")
	expect(decideGeneratedAnimation({ ...reserved, animationFileHash: "validated" }, "same", 1_000_000, true)).toEqual({
		kind: "recover",
		animationFileHash: "validated",
	})
	expect(decideGeneratedAnimation({ ...reserved, status: "skipped" }, "same", 200, false).kind).toBe("skip")
	expect(
		decideGeneratedAnimation({ ...reserved, status: "ready", animationFileHash: "video" }, "same", 200, true),
	).toEqual({
		kind: "reuse",
		animationFileHash: "video",
	})
})

test("a failed ready write recovers the approved upload without generating the animation twice", async () => {
	// Lose the first acknowledgement after uploading the video. Keep the object bytes across the retry.
	const objects = new Map<string, Uint8Array>()
	const lock = spyOn(filmLock, "withTopicVideoLock").mockImplementation((_episode, action) => action())
	const exists = spyOn(storage, "attachmentExists").mockImplementation(async (key) => objects.has(key))
	const read = spyOn(storage, "getAttachmentBytes").mockImplementation(async (key) => {
		const bytes = objects.get(key)
		if (!bytes) {
			throw Error("Missing test object")
		}
		return bytes
	})
	let loseReadyWrite = true
	const write = spyOn(storage, "uploadAttachment").mockImplementation(async (key, bytes, type) => {
		if (
			loseReadyWrite &&
			type === "application/json" &&
			JSON.parse(new TextDecoder().decode(bytes)).status === "ready"
		) {
			loseReadyWrite = false
			throw Error("Ready write interrupted")
		}
		objects.set(key, bytes)
	})
	try {
		let calls = 0
		const generate = async (): Promise<Uint8Array> => {
			calls++
			return Uint8Array.of(3, 8, 2)
		}
		await expect(loadOrGenerateAnimation("episode", "picture", false, generate)).rejects.toThrow(
			"Ready write interrupted",
		)
		expect(await loadOrGenerateAnimation("episode", "picture", true, generate)).toEqual(Uint8Array.of(3, 8, 2))
		expect(await loadOrGenerateAnimation("episode", "picture", true, generate)).toEqual(Uint8Array.of(3, 8, 2))
		expect(calls).toBe(1)
	} finally {
		write.mockRestore()
		read.mockRestore()
		exists.mockRestore()
		lock.mockRestore()
	}
})

test.skipIf(!Bun.which("ffmpeg") || !Bun.which("ffprobe"))(
	"strips provider audio and rejects a short video before storage",
	async () => {
		const folder = await mkdtemp(join(tmpdir(), "chapter-motion-test-"))
		try {
			// Supply an audio track so the test catches an accidental pass-through into the film.
			const path = join(folder, "sample.mp4")
			await runFfmpeg({
				ffmpegArguments: [
					"-f",
					"lavfi",
					"-i",
					"color=black:s=1280x720:r=24",
					"-f",
					"lavfi",
					"-i",
					"sine=frequency=200",
					"-t",
					"5",
					"-c:v",
					"libx264",
					"-threads",
					"1",
					"-preset",
					"ultrafast",
					"-c:a",
					"aac",
					path,
				],
			})
			const bytes = await prepareSilentPictureAnimation(await Bun.file(path).bytes(), folder)
			const tracks = new TextDecoder().decode(
				await runFfmpeg({
					inputBytes: bytes,
					ffmpegArguments: ["-f", "matroska", "-i", "pipe:0", "-map", "0", "-c", "copy", "-f", "streamhash", "pipe:1"],
				}),
			)
			expect(tracks.trim().split("\n")).toHaveLength(1)
			expect(tracks).toMatch(/^0,v,/u)

			// Reject a shorter provider result instead of repeating it to manufacture the missing frames.
			const short = join(folder, "short.mp4")
			await runFfmpeg({ ffmpegArguments: ["-i", path, "-t", "1", "-c", "copy", short] })
			await expect(prepareSilentPictureAnimation(await Bun.file(short).bytes(), folder)).rejects.toThrow("frame count")
		} finally {
			await rm(folder, { recursive: true, force: true })
		}
	},
)
