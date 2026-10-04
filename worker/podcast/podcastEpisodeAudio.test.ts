// podcast episode audio tests: the chapter times, and the ffmpeg join over two short chapter files
import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SPEECH_BYTES_PER_SECOND, toWavBytes, WAV_HEADER_BYTES } from "../speech"
import { joinChapterFiles, toChapterTimes } from "./podcastEpisodeAudio"

// the byte size of a WAV file of the given length
function toWavByteSize(seconds: number): number {
	return WAV_HEADER_BYTES + seconds * SPEECH_BYTES_PER_SECOND
}

test("toChapterTimes starts each chapter where the one before it ends", () => {
	// chapters of 155, 143, and 142 seconds
	const chapterTimes = toChapterTimes([toWavByteSize(155), toWavByteSize(143), toWavByteSize(142)])
	expect(chapterTimes.map((chapterTime) => chapterTime.startSeconds)).toEqual([0, 155, 298])
	expect(chapterTimes.at(-1)?.endSeconds).toBe(440)
})

test("toChapterTimes gives an empty file no length", () => {
	expect(toChapterTimes([WAV_HEADER_BYTES, toWavByteSize(2)])).toEqual([
		{ startSeconds: 0, endSeconds: 0 },
		{ startSeconds: 0, endSeconds: 2 },
	])
})

// the join needs ffmpeg, which the runtime image has and a developer's machine may not
test.skipIf(!Bun.which("ffmpeg"))("joinChapterFiles writes one 64 kbps mono MP3 from two chapter files", async () => {
	const temporaryDirectory = await mkdtemp(join(tmpdir(), "episode-test-"))
	try {
		// two chapters of one second each, as a quiet 220 Hz tone
		const toneSamples = Int16Array.from({ length: SPEECH_BYTES_PER_SECOND / 2 }, (_, i) =>
			Math.round(Math.sin((i * 2 * Math.PI * 220) / 24_000) * 8_000),
		)
		const chapterBytes = toWavBytes(new Uint8Array(toneSamples.buffer))
		const chapterPaths = [join(temporaryDirectory, "0.wav"), join(temporaryDirectory, "1.wav")]
		await Promise.all(chapterPaths.map((chapterPath) => Bun.write(chapterPath, chapterBytes)))

		// join the chapters, then read the MP3's stream with ffprobe
		const audioPath = join(temporaryDirectory, "audio.mp3")
		await joinChapterFiles({ temporaryDirectory, chapterPaths, audioPath })
		const probeArguments = ["-v", "error", "-show_entries", "stream=codec_name,channels,bit_rate,sample_rate"]
		const probeProcess = Bun.spawn(["ffprobe", ...probeArguments, "-of", "json", audioPath], { stdout: "pipe" })
		const [audioStream] = (await new Response(probeProcess.stdout).json()).streams

		// one mp3 channel at the podcast's bitrate and sample rate
		expect(audioStream).toEqual({ codec_name: "mp3", channels: 1, bit_rate: "64000", sample_rate: "44100" })
		expect(Bun.file(audioPath).size).toBeGreaterThan(8_000)
	} finally {
		await rm(temporaryDirectory, { recursive: true, force: true })
	}
})
