// A release-image smoke test for the offline graphics and encoding path, using a locally drawn calibration picture.

import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { chromium } from "playwright-core"
import sharp from "sharp"
import { type CaptureChapterInput, openVideoScenePage } from "./captureVideoScene"
import { ESPRESSO, toLowerThirdPng } from "./videoFrames"
import { checkVideoSceneOutput } from "./videoSceneOutput"
import { planVideoScenes, sha256Hash } from "./videoScenePlan"
import { runVideoSceneProcess } from "./videoSceneProcess"

const execute = promisify(execFile)
// The private output argument identifies this smoke test's own encoder.
async function findEncoder(output: string): Promise<number | undefined> {
	const { stdout } = await execute("ps", ["-axo", "pid=,stat=,command="])
	for (const line of stdout.trim().split("\n")) {
		const match = /^\s*(\d+)\s+(\S+)\s+(?:\S*\/)?ffmpeg\s/u.exec(line)
		if (match && !match[2]?.startsWith("Z") && line.endsWith(` ${output}`)) {
			return Number(match[1])
		}
	}
	return undefined
}
const directory = await mkdtemp(join(tmpdir(), "video-scene-check-"))
try {
	// A portrait with known red pixels and two factual labels exercises the picture, text and alpha paths.
	const photo = await sharp({ create: { width: 200, height: 300, channels: 3, background: "#be301d" } })
		.jpeg()
		.toBuffer()
	const sourceImageHash = sha256Hash(photo)
	const title = "North versus South"
	const sceneInput = {
		episode: "calibration",
		position: 0,
		startSeconds: 0,
		frameCount: 96,
		title,
		sourceImageHashes: [sourceImageHash],
		captions: [{ startSeconds: 0, endSeconds: 2, lines: ["North versus South."], isAboveLowerThird: false }],
	}
	const plan = planVideoScenes(sceneInput)
	assert.equal(plan.beats[0]?.sourceImageHash, sourceImageHash)
	const input: CaptureChapterInput = {
		directory,
		bundle: fileURLToPath(new URL("./dist/videoSceneBrowser.js", import.meta.url)),
		output: join(directory, "silent.mp4"),
		document: {
			plan,
			imageFiles: [{ sourceImageHash, url: `/${sourceImageHash}.jpg` }],
			lowerThird: "/plate.png",
			espresso: ESPRESSO,
		},
	}
	const capturePath = join(directory, "capture.json")
	await Bun.write(join(directory, `${sourceImageHash}.jpg`), photo)
	await Bun.write(join(directory, "plate.png"), await toLowerThirdPng({ title, detail: "example.org" }))
	await Bun.write(capturePath, JSON.stringify(input))
	const browser = await chromium.launch({
		chromiumSandbox: true,
		args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
	})
	try {
		// Seeking to an earlier frame restores precisely the same decoded pixels.
		const page = await openVideoScenePage(browser, input)
		const read = async (frame: number): Promise<Buffer> =>
			sharp(Buffer.from(await page.evaluate((f) => window.drawVideoScene(f), frame), "base64"))
				.raw()
				.toBuffer()
		const first = await read(35)
		assert.notDeepEqual(await read(70), first)
		assert.deepEqual(await read(35), first)
		let reds = 0,
			light = 0
		for (let i = 0; i < first.length; i += 3) {
			const red = first.readUInt8(i)
			const green = first.readUInt8(i + 1)
			const blue = first.readUInt8(i + 2)
			if (red > 140 && green < 85 && blue < 65) {
				reds++
			}
			if (red > 210 && green > 200 && blue > 180) {
				light++
			}
		}
		assert.ok(reds > 2000 && light > 100, "Image and attribution must both survive software capture")
	} finally {
		await browser.close()
	}
	// Exercise the capture, its encoded frame count and cancellation during startup.
	const capture = { inputPath: capturePath, directory, filmDirectory: directory, frameCount: 96 }
	await runVideoSceneProcess(capture)
	await checkVideoSceneOutput(input.output, 96)
	const cancelled = AbortSignal.timeout(150)
	await assert.rejects(runVideoSceneProcess({ ...capture, signal: cancelled }), (error) => error === cancelled.reason)

	// Stop the owned encoder before its first frame reaches stdin, then cancel the blocked pipe.
	const controller = new AbortController()
	const stopped = Promise.withResolvers<void>()
	const run = runVideoSceneProcess({
		...capture,
		signal: controller.signal,
		onFirstFrame: (encoder) => {
			if (encoder.kill("SIGSTOP")) {
				stopped.resolve()
			} else {
				stopped.reject(Error("Could not stop the smoke encoder"))
			}
		},
	})
	try {
		await Promise.race([
			stopped.promise,
			run.then(() => {
				throw Error("Capture finished before the encoder stopped")
			}),
		])
		await Bun.sleep(400)
	} finally {
		controller.abort()
		await Promise.allSettled([run])
	}
	await assert.rejects(run, (error) => error === controller.signal.reason)
	assert.equal(await findEncoder(input.output), undefined, "A stopped encoder survived cancellation")
	console.log(
		"Offline film graphics passed: deterministic seeks, textured portrait, labels, 96 H.264 frames, startup cancellation, stalled encoder and pipe cancellation",
	)
} finally {
	await rm(directory, { recursive: true, force: true })
}
