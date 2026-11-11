// the film renderer's fixture render: a 13-second podcast episode with a 2-second intro, three 3-second chapters, and a
// 2-second sign-off of sine audio, rendered to three parts, joined, and rebuilt with a new image.
// it runs ffmpeg for real, so it skips if ffmpeg is missing
import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runFfmpeg } from "@carlnotes/models/ffmpeg"
import sharp from "sharp"
import { detectPauseSeconds, toVideoCaptionCues, toWebVtt } from "./videoCaptions"
import { loadPodcastCardStillPng, toVideoStillPng } from "./videoFrames"
import {
	renderVideoChaptersPart,
	renderVideoImageParts,
	rewriteVideoFilm,
	type VideoChapterFrame,
	writeVideoFilm,
} from "./videoParts"
import { toVideoTimeline } from "./videoTimeline"

// whether ffmpeg and ffprobe are on this machine
const isFfmpegMissing = !Bun.which("ffmpeg") || !Bun.which("ffprobe")

// the fixture podcast episode's chapters and length, and the lower thirds of its intro and sign-off
const CHAPTER_TIMES = [
	{ position: 0, startSeconds: 2, endSeconds: 5 },
	{ position: 1, startSeconds: 5, endSeconds: 8 },
	{ position: 2, startSeconds: 8, endSeconds: 11 },
]
const DURATION_SECONDS = 13
const INTRO_TEXT = { title: "Agents that review code", detail: "AI Agents · S2026 E14" }
const SIGN_OFF_TEXT = { title: "Coffee Break podcast with Carl and Vienna", detail: "Carl and Vienna are AI voices" }

// the folder the render works in, shared by the tests in order
let workDirectory = ""

// make the work folder, then the fixture audio: a tone for each span with a short pause between chapters
beforeAll(async () => {
	workDirectory = await mkdtemp(join(tmpdir(), "film-fixture-"))
	if (isFfmpegMissing) {
		return
	}
	await runFfmpeg({
		ffmpegArguments: [
			...["-y", "-f", "lavfi", "-i", `sine=f=440:d=${DURATION_SECONDS}`],
			...["-af", "volume=enable='between(mod(t,3),2.8,3)':volume=0", "-ac", "1", "-ar", "44100"],
			...["-c:a", "libmp3lame", "-b:a", "64k", join(workDirectory, "audio.mp3")],
		],
	})
})

// delete the work folder
afterAll(async () => {
	await rm(workDirectory, { recursive: true, force: true })
})

// the parts, the captions, and the film, rendered from the fixture
test.skipIf(isFfmpegMissing)(
	"the fixture renders three parts and joins them into a film with audio and captions",
	async () => {
		// two chapters with fixture link preview images, which slide in, and one without, which shows the podcast card
		const segments = toVideoTimeline({ chapterTimes: CHAPTER_TIMES, durationSeconds: DURATION_SECONDS })
		const chapterFrames: VideoChapterFrame[] = [
			{
				stillPng: await toFixtureStill(1920, 1080, "#2d6a8f"),
				isLinkPreviewImage: true,
				lowerThirdText: { title: "First", detail: "a.com" },
			},
			{
				stillPng: await toFixtureStill(600, 800, "#c2410c"),
				isLinkPreviewImage: true,
				lowerThirdText: { title: "Second", detail: "b.com" },
			},
			{
				stillPng: await loadPodcastCardStillPng(),
				isLinkPreviewImage: false,
				lowerThirdText: { title: "Third", detail: "c.com" },
			},
		]
		const loadChapterFrame = async (position: number): Promise<VideoChapterFrame> => {
			const chapterFrame = chapterFrames[position]
			if (!chapterFrame) {
				throw new Error(`the fixture has no chapter ${position}`)
			}
			return chapterFrame
		}

		// render the parts, timing the render
		const renderStartMs = performance.now()
		const shownImageStillPng = await toFixtureStill(1500, 1500, "#6b4f3a")
		const imageParts = await renderVideoImageParts({
			workDirectory,
			segments,
			shownImageStillPng,
			introText: INTRO_TEXT,
			signOffText: SIGN_OFF_TEXT,
		})
		const chaptersPath = await renderVideoChaptersPart({
			podcastEpisodeId: "fixture-podcast-episode",
			workDirectory,
			segments,
			loadChapterFrame,
		})

		// every still and lower third is deleted once its segment is encoded, and every segment once the part is joined
		const workFileNames = await readdir(workDirectory)
		expect(workFileNames.filter((fileName) => fileName.endsWith(".png"))).toEqual([])
		expect(workFileNames.filter((fileName) => fileName.endsWith(".mp4")).toSorted()).toEqual([
			"chapters.mp4",
			"intro.mp4",
			"sign-off.mp4",
		])

		// the captions from a one-turn chapter each, timed with the pauses in the audio
		const audioPath = join(workDirectory, "audio.mp3")
		const pauseSeconds = await detectPauseSeconds(audioPath)
		const captionChapters = CHAPTER_TIMES.map((chapterTime) => ({
			...chapterTime,
			turns: [{ speakerName: "Carl", text: `Chapter ${chapterTime.position + 1} of the fixture.` }],
		}))
		const captionsPath = join(workDirectory, "captions.vtt")
		await Bun.write(captionsPath, toWebVtt(toVideoCaptionCues({ chapters: captionChapters, pauseSeconds })))

		// join the film, and report how long the render took per second of film
		const filmPath = join(workDirectory, "film.mp4")
		await writeVideoFilm({ workDirectory, ...imageParts, chaptersPath, audioPath, captionsPath, filmPath })
		const renderSeconds = (performance.now() - renderStartMs) / 1000
		console.log(
			`fixture film: ${renderSeconds.toFixed(1)}s to render ${DURATION_SECONDS}s, ${Bun.file(filmPath).size} bytes`,
		)

		// the film has the audio's length, the three streams at their sizes, and a keyframe at every part boundary
		const filmProbe = await probeFilm(filmPath)
		expect(filmProbe.durationSeconds).toBeCloseTo(DURATION_SECONDS, 1)
		expect(filmProbe.streams).toEqual([
			{ codecName: "h264", width: 1280, height: 720 },
			{ codecName: "aac" },
			{ codecName: "mov_text" },
		])
		for (const partStartSeconds of [0, 2, 11]) {
			expect(filmProbe.keyframeSeconds).toContain(partStartSeconds)
		}

		// the chapters part's frames match the timeline exactly
		const chaptersFrameCount = await countFrames(chaptersPath ?? "")
		expect(chaptersFrameCount).toBe(3 * 3 * 24)
	},
	60_000,
)

// a new podcast episode image renders only the intro and the sign-off, and the chapters part is left as it was
test.skipIf(isFfmpegMissing)(
	"a rebuild with a new image keeps the chapters part's bytes",
	async () => {
		// the chapters part and the film from the render before
		const chaptersPath = join(workDirectory, "chapters.mp4")
		const currentFilmPath = join(workDirectory, "film.mp4")
		const chaptersHashBefore = Bun.hash(await Bun.file(chaptersPath).bytes())

		// render the image parts again with a new image, and join them with the kept chapters
		const segments = toVideoTimeline({ chapterTimes: CHAPTER_TIMES, durationSeconds: DURATION_SECONDS })
		const rebuildDirectory = await mkdtemp(join(workDirectory, "rebuild-"))
		const imageParts = await renderVideoImageParts({
			workDirectory: rebuildDirectory,
			segments,
			shownImageStillPng: await toFixtureStill(1500, 1500, "#1f6f4a"),
			introText: INTRO_TEXT,
			signOffText: SIGN_OFF_TEXT,
		})
		const filmPath = join(rebuildDirectory, "film.mp4")
		await rewriteVideoFilm({ workDirectory: rebuildDirectory, ...imageParts, chaptersPath, currentFilmPath, filmPath })

		// the chapters are untouched, and the rebuilt film keeps its length and all three streams
		expect(Bun.hash(await Bun.file(chaptersPath).bytes())).toBe(chaptersHashBefore)
		const filmProbe = await probeFilm(filmPath)
		expect(filmProbe.durationSeconds).toBeCloseTo(DURATION_SECONDS, 1)
		expect(filmProbe.streams.map((stream) => stream.codecName)).toEqual(["h264", "aac", "mov_text"])
	},
	60_000,
)

// a flat fixture image of a size and color, as a still
async function toFixtureStill(width: number, height: number, background: string): Promise<Uint8Array> {
	const imageBytes = await sharp({ create: { width, height, channels: 3, background } })
		.png()
		.toBuffer()
	return toVideoStillPng(imageBytes)
}

// what ffprobe reads from a film: its length, its streams, and the times of its video keyframes
type FilmProbe = {
	durationSeconds: number
	streams: { codecName: string; width?: number; height?: number }[]
	keyframeSeconds: number[]
}

// read a film's length and streams, then its keyframe times
async function probeFilm(filmPath: string): Promise<FilmProbe> {
	// the container's length and each stream's codec and size
	const streamsJson = await runFfprobe([
		"-show_entries",
		"format=duration:stream=codec_name,width,height",
		"-of",
		"json",
		filmPath,
	])
	const { format, streams } = JSON.parse(streamsJson) as {
		format: { duration: string }
		streams: { codec_name: string; width?: number; height?: number }[]
	}

	// the keyframes' times, read from the video stream's keyframes only
	const keyframesText = await runFfprobe([
		...["-select_streams", "v", "-skip_frame", "nokey", "-show_entries", "frame=pts_time", "-of", "csv=p=0", filmPath],
	])
	const keyframeSeconds = keyframesText
		.split("\n")
		.filter(Boolean)
		.map((line) => Math.round(Number(line.replace(",", "")) * 1000) / 1000)
	return {
		durationSeconds: Number(format.duration),
		streams: streams.map(({ codec_name, width, height }) => ({ codecName: codec_name, width, height })),
		keyframeSeconds,
	}
}

// count a video file's frames by decoding it
async function countFrames(videoPath: string): Promise<number> {
	const countText = await runFfprobe([
		...["-count_frames", "-select_streams", "v", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", videoPath],
	])
	return Number(countText.trim())
}

// run ffprobe quietly and return what it printed
async function runFfprobe(ffprobeArguments: string[]): Promise<string> {
	const ffprobeProcess = Bun.spawn(["ffprobe", "-v", "error", ...ffprobeArguments], { stdout: "pipe" })
	const [outputText] = await Promise.all([new Response(ffprobeProcess.stdout).text(), ffprobeProcess.exited])
	return outputText
}
