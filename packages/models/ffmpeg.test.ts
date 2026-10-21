// ffmpeg tests: a run that reads the input pipe and writes the output pipe, a run that fails, and a run killed at
// its timeout
import { expect, test } from "bun:test"
import { runFfmpeg } from "./ffmpeg"
import { toWavBytes } from "./speech"

// the runs need ffmpeg, which the runtime image has and a developer's machine may not
test.skipIf(!Bun.which("ffmpeg"))("runFfmpeg feeds the input pipe and returns the output pipe's bytes", async () => {
	// a tenth of a second of silence as a 24 kHz WAV
	const silentWav = toWavBytes(new Uint8Array(4800))

	// resample it to 8 kHz through the pipes
	const resampledWav = await runFfmpeg({
		ffmpegArguments: ["-i", "pipe:0", "-ar", "8000", "-f", "wav", "pipe:1"],
		inputBytes: silentWav,
	})

	// the output is a WAV at the new sample rate
	expect(new TextDecoder().decode(resampledWav.subarray(0, 4))).toBe("RIFF")
	expect(new DataView(resampledWav.buffer, resampledWav.byteOffset).getUint32(24, true)).toBe(8000)
})

test.skipIf(!Bun.which("ffmpeg"))("runFfmpeg throws ffmpeg's error text on a failed run", async () => {
	// an input file that does not exist
	const failedRun = runFfmpeg({ ffmpegArguments: ["-i", "/nonexistent/recording.webm", "-f", "wav", "pipe:1"] })
	await expect(failedRun).rejects.toThrow(/^ffmpeg exited with \d+: [\s\S]*nonexistent/)
})

// a run past its timeout is killed, so a run that would not end on its own is never left running
test.skipIf(!Bun.which("ffmpeg"))("runFfmpeg kills a run that passes its timeout", async () => {
	// an hour of silence written at the pace it plays, which the timeout cuts off at once
	const longRun = runFfmpeg({
		ffmpegArguments: ["-re", "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", "3600", "-f", "wav", "pipe:1"],
		timeoutMs: 50,
	})
	await expect(longRun).rejects.toThrow(/^ffmpeg exited with \d+/)
})
