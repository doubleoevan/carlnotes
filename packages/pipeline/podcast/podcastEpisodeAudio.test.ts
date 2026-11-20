// podcast episode audio tests: the chapter times, the theme's times and arguments, the ffmpeg join over two short
// chapter files, without and with the theme clips, and a chapter's recording, which makes no speech call for a row that
// is no longer recording or for audio that an earlier attempt stored
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as store from "@carlnotes/db/store"
import * as litellm from "@carlnotes/models/litellm"
import * as speech from "@carlnotes/models/speech"
import { SPEECH_BYTES_PER_SECOND, toWavBytes, WAV_HEADER_BYTES } from "@carlnotes/models/speech"
import {
	joinChapterFiles,
	recordPodcastEpisodeChapter,
	SpeechFailedError,
	toChapterTimes,
	toJoinArguments,
} from "./podcastEpisodeAudio"
import { loadThemeClips, type ThemeClips, toThemedEpisodeTimes } from "./podcastEpisodeTheme"
import * as podcastPersonalSourcesMigration from "./podcastPersonalSourcesMigration"

// put back the connection pool and the module mocks after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

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
	const chapterArguments = ["-y", "-f", "concat", "-safe", "0", "-i", "chapters.txt"]
	const loudnessArguments = ["-af", "loudnorm=I=-16:TP=-1.5:LRA=11:dual_mono=true"]
	const encodeArguments = ["-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "64k", "audio.mp3"]
	expect(joinArguments).toEqual([...chapterArguments, ...loudnessArguments, ...encodeArguments])
})

// with the theme mix off, the clips on disk are no inputs, as a Topic Post Discussion is joined
test("toJoinArguments with the theme mix off reads no theme clip, whatever clips exist", () => {
	const joinOptions = { chapterListPath: "chapters.txt", audioPath: "audio.mp3", speechSeconds: 180 }
	const joinArguments = toJoinArguments({ ...joinOptions, themeClips: BOTH_THEME_CLIPS, hasThemeMix: false })

	// the talk alone, exactly as a join with no clip
	expect(joinArguments).toEqual(toJoinArguments({ ...joinOptions, themeClips: NO_THEME_CLIPS }))
	expect(joinArguments).not.toContain("-filter_complex")
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
// allow the real ffmpeg encode to finish on a busy development machine
test.skipIf(!Bun.which("ffmpeg"))(
	"joinChapterFiles mixes the theme clips into the one MP3",
	async () => {
		const { audioStream, durationSeconds } = await joinToneChapters(await loadThemeClips())
		expect(audioStream).toEqual(PODCAST_AUDIO_STREAM)
		expect(Math.round(durationSeconds)).toBe(82)
	},
	30_000,
)

// a script of one chapter with one turn, and that chapter's recording
const CHAPTER_SCRIPT = {
	coldOpen: [],
	segments: [
		{
			transition: [],
			chapters: [{ findingId: "finding-1", title: "A quieter grinder", turns: [{ speaker: "host", text: "Hello." }] }],
		},
	],
	signOff: [],
}
const CHAPTER_OPTIONS = {
	podcastEpisodeId: "episode-1",
	billedUserId: "owner-1",
	position: 0,
	speechTier: "standard" as const,
}

// stub the pool so the chapter reads its row at a status with the script, and the store so its audio is stored at a
// byte size or not at all. the speech call records two seconds of audio
function stubChapterRecording(
	status: string,
	storedByteSize: number | null,
): { sentQueries: SentQuery[]; recordSpeechSpy: ReturnType<typeof spyOn>; uploadSpy: ReturnType<typeof spyOn> } {
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('select "status", "script" from "episodes"') ? [[status, CHAPTER_SCRIPT]] : [],
	)
	spyOn(store, "loadStoredObjectByteSize").mockResolvedValue(storedByteSize)
	spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockResolvedValue("owner-1-key")
	spyOn(podcastPersonalSourcesMigration, "assertPodcastPersonalSourcesConverted").mockResolvedValue(undefined)

	// a speech call that records, and an upload that stores nothing
	const recordSpeechSpy = spyOn(speech, "recordSpeech").mockResolvedValue({
		outcome: "recorded",
		audioBytes: toWavBytes(new Uint8Array(2 * SPEECH_BYTES_PER_SECOND)),
		inputTokens: 10,
		audioTokens: 50,
	} as never)
	const uploadSpy = spyOn(store, "uploadAttachment").mockResolvedValue(undefined)
	return { sentQueries, recordSpeechSpy, uploadSpy }
}

test("a chapter of a row that is no longer recording makes no speech call and adds no cost", async () => {
	const { sentQueries, recordSpeechSpy } = stubChapterRecording("failed", null)

	// the chapter fails for good, so the workflow leaves it out
	const chapterRecording = recordPodcastEpisodeChapter(CHAPTER_OPTIONS)
	await expect(chapterRecording).rejects.toThrow(SpeechFailedError)
	await expect(chapterRecording).rejects.toMatchObject({ isRetryable: false })
	expect(recordSpeechSpy).not.toHaveBeenCalled()
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith("update"))).toBe(false)
})

test("a chapter whose audio an earlier attempt stored is returned with no speech call and no cost", async () => {
	const { sentQueries, recordSpeechSpy, uploadSpy } = stubChapterRecording("recording", 96_044)

	// the stored audio is the chapter, at its stored size
	expect(await recordPodcastEpisodeChapter(CHAPTER_OPTIONS)).toEqual({
		position: 0,
		chapterKey: store.toPodcastEpisodeChapterKey("episode-1", 0),
		byteSize: 96_044,
	})
	expect(recordSpeechSpy).not.toHaveBeenCalled()
	expect(uploadSpy).not.toHaveBeenCalled()
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith("update"))).toBe(false)
})

test("a chapter with no stored audio records its speech, adds its cost, and stores its audio", async () => {
	const { sentQueries, recordSpeechSpy, uploadSpy } = stubChapterRecording("recording", null)
	const recordedChapter = await recordPodcastEpisodeChapter(CHAPTER_OPTIONS)

	// one speech call on the billed user's key, its cost on the row, and its audio under the chapter's key
	expect(recordSpeechSpy).toHaveBeenCalledTimes(1)
	expect(recordSpeechSpy.mock.calls[0]?.[0]).toMatchObject({ speechTier: "standard", litellmApiKey: "owner-1-key" })
	expect(sentQueries.filter((sentQuery) => sentQuery.text.startsWith('update "episodes" set "cost"'))).toHaveLength(1)
	expect(uploadSpy.mock.calls[0]?.[0]).toBe(recordedChapter.chapterKey)
	expect(recordedChapter.byteSize).toBe(WAV_HEADER_BYTES + 2 * SPEECH_BYTES_PER_SECOND)
})
