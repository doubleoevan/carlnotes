// Keep the test runner's own resident memory outside the process tree under measurement.
import { expect, spyOn, test } from "bun:test"
import * as fs from "node:fs/promises"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import {
	checkVideoRenderResourceLimits,
	readFilmProcessTree,
	withVideoRenderResourceLimits,
} from "./videoRenderResourceLimits"

import { runVideoSceneProcess } from "./videoSceneProcess"

test.skipIf(!Bun.which("ffmpeg"))(
	"the film memory limit includes a live FFmpeg descendant",
	async () => {
		// A small shell waits for the encoder. Its process id remains stable until the child exits.
		const restore = saveEnvSettings(["TOPIC_VIDEO_MEMORY_LIMIT_MIB"])
		const directory = await mkdtemp(join(tmpdir(), "film-resource-limit-test-"))
		const worker = Bun.spawn(
			[
				"sh",
				"-c",
				"read -r start || exit 0; ffmpeg -hide_banner -loglevel error -progress pipe:1 -re -f lavfi -i color=s=64x64 -t 4 -f null - & wait",
			],
			{
				stdin: "pipe",
				stdout: "pipe",
				stderr: "ignore",
			},
		)
		try {
			// Give the idle worker headroom, then check the same tree with its encoder running.
			const idle = await readFilmProcessTree(worker.pid)
			Bun.env.TOPIC_VIDEO_MEMORY_LIMIT_MIB = String(Math.ceil(idle.rss / 1024) + 4)
			await checkVideoRenderResourceLimits(worker.pid, directory)
			worker.stdin.write("start\n")
			worker.stdin.flush()
			await worker.stdout.getReader().read()
			expect((await readFilmProcessTree(worker.pid)).ids.size).toBeGreaterThan(1)
			await expect(checkVideoRenderResourceLimits(worker.pid, directory)).rejects.toThrow("MiB memory limit")
		} finally {
			worker.stdin.end()
			await worker.exited
			restore()
			await rm(directory, { recursive: true, force: true })
		}
	},
	8000,
)

test.each(["cancel", "timeout"] as const)(
	"a stalled disk sample allows the render to %s",
	async (mode) => {
		// leave the first disk read pending until after the supervisor returns
		const started = Promise.withResolvers<void>()
		const stalled = Promise.withResolvers<never>()
		const read = spyOn(fs, "lstat").mockImplementation(() => {
			started.resolve()
			return stalled.promise
		})
		const controller = new AbortController()
		let enteredRender = false
		try {
			const render = withVideoRenderResourceLimits(".", controller.signal, async () => {
				enteredRender = true
			})
			await started.promise
			if (mode === "cancel") {
				controller.abort(Error("cancelled film"))
				await expect(render).rejects.toBe(controller.signal.reason)
			} else {
				await expect(render).rejects.toMatchObject({ name: "TimeoutError" })
			}
			expect(enteredRender).toBe(false)
		} finally {
			read.mockRestore()
			stalled.reject(Error("end of disk sample"))
		}
	},
	8000,
)

test("a capture can cancel while the input file read is still pending", async () => {
	// hold the private capture's input before Chromium can launch
	const directory = await fs.mkdtemp(join(tmpdir(), "video-scene-input-"))
	const started = Promise.withResolvers<void>()
	const pending = Promise.withResolvers<never>()
	const read = spyOn(fs, "readFile").mockImplementation(() => {
		started.resolve()
		return pending.promise
	})
	const controller = new AbortController()
	try {
		const capture = runVideoSceneProcess({
			inputPath: join(directory, "capture.json"),
			directory,
			filmDirectory: directory,
			frameCount: 24,
			signal: controller.signal,
		})
		await Promise.race([started.promise, capture])
		controller.abort(Error("capture input cancelled"))
		await expect(capture).rejects.toBe(controller.signal.reason)
	} finally {
		read.mockRestore()
		pending.reject(Error("end of input test"))
		await rm(directory, { recursive: true, force: true })
	}
})
