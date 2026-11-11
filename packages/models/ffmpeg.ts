// one ffmpeg run through its pipes, for the chapter join, the cover encode, a chat recording's transcode, and the film
// render, and the ffprobe read of a media file's length

// how long ffprobe may take to read a file's length
const PROBE_TIMEOUT_MS = 60_000

// one run. ffmpeg's arguments after the quiet flags, the bytes for its input pipe if the run reads one, how long the
// run may take before it is killed, with no limit by default, and a signal that kills the run once it aborts
export type RunFfmpegOptions = {
	ffmpegArguments: string[]
	inputBytes?: Uint8Array
	timeoutMs?: number
	signal?: AbortSignal
}

/**
 * Runs ffmpeg quietly with the arguments, feeding its input pipe if bytes are given, and returns its output pipe's
 * bytes. Throws an error with ffmpeg's error text on a nonzero exit, which a run killed at its timeout or by its
 * signal is too.
 */
export async function runFfmpeg({
	ffmpegArguments,
	inputBytes,
	timeoutMs,
	signal,
}: RunFfmpegOptions): Promise<Uint8Array> {
	// run ffmpeg with only its errors logged, the input on its input pipe, and the output on its output pipe.
	// a run past its timeout or whose signal aborts is killed outright, so it exits nonzero and never finishes its output
	const ffmpegProcess = Bun.spawn(["ffmpeg", "-hide_banner", "-loglevel", "error", ...ffmpegArguments], {
		stdin: inputBytes ?? "ignore",
		stdout: "pipe",
		stderr: "pipe",
		timeout: timeoutMs,
		signal,
		killSignal: "SIGKILL",
	})

	// read the output and the error text, and throw an error with what ffmpeg printed if the run failed
	const [outputBytes, errorText, exitCode] = await Promise.all([
		new Response(ffmpegProcess.stdout).arrayBuffer(),
		new Response(ffmpegProcess.stderr).text(),
		ffmpegProcess.exited,
	])
	if (exitCode !== 0) {
		throw new Error(`ffmpeg exited with ${exitCode}: ${errorText.trim().slice(0, 500)}`)
	}
	return new Uint8Array(outputBytes)
}

/**
 * Returns a media file's length in seconds, read by ffprobe from its container. Throws an error if ffprobe cannot
 * read the file, or is killed at its one-minute timeout or by the signal.
 */
export async function probeDurationSeconds(filePath: string, signal?: AbortSignal): Promise<number> {
	// print only the container's duration, as a bare number. a read past its timeout or whose signal aborts is killed
	const ffprobeProcess = Bun.spawn(
		[
			"ffprobe",
			"-v",
			"error",
			"-show_entries",
			"format=duration",
			"-of",
			"default=noprint_wrappers=1:nokey=1",
			filePath,
		],
		{ stdout: "pipe", stderr: "pipe", timeout: PROBE_TIMEOUT_MS, signal, killSignal: "SIGKILL" },
	)

	// read the number, and throw an error with what ffprobe printed if it failed
	const [durationText, errorText, exitCode] = await Promise.all([
		new Response(ffprobeProcess.stdout).text(),
		new Response(ffprobeProcess.stderr).text(),
		ffprobeProcess.exited,
	])
	const durationSeconds = Number(durationText.trim())
	if (exitCode !== 0 || !Number.isFinite(durationSeconds)) {
		throw new Error(`ffprobe exited with ${exitCode}: ${errorText.trim().slice(0, 500)}`)
	}
	return durationSeconds
}
