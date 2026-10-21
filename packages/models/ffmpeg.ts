// one ffmpeg run through its pipes, for the chapter join, the cover encode, and a chat recording's transcode

// one run. ffmpeg's arguments after the quiet flags, the bytes for its input pipe if the run reads one,
// and how long the run may take before it is killed, with no limit by default
export type RunFfmpegOptions = { ffmpegArguments: string[]; inputBytes?: Uint8Array; timeoutMs?: number }

/**
 * Runs ffmpeg quietly with the arguments, feeding its input pipe if bytes are given, and returns its output pipe's
 * bytes. Throws an error with ffmpeg's error text on a nonzero exit, which a run killed at its timeout is too.
 */
export async function runFfmpeg({ ffmpegArguments, inputBytes, timeoutMs }: RunFfmpegOptions): Promise<Uint8Array> {
	// run ffmpeg with only its errors logged, the input on its input pipe, and the output on its output pipe.
	// a run past its timeout is killed outright, so it exits nonzero and never finishes its output
	const ffmpegProcess = Bun.spawn(["ffmpeg", "-hide_banner", "-loglevel", "error", ...ffmpegArguments], {
		stdin: inputBytes ?? "ignore",
		stdout: "pipe",
		stderr: "pipe",
		timeout: timeoutMs,
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
