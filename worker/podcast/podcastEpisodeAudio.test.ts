// podcast episode audio tests: the chapter times, the theme's times and arguments, and the ffmpeg join over two short
// chapter files, without and with the theme clips
import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SPEECH_BYTES_PER_SECOND, toWavBytes, WAV_HEADER_BYTES } from "../speech"
import { joinChapterFiles, toChapterTimes, toJoinArguments } from "./podcastEpisodeAudio"
import { loadThemeClips, type ThemeClips, toThemedEpisodeTimes } from "./podcastEpisodeTheme"

// no theme clip on disk, and both 60 second clips
const NO_THEME_CLIPS: ThemeClips = { intro: null, outro: null }
const BOTH_THEME_CLIPS: ThemeClips = {
	intro: { path: "theme-intro.wav", seconds: 60 },
	outro: { path: "theme-outro.wav", seconds: 60 },
}

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

// the intro's 40 second lead shifts every chapter, and the outro's 40 seconds past the last word lengthen the episode
test("toThemedEpisodeTimes shifts the chapters by the lead and adds the outro's tail", () => {
	const chapterTimes = toChapterTimes([toWavByteSize(155), toWavByteSize(143), toWavByteSize(142)])

	// both clips: the chapters start 40 seconds later, and the episode ends 40 seconds after the last word
	const themedEpisodeTimes = toThemedEpisodeTimes(chapterTimes, BOTH_THEME_CLIPS)
	expect(themedEpisodeTimes.chapterTimes.map((chapterTime) => chapterTime.startSeconds)).toEqual([40, 195, 338])
	expect(themedEpisodeTimes.durationSeconds).toBe(520)

	// no clip: the times are the talk's own
	expect(toThemedEpisodeTimes(chapterTimes, NO_THEME_CLIPS)).toEqual({ chapterTimes, durationSeconds: 440 })

	// one clip: the intro shifts without a tail, and the outro adds a tail without a shift
	const introOnly = toThemedEpisodeTimes(chapterTimes, { ...NO_THEME_CLIPS, intro: BOTH_THEME_CLIPS.intro })
	const outroOnly = toThemedEpisodeTimes(chapterTimes, { ...NO_THEME_CLIPS, outro: BOTH_THEME_CLIPS.outro })
	expect([introOnly.chapterTimes[0]?.startSeconds, introOnly.durationSeconds]).toEqual([40, 480])
	expect([outroOnly.chapterTimes[0]?.startSeconds, outroOnly.durationSeconds]).toEqual([0, 480])
})

// with neither clip, the join runs the arguments that the join ran before the theme music
test("toJoinArguments without a theme clip normalizes and encodes the talk exactly as before", () => {
	// the join's arguments with no clip on disk
	const joinArguments = toJoinArguments({
		chapterListPath: "chapters.txt",
		audioPath: "audio.mp3",
		themeClips: NO_THEME_CLIPS,
		speechSeconds: 440,
	})

	// the chapters through the concat demuxer, the loudness filter alone, and the MP3 encode
	const chapterArguments = [
		"-hide_banner",
		"-loglevel",
		"error",
		"-y",
		"-f",
		"concat",
		"-safe",
		"0",
		"-i",
		"chapters.txt",
	]
	const loudnessArguments = ["-af", "loudnorm=I=-16:TP=-1.5:LRA=11:dual_mono=true"]
	const encodeArguments = ["-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "64k", "audio.mp3"]
	expect(joinArguments).toEqual([...chapterArguments, ...loudnessArguments, ...encodeArguments])
})

// with both clips, the clips are inputs and one filter graph mixes the clips before the loudness filter
test("toJoinArguments with both clips mixes them under the talk before the loudness filter", () => {
	const joinArguments = toJoinArguments({
		chapterListPath: "chapters.txt",
		audioPath: "audio.mp3",
		themeClips: BOTH_THEME_CLIPS,
		speechSeconds: 440,
	})
	const filterGraph = joinArguments[joinArguments.indexOf("-filter_complex") + 1] ?? ""

	// the talk waits out the 40 second lead, and the outro starts 20 seconds before the last word at 480 seconds
	expect(joinArguments).toContain("theme-intro.wav")
	expect(joinArguments).toContain("theme-outro.wav")
	expect(filterGraph).toContain("[0:a]aresample=44100,adelay=40000:all=1[talk]")
	expect(filterGraph).toContain("adelay=460000:all=1[outro]")
	expect(filterGraph).toMatch(/amix=inputs=3:normalize=0:duration=longest,loudnorm=.*\[mixed\]$/)
	expect(joinArguments.slice(-11, -9)).toEqual(["-map", "[mixed]"])
})

// the committed clips are already in the mix's format, so the recording never resamples the song
test("the theme clips are 60 second WAV files at 44.1 kHz, mono, 16-bit", async () => {
	for (const clipName of ["theme-intro.wav", "theme-outro.wav"]) {
		// read the clip's header: its channels, its sample rate, and its bits per sample
		const clipBytes = await Bun.file(new URL(`../assets/podcast/${clipName}`, import.meta.url)).arrayBuffer()
		const clipHeader = new DataView(clipBytes, 0, WAV_HEADER_BYTES)
		expect([clipHeader.getUint16(22, true), clipHeader.getUint32(24, true), clipHeader.getUint16(34, true)]).toEqual([
			1, 44_100, 16,
		])
		expect(clipBytes.byteLength).toBe(WAV_HEADER_BYTES + 60 * 44_100 * 2)
	}
})

// write two chapters of one second each, as a quiet 220 Hz tone, then join the chapters and read the MP3's stream with ffprobe
async function joinToneChapters(themeClips: ThemeClips): Promise<{ audioStream: unknown; durationSeconds: number }> {
	const temporaryDirectory = await mkdtemp(join(tmpdir(), "episode-test-"))
	try {
		// two one-second tone chapters
		const toneSamples = Int16Array.from({ length: SPEECH_BYTES_PER_SECOND / 2 }, (_, i) =>
			Math.round(Math.sin((i * 2 * Math.PI * 220) / 24_000) * 8_000),
		)
		const chapterBytes = toWavBytes(new Uint8Array(toneSamples.buffer))
		const chapterPaths = [join(temporaryDirectory, "0.wav"), join(temporaryDirectory, "1.wav")]
		await Promise.all(chapterPaths.map((chapterPath) => Bun.write(chapterPath, chapterBytes)))

		// join the chapters, then read the MP3's stream and its length
		const audioPath = join(temporaryDirectory, "audio.mp3")
		await joinChapterFiles({ temporaryDirectory, chapterPaths, audioPath, themeClips, speechSeconds: 2 })
		const probeArguments = [
			"-v",
			"error",
			"-show_entries",
			"stream=codec_name,channels,bit_rate,sample_rate:format=duration",
		]
		const probeProcess = Bun.spawn(["ffprobe", ...probeArguments, "-of", "json", audioPath], { stdout: "pipe" })
		const probeResult = await new Response(probeProcess.stdout).json()
		return { audioStream: probeResult.streams[0], durationSeconds: Number(probeResult.format.duration) }
	} finally {
		await rm(temporaryDirectory, { recursive: true, force: true })
	}
}

// one mp3 channel at the podcast's bitrate and sample rate
const PODCAST_AUDIO_STREAM = { codec_name: "mp3", channels: 1, bit_rate: "64000", sample_rate: "44100" }

// the join needs ffmpeg, which the runtime image has and a developer's machine may not
test.skipIf(!Bun.which("ffmpeg"))("joinChapterFiles writes one 64 kbps mono MP3 from two chapter files", async () => {
	const { audioStream, durationSeconds } = await joinToneChapters(NO_THEME_CLIPS)
	expect(audioStream).toEqual(PODCAST_AUDIO_STREAM)
	expect(Math.round(durationSeconds)).toBe(2)
})

// a short talk under the committed clips ends at 42 seconds, and the outro plays from 22 seconds to 82
test.skipIf(!Bun.which("ffmpeg"))("joinChapterFiles mixes the theme clips into the one MP3", async () => {
	const { audioStream, durationSeconds } = await joinToneChapters(await loadThemeClips())
	expect(audioStream).toEqual(PODCAST_AUDIO_STREAM)
	expect(Math.round(durationSeconds)).toBe(82)
})
