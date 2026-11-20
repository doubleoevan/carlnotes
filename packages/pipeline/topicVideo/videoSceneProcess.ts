// Supervise offline capture with owned handles for Chromium, the frame producer and the encoder.
import { type ChildProcess, spawn } from "node:child_process"
import { once } from "node:events"
import { readFile } from "node:fs/promises"
import { pipeline } from "node:stream/promises"
import { fileURLToPath } from "node:url"
import { toChildProcessEnvironment } from "@carlnotes/server/childProcessRequest"
import { chromium } from "playwright-core"
import type { CaptureChapterInput } from "./captureVideoScene"
import { H264_ARGUMENTS } from "./videoH264"
import { withVideoRenderResourceLimits } from "./videoRenderResourceLimits"

const STALL_MS = 60_000

type RunVideoSceneProcessOptions = {
	inputPath: string
	directory: string
	filmDirectory: string
	frameCount: number
	signal?: AbortSignal
	onFirstFrame?: (encoder: ChildProcess) => void
}

/** Runs a capture with bounded pipes and keeps worker credentials out of its child processes. */
export async function runVideoSceneProcess(options: RunVideoSceneProcessOptions): Promise<void> {
	// enforce both clocks even while a memory or filesystem sample is pending
	const stop = new AbortController()
	const deadline = Math.min(3.75 * 3600_000, 120_000 + options.frameCount * 1000)
	const signals = [stop.signal, AbortSignal.timeout(deadline)]
	const signal = AbortSignal.any(options.signal ? [...signals, options.signal] : signals)
	const stall = setTimeout(() => stop.abort(Error("Video scene capture stopped delivering frames")), STALL_MS)
	try {
		await withVideoRenderResourceLimits(options.filmDirectory, signal, (activeSignal) =>
			captureWithBrowser(options, activeSignal, () => stall.refresh()),
		)
	} finally {
		clearTimeout(stall)
	}
}

// keep Chromium under Playwright's process handle, including helpers in its separate process group
async function captureWithBrowser(
	{ inputPath, directory, onFirstFrame }: RunVideoSceneProcessOptions,
	signal: AbortSignal,
	progress: () => void,
): Promise<void> {
	// supply only the settings the offline browser and encoder require
	const input = await readCaptureInput(inputPath, signal)
	const env = toChildProcessEnvironment(directory, ["PATH", "HOME", "PLAYWRIGHT_BROWSERS_PATH"])

	// bound browser startup and dispose of its process group on every exit
	signal.throwIfAborted()
	const server = await chromium.launchServer({
		host: "127.0.0.1",
		chromiumSandbox: true,
		args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
		env,
		timeout: 30_000,
	})
	try {
		signal.throwIfAborted()
		await captureFrames({
			inputPath,
			directory,
			output: input.output,
			env,
			endpoint: server.wsEndpoint(),
			onFirstFrame,
			signal,
			progress,
		})
	} finally {
		await server.kill()
	}
}

// cancel the read and release the capture deadline even if the filesystem has an outstanding operation
async function readCaptureInput(path: string, signal: AbortSignal): Promise<CaptureChapterInput> {
	// a promise that rejects once the signal aborts
	signal.throwIfAborted()
	const stopped = Promise.withResolvers<never>()
	const stop = (): void => stopped.reject(signal.reason)
	signal.addEventListener("abort", stop, { once: true })

	// the first of the read and the abort decides
	try {
		const text = await Promise.race([readFile(path, { encoding: "utf8", signal }), stopped.promise])
		return JSON.parse(text)
	} finally {
		signal.removeEventListener("abort", stop)
	}
}

type CaptureFramesOptions = Pick<RunVideoSceneProcessOptions, "inputPath" | "directory" | "onFirstFrame"> & {
	output: string
	env: Record<string, string>
	endpoint: string
	signal: AbortSignal
	progress: () => void
}

// own both ends of the pipe so a stopped encoder or a blocked capture can always be killed and reaped
async function captureFrames({
	inputPath,
	directory,
	output,
	env,
	endpoint,
	onFirstFrame,
	signal,
	progress,
}: CaptureFramesOptions): Promise<void> {
	// match the montage's limited-range H.264 settings when reading full-range browser JPEGs
	const encoder = spawn(
		"ffmpeg",
		[
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-threads",
			"2",
			"-f",
			"image2pipe",
			"-framerate",
			"24",
			"-vcodec",
			"mjpeg",
			"-i",
			"pipe:0",
			"-vf",
			"scale=in_range=full:out_range=limited,format=yuv420p",
			"-color_range",
			"tv",
			...H264_ARGUMENTS,
			"-threads",
			"2",
			"-an",
			output,
		],
		{ cwd: directory, env, stdio: ["pipe", "ignore", "inherit"] },
	)
	const capture = spawn(
		process.execPath,
		["--no-env-file", fileURLToPath(new URL("./captureVideoScene.ts", import.meta.url)), inputPath],
		{ cwd: directory, env: { ...env, VIDEO_SCENE_BROWSER_ENDPOINT: endpoint }, stdio: ["ignore", "pipe", "inherit"] },
	)

	// expose the live encoder before the first bytes reach it and reset the stall timer as frames flow
	if (onFirstFrame) {
		capture.stdout.once("data", () => onFirstFrame(encoder))
	}
	capture.stdout.on("data", progress)

	// both children's exits, and a stop that kills whichever is still running
	const processes = [waitForCaptureExit(encoder), waitForCaptureExit(capture)]
	const stopChildren = (): void => {
		for (const child of [capture, encoder]) {
			if (child.exitCode === null && child.signalCode === null) {
				child.kill("SIGKILL")
			}
		}
	}

	// stop blocked children even when the frame pipe has already closed
	signal.addEventListener("abort", stopChildren, { once: true })
	try {
		await Promise.all([...processes, pipeline(capture.stdout, encoder.stdin, { signal })])
	} catch (error) {
		signal.throwIfAborted()
		throw error
	} finally {
		// release the abort listener and wait for both owned children to exit
		signal.removeEventListener("abort", stopChildren)
		stopChildren()
		await Promise.allSettled(processes)
	}
}

// fail the capture if the encoder or the frame producer exits unsuccessfully
async function waitForCaptureExit(child: ChildProcess): Promise<void> {
	const [code] = await once(child, "close")
	if (code !== 0) {
		throw Error(`Video scene process exited with status ${code}`)
	}
}
