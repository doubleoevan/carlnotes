// the film renderer's fixture render: an 80-second podcast episode with a 10-second intro, a 40-second chapter of
// three images, a 20-second chapter with no Resource image whose hosts answer a Comment for its last 8 seconds, and a
// 10-second sign-off of sine audio, rendered to three parts, joined, and rebuilt with a new image.
// it runs ffmpeg for real, so it skips if ffmpeg is missing. FILM_FIXTURE_OUTPUT names a file to keep the film at
import { afterAll, beforeAll, expect, test } from "bun:test"
import { copyFile, mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runFfmpeg } from "@carlnotes/models/ffmpeg"
import sharp from "sharp"
import { detectPauseSeconds, toVideoCaptionCues, toWebVtt } from "./videoCaptions"
import { loadPodcastCardStillPng, PODCAST_CARD_ZOOM_LIMIT, toVideoStillPng } from "./videoFrames"
import {
	renderVideoChaptersPart,
	renderVideoImageParts,
	rewriteVideoFilm,
	type VideoChapterImages,
	type VideoSegmentImage,
	writeVideoFilm,
} from "./videoParts"
import { toShotZoomLimit } from "./videoShots"
import { toVideoTimeline, VIDEO_FRAMES_PER_SECOND } from "./videoTimeline"

// whether ffmpeg and ffprobe are on this machine
const isFfmpegMissing = !Bun.which("ffmpeg") || !Bun.which("ffprobe")

// the fixture podcast episode's chapters, where the hosts turn to a Comment in the second one, its length, and the
// lower thirds of its intro and sign-off
const CHAPTER_TIMES = [
	{ position: 0, startSeconds: 10, endSeconds: 50 },
	{ position: 1, startSeconds: 50, endSeconds: 70 },
]
const HOT_TAKES_START_SECONDS = new Map([[1, 62]])
const DURATION_SECONDS = 80
const INTRO_TEXT = { title: "Agents that review code", detail: "AI Agents · S2026 E14" }
const SIGN_OFF_TEXT = { title: "Coffee Break podcast with Carl and Vienna", detail: "Carl and Vienna are AI voices" }

// what the hosts say in each chapter, by its position, in turns long enough for several captions
const CHAPTER_TURNS = [
	[
		"The first finding is a long one. It runs for forty seconds, so its montage cuts several times.",
		"Each cut lands where a caption starts. No image stays for more than eight seconds, and no move repeats.",
	],
	["The second chapter has no image of its own. It shows a generated image and the podcast card in turn."],
]

// the folder the render works in, shared by the tests in order
let workDirectory = ""

// make the work folder, then the fixture audio: a tone for each span with a short pause every three seconds
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
		// a long chapter with a large image, a portrait, and a small link preview image, and a chapter with a generated
		// image alone, each before the podcast card
		const segments = toVideoTimeline({
			chapterTimes: CHAPTER_TIMES,
			hotTakesStartSeconds: HOT_TAKES_START_SECONDS,
			durationSeconds: DURATION_SECONDS,
		})
		const podcastCardImage = { loadStillPng: loadPodcastCardStillPng, zoomLimit: PODCAST_CARD_ZOOM_LIMIT }
		const chapterImages = new Map<number, VideoChapterImages>([
			[
				0,
				{
					images: [
						toFixtureImage({ width: 2560, height: 1440, label: "A", color: "#2d6a8f" }),
						toFixtureImage({ width: 800, height: 1067, label: "B", color: "#c2410c" }),
						toFixtureImage({ width: 1200, height: 630, label: "C", color: "#4d7c0f" }),
						podcastCardImage,
					],
					lowerThirdText: { title: "A long chapter with three images", detail: "a.com" },
				},
			],
			[
				1,
				{
					images: [toFixtureImage({ width: 1280, height: 720, label: "I", color: "#6d28d9" }), podcastCardImage],
					lowerThirdText: { title: "A chapter with no image of its own", detail: "b.com" },
				},
			],
		])

		// the captions from each chapter's turns, timed with the pauses in the audio
		const audioPath = join(workDirectory, "audio.mp3")
		const pauseSeconds = await detectPauseSeconds(audioPath)
		const captionChapters = CHAPTER_TIMES.map((chapterTime) => ({
			...chapterTime,
			turns: (CHAPTER_TURNS[chapterTime.position] ?? []).map((text) => ({ speakerName: "Carl", text })),
		}))
		const captionCues = toVideoCaptionCues({ chapters: captionChapters, pauseSeconds })
		const captionsPath = join(workDirectory, "captions.vtt")
		await Bun.write(captionsPath, toWebVtt(captionCues))

		// render the parts, timing the render. the hosts' answer cuts between the podcast card and the film's image
		const renderStartMs = performance.now()
		const filmImage = toFixtureImage({ width: 2752, height: 1536, label: "F", color: "#6b4f3a" })
		const shownImageStillPng = await filmImage.loadStillPng()
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
			chapterImages,
			podcastCardImages: [podcastCardImage, filmImage],
			captionStartSeconds: captionCues.map((captionCue) => captionCue.startSeconds),
		})

		// every still and lower third is deleted once its segment is encoded, and every shot once the part is joined
		const workFileNames = await readdir(workDirectory)
		expect(workFileNames.filter((fileName) => fileName.endsWith(".png"))).toEqual([])
		expect(workFileNames.filter((fileName) => fileName.endsWith(".mp4")).toSorted()).toEqual([
			"chapters.mp4",
			"intro.mp4",
			"sign-off.mp4",
		])

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
		for (const partStartSeconds of [0, 10, 70]) {
			expect(filmProbe.keyframeSeconds).toContain(partStartSeconds)
		}

		// the chapters part's frames match the timeline exactly, and the film has a frame for every frame of its audio
		expect(await countFrames(chaptersPath ?? "")).toBe(60 * VIDEO_FRAMES_PER_SECOND)
		expect(await countFrames(filmPath)).toBe(DURATION_SECONDS * VIDEO_FRAMES_PER_SECOND)

		// keep the film to watch, if a file is named for it
		if (Bun.env.FILM_FIXTURE_OUTPUT) {
			await copyFile(filmPath, Bun.env.FILM_FIXTURE_OUTPUT)
		}
	},
	300_000,
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
		const newFilmImage = toFixtureImage({ width: 1500, height: 1500, label: "N", color: "#1f6f4a" })
		const imageParts = await renderVideoImageParts({
			workDirectory: rebuildDirectory,
			segments,
			shownImageStillPng: await newFilmImage.loadStillPng(),
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
	120_000,
)

// a fixture image's pixel size, the letter drawn on it, and its color
type FixtureImageOptions = { width: number; height: number; label: string; color: string }

// a fixture image as a segment's image: a colored field with a grid, two rings, and a letter, so its move shows, with
// the zoom its pixels hold
function toFixtureImage({ width, height, label, color }: FixtureImageOptions): VideoSegmentImage {
	// grid lines every tenth of the image, as one path
	const gridLines = Array.from({ length: 9 }, (_, i) => {
		const x = ((i + 1) * width) / 10
		const y = ((i + 1) * height) / 10
		return `M${x} 0V${height}M0 ${y}H${width}`
	}).join("")

	// the field, the grid, a ring around the middle, a dot in a corner, and the letter
	const drawing = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
		<rect width="${width}" height="${height}" fill="${color}"/>
		<path d="${gridLines}" stroke="#ffffff" stroke-opacity="0.35" stroke-width="${width / 400}"/>
		<circle cx="${width / 2}" cy="${height / 2}" r="${height / 3}" fill="none" stroke="#ffffff" stroke-width="${width / 150}"/>
		<circle cx="${width / 4}" cy="${height / 4}" r="${height / 10}" fill="#ffffff" fill-opacity="0.6"/>
		<text x="${width / 2}" y="${height * 0.62}" font-size="${height / 3}" font-family="sans-serif" fill="#ffffff"
			text-anchor="middle">${label}</text></svg>`

	// draw the image as a jpeg once the still is asked for, then compose the still
	const loadStillPng = async (): Promise<Uint8Array> =>
		toVideoStillPng(await sharp(Buffer.from(drawing)).jpeg({ quality: 90 }).toBuffer())
	return { loadStillPng, zoomLimit: toShotZoomLimit({ width, height }) }
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
