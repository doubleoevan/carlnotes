// Replay a frozen private QA fixture offline through both production encoders.
import { mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises"
import { join, resolve } from "node:path"
import { runFfmpeg } from "@carlnotes/models/ffmpeg"
import sharp from "sharp"
import { z } from "zod"
import { renderVideoScene } from "./renderVideoScene"
import type { VideoCaptionCue } from "./videoCaptions"
import { loadPodcastCardStillPng, PODCAST_CARD_ZOOM_LIMIT, toVideoStillPng } from "./videoFrames"
import { renderVideoChaptersPart, type VideoSegmentImage } from "./videoParts"
import { checkVideoSceneOutput } from "./videoSceneOutput"
import { sha256Hash } from "./videoScenePlan"
import { toShotZoomLimit } from "./videoShots"
import { VIDEO_FRAMES_PER_SECOND as FPS } from "./videoTimeline"

const fixtureSchema = z.object({
	episode: z.uuid(),
	position: z.int().nonnegative(),
	title: z.string(),
	domain: z.string(),
	start: z.number().nonnegative(),
	end: z.number().positive(),
	resourceImageCount: z.int().nonnegative(),
	files: z
		.array(
			z.object({
				name: z.string().regex(/^(?:film\.mp4|audio\.mp3|captions\.vtt|image-\d+\.jpg)$/u),
				sha256: z.string().regex(/^[a-f0-9]{64}$/u),
			}),
		)
		.max(67),
})
const [source, target] = process.argv.slice(2)
if (!source || !target) {
	throw Error("Expected a private fixture directory and a new output directory")
}
const fixture = fixtureSchema.parse(await Bun.file(join(source, "fixture.json")).json())
const frameCount = Math.round(fixture.end * FPS) - Math.round(fixture.start * FPS)
if (frameCount < 1 || frameCount > 3600 * FPS) {
	throw Error("Invalid chapter interval")
}

// Verify the signed-off fixture before a potentially expensive render. Keys in the manifest are never fetched.
const verifiedNames = new Set(fixture.files.map((file) => file.name))
if (
	verifiedNames.size !== fixture.files.length ||
	!verifiedNames.has("audio.mp3") ||
	!verifiedNames.has("captions.vtt")
) {
	throw Error("The fixture must list each file once and include its narration and captions")
}
await mkdir(target, { mode: 0o700 })
for (const file of fixture.files) {
	if (sha256Hash(await Bun.file(join(source, file.name)).bytes()) !== file.sha256) {
		throw Error("Frozen input changed: " + file.name)
	}
}
const images: VideoSegmentImage[] = []
for (const file of fixture.files.filter((file) => file.name.startsWith("image-"))) {
	const bytes = await Bun.file(join(source, file.name)).bytes()
	const metadata = await sharp(bytes).metadata()
	images.push({
		origin: images.length < fixture.resourceImageCount ? "resource" : "generated",
		loadSceneImage: async () => bytes,
		loadStillPng: () => toVideoStillPng(bytes),
		zoomLimit: toShotZoomLimit(metadata),
	})
}
images.push({ origin: "house", loadStillPng: loadPodcastCardStillPng, zoomLimit: PODCAST_CARD_ZOOM_LIMIT })

// These are the cues the existing film actually shipped, including their absolute narration times.
const toSeconds = (time: string): number => time.split(":").reduce((sum, part) => sum * 60 + Number(part), 0)
const captions: VideoCaptionCue[] = []
for (const block of (await readFile(join(source, "captions.vtt"), "utf8")).replaceAll("\r", "").split("\n\n")) {
	const [header, ...lines] = block.trim().split("\n")
	const interval = /^(\d+:\d+:\d+\.\d+) --> (\d+:\d+:\d+\.\d+)/u.exec(header ?? "")
	if (!interval?.[1] || !interval[2]) {
		continue
	}
	const startSeconds = toSeconds(interval[1]),
		endSeconds = toSeconds(interval[2])
	if (startSeconds >= fixture.start && startSeconds < fixture.end) {
		captions.push({ startSeconds, endSeconds, lines, isAboveLowerThird: false })
	}
}
const chapter = {
	images,
	lowerThirdText: { title: fixture.title, detail: fixture.domain },
	hasPublicSceneSource: true,
}
const segment = { kind: "chapter" as const, position: fixture.position, startSeconds: fixture.start, frameCount }
for (const version of [3, 4]) {
	const directory = await mkdtemp(join(resolve(target), "render-"))
	try {
		// Both paths use identical approved image bytes, captions, source plate and frame endpoints.
		const start = performance.now()
		const part = await renderVideoChaptersPart({
			podcastEpisodeId: fixture.episode,
			workDirectory: directory,
			segments: [segment],
			chapterImages: new Map([[fixture.position, chapter]]),
			podcastCardImages: images.slice(-1),
			captionStartSeconds: captions.map((cue) => cue.startSeconds),
			renderChapter:
				version === 4
					? (segment, chapter) =>
							renderVideoScene({
								podcastEpisodeId: fixture.episode,
								workDirectory: directory,
								segment,
								chapter,
								captions,
								isRetry: false,
								resolvePlan: async (plan) => {
									await Bun.write(join(target, "plan.json"), JSON.stringify(plan))
									return plan
								},
							})
					: undefined,
		})
		if (!part) {
			throw Error("Chapter produced no frames")
		}
		await checkVideoSceneOutput(part, frameCount)
		const seconds = (performance.now() - start) / 1000
		const silent = join(target, `v${version}-silent.mp4`)
		await rename(part, silent)
		await runFfmpeg({
			ffmpegArguments: [
				"-i",
				silent,
				"-ss",
				String(fixture.start),
				"-t",
				String(fixture.end - fixture.start),
				"-i",
				join(source, "audio.mp3"),
				"-map",
				"0:v",
				"-map",
				"1:a",
				"-c:v",
				"copy",
				"-c:a",
				"aac",
				"-b:a",
				"96k",
				"-movflags",
				"+faststart",
				join(target, `v${version}.mp4`),
			],
		})
		console.log(
			JSON.stringify({
				version,
				frameCount,
				seconds,
				bytes: Bun.file(silent).size,
				plannerTokens: 0,
				providerCalls: 0,
			}),
		)
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
}
