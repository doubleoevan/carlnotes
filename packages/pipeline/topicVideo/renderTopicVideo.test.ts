// the film render's skips and its render version, with the connection pool stubbed: a render never asks about the
// owner's spend, a podcast episode missing its inputs gets a failed row once, a film at the current render version is
// skipped, and a ready film below it is rendered again and swapped while it stays ready. a save and a swap each clear
// the topic's visitor pages

import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { existsSync } from "node:fs"
import { dirname } from "node:path"
import {
	restoreConnectionPool,
	type SentQuery,
	stubConnectionPool,
	toTableUpdates,
} from "@carlnotes/db/connectionPoolStub"
import * as monthlyBudgetCutoffs from "@carlnotes/db/monthlyBudgetCutoffs"
import * as podcastFeedCache from "@carlnotes/db/podcastFeedCache"
import * as storage from "@carlnotes/db/store"
import * as visitorPageCaches from "@carlnotes/db/visitorPageCaches"
import * as ffmpeg from "@carlnotes/models/ffmpeg"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { renderTopicVideo } from "./renderTopicVideo"
import * as topicVideoImage from "./topicVideoImage"
import * as topicVideoInputs from "./topicVideoInputs"
import * as topicVideoRows from "./topicVideoRows"
import { TOPIC_VIDEO_RENDER_VERSION } from "./topicVideoRows"
import * as videoCaptions from "./videoCaptions"
import * as videoChapterImages from "./videoChapterImages"
import * as videoFilm from "./videoFilm"
import * as videoHotTakes from "./videoHotTakes"
import * as videoImageParts from "./videoImageParts"
import * as videoParts from "./videoParts"

// a published podcast episode's row, in the column order the film's read selects: topic, owner, status, title,
// season, number, audio key, script, its image hash, its topic's name, and its topic's image hash
const PUBLISHED_PODCAST_EPISODE_ROW = [
	"topic-1",
	"owner-1",
	"published",
	"Agents that review code",
	2026,
	14,
	null,
	null,
	null,
	"AI Agents",
	null,
]

// put the connection pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// answer the podcast episode read with the published row, and every other read with no rows
function stubPodcastEpisodeReads(): SentQuery[] {
	return stubConnectionPool(({ text }) =>
		text.includes('from "episodes" inner join "topics"') ? [PUBLISHED_PODCAST_EPISODE_ROW] : [],
	)
}

// the film row's write, if the render wrote one
function toFilmRowWrite(sentQueries: SentQuery[]): SentQuery | undefined {
	return sentQueries.find((sentQuery) => sentQuery.text.startsWith('insert into "topic_videos"'))
}

// a render never asks about the owner's spend, and a podcast episode with no audio or chapters gets a failed row that
// no listing finds again
test("a render never asks about the owner's spend, and missing inputs write a failed row", async () => {
	// an owner past the cutoff, and a podcast episode with no audio, transcript, or chapters
	const sentQueries = stubPodcastEpisodeReads()
	const cutoffSpy = spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(true)
	const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

	// the render never asks about the owner's spend and warns once
	try {
		const renderResult = await renderTopicVideo({ podcastEpisodeId: "episode-1" })
		expect(renderResult).toEqual({ outcome: "skipped", reason: "missing-inputs" })
		expect(cutoffSpy).not.toHaveBeenCalled()
		expect(warnSpy).toHaveBeenCalledTimes(1)
	} finally {
		// put both spies back
		cutoffSpy.mockRestore()
		warnSpy.mockRestore()
	}

	// the film row is written failed, with the reason
	const filmRowWrite = toFilmRowWrite(sentQueries)
	expect(filmRowWrite?.values).toContain("failed")
	expect(filmRowWrite?.values).toContain("missing-inputs")
})

// a podcast episode that is not published renders nothing
test("an unpublished podcast episode is skipped", async () => {
	const sentQueries = stubConnectionPool(() => [])
	const renderResult = await renderTopicVideo({ podcastEpisodeId: "episode-1" })
	expect(renderResult).toEqual({ outcome: "skipped", reason: "unpublished" })
	expect(toFilmRowWrite(sentQueries)).toBeUndefined()
})

// a published podcast episode with its audio and a script, in the column order the film's read selects, with its
// film's own image last
const RENDERABLE_PODCAST_EPISODE_ROW = [
	"topic-1",
	"owner-1",
	"published",
	"Agents that review code",
	2026,
	14,
	"episodes/episode-1/audio.mp3",
	{ coldOpen: [], segments: [], signOff: [] },
	null,
	"AI Agents",
	null,
	"image-1",
]

// one chapter's row, in the column order the chapters' read selects
const CHAPTER_ROW = [0, "Chapter 0", "https://example.com/0", 10, 50, "resource-0", false]

// a film row as the render reads it before it starts: its status and its render version
const toFilmStateRow = (status: string, renderVersion: number): unknown[] => [status, renderVersion]

// the five keys of the film that plays, as the swap reads them under the row's lock
const REPLACED_FILM_ROW = [
	"episodes/episode-1/video/intro-image-1.mp4",
	"episodes/episode-1/video/chapters.mp4",
	"episodes/episode-1/video/sign-off-image-1.mp4",
	"episodes/episode-1/video/film-image-1.mp4",
	"episodes/episode-1/video/captions.vtt",
]

// answer the render's reads: the podcast episode, its film row if it has one, the keys the swap reads, its chapters,
// the status that a failed render reads to learn whether its podcast episode was removed, and the row a film's update
// returns
function stubRenderReads(filmStateRow: unknown[] | null, podcastEpisodeStatus = "published"): SentQuery[] {
	return stubConnectionPool(({ text }) => {
		if (text.includes('from "episodes" inner join "topics"')) {
			return [RENDERABLE_PODCAST_EPISODE_ROW]
		}
		if (text.startsWith('select "status" from "episodes"')) {
			return [[podcastEpisodeStatus]]
		}

		// the film row as the render reads it before it starts
		if (text.startsWith('select "status", "render_version"')) {
			return filmStateRow ? [filmStateRow] : []
		}

		// the swap's read of the files the row plays
		if (text.includes("for no key update")) {
			return [REPLACED_FILM_ROW]
		}

		// the chapters, and the id a film row's update returns
		if (text.includes('from "episode_chapters"')) {
			return [CHAPTER_ROW]
		}
		return text.startsWith('update "topic_videos"') ? [["film-1"]] : []
	})
}

// stub every step that reads storage, runs ffmpeg, or generates an image, so a render writes its rows and nothing else.
// returns the upload's spy, which records each key, and the spy of the delete that a failure runs
function stubRenderSteps(): { upload: ReturnType<typeof spyOn>; deleteObjects: ReturnType<typeof spyOn> } {
	// the audio, the timeline's inputs, and the captions
	spyOn(storage, "downloadPodcastEpisodeFile").mockResolvedValue(undefined)
	spyOn(ffmpeg, "probeDurationSeconds").mockResolvedValue(60)
	spyOn(videoCaptions, "detectPauseSeconds").mockResolvedValue([])
	spyOn(videoHotTakes, "loadHotTakesStartSeconds").mockResolvedValue(new Map())
	spyOn(topicVideoInputs, "toVideoCaptionChapters").mockReturnValue([])

	// the film's image, the parts, and the joined film
	spyOn(topicVideoImage, "generateTopicVideoImage").mockResolvedValue(null)
	spyOn(topicVideoInputs, "loadShownImageStill").mockResolvedValue({
		stillPng: new Uint8Array([7]),
		zoomLimit: 2,
		isPodcastCard: false,
	})
	spyOn(videoImageParts, "renderVideoImageParts").mockResolvedValue({ introPath: "/work/intro.mp4", signOffPath: null })
	spyOn(videoChapterImages, "prepareChapterImages").mockResolvedValue({
		chapterImages: new Map(),
		podcastCardImages: [],
		firstChapterImages: [],
		newlyGeneratedChapterImageCount: 5,
	})
	spyOn(videoParts, "renderVideoChaptersPart").mockResolvedValue("/work/chapters.mp4")
	spyOn(videoFilm, "writeVideoFilm").mockResolvedValue(undefined)

	// each upload records its key, and the feeds' cache is dropped
	const upload = spyOn(topicVideoRows, "uploadTopicVideoFile").mockImplementation(
		async ({ filePath, key, uploadedKeys }) => {
			if (!filePath) {
				return null
			}
			uploadedKeys.push(key)
			return key
		},
	)
	spyOn(podcastFeedCache, "deletePodcastFeedCache").mockResolvedValue(undefined)
	spyOn(storage, "listStoredObjectKeys").mockResolvedValue([])
	const deleteObjects = spyOn(storage, "deleteStoredObjects").mockResolvedValue(undefined)
	return { upload, deleteObjects }
}

test("a ready film at the current render version is skipped", async () => {
	const sentQueries = stubRenderReads(toFilmStateRow("ready", TOPIC_VIDEO_RENDER_VERSION))
	const { upload } = stubRenderSteps()
	const renderResult = await renderTopicVideo({ podcastEpisodeId: "episode-1", isPlatformBilled: true })
	expect(renderResult).toEqual({ outcome: "skipped", reason: "ready" })

	// nothing is uploaded or written
	expect(upload).not.toHaveBeenCalled()
	expect(toFilmRowWrite(sentQueries)).toBeUndefined()
	expect(toTableUpdates(sentQueries, "topic_videos")).toEqual([])
})

// a first render shows its row rendering, then stores its film at the current render version under versioned keys
test("a new film is stored at the current render version", async () => {
	const sentQueries = stubRenderReads(null)
	stubRenderSteps()
	const clearVisitorPagesSpy = spyOn(visitorPageCaches, "clearVisitorPagesOfTopic").mockResolvedValue()
	const renderResult = await renderTopicVideo({ podcastEpisodeId: "episode-1" })
	expect(renderResult).toMatchObject({ outcome: "rendered", generatedChapterImageCount: 5 })

	// the ready film leaves its topic's visitor pages, which list it on their next read
	expect(clearVisitorPagesSpy.mock.calls).toEqual([["topic-1"]])

	// the row is written rendering first, then ready at the current render version with its keys
	expect(toFilmRowWrite(sentQueries)?.values).toContain("rendering")
	const [readyUpdate] = toTableUpdates(sentQueries, "topic_videos")
	expect(readyUpdate?.text).toContain('"render_version" = $')
	expect(readyUpdate?.values).toContain("ready")
	expect(readyUpdate?.values).toContain(TOPIC_VIDEO_RENDER_VERSION)
	expect(readyUpdate?.values).toContain(`episodes/episode-1/video/chapters-v${TOPIC_VIDEO_RENDER_VERSION}.mp4`)
	expect(readyUpdate?.values).toContain(`episodes/episode-1/video/film-image-1-v${TOPIC_VIDEO_RENDER_VERSION}.mp4`)
})

// the backfill's render must reach the day's total and never its owner's month
test("a platform-billed render records its minutes as the platform's spend, and adds no cost to the film", async () => {
	const sentQueries = stubRenderReads(null)
	stubRenderSteps()
	await renderTopicVideo({ podcastEpisodeId: "episode-1", isPlatformBilled: true })

	// the film's row is saved ready with no cost added, and the 60-second film's minute is a spends row with no user
	const [readyUpdate] = toTableUpdates(sentQueries, "topic_videos")
	expect(readyUpdate?.values).toContain("0.000000")
	const platformSpends = sentQueries.filter((sentQuery) => sentQuery.text.startsWith('insert into "spends"'))
	expect(platformSpends).toHaveLength(1)
	expect(platformSpends[0]?.values).toEqual(expect.arrayContaining(["topicVideoRender", 0.001, "episode-1"]))
	expect(platformSpends[0]?.values).not.toContain("owner-1")

	// an owner's render adds its minute to the film's row and records no spends row
	const ownerQueries = stubRenderReads(null)
	await renderTopicVideo({ podcastEpisodeId: "episode-1" })
	expect(toTableUpdates(ownerQueries, "topic_videos")[0]?.values).toContain("0.001000")
	expect(ownerQueries.some((sentQuery) => sentQuery.text.startsWith('insert into "spends"'))).toBe(false)
})

// a ready film below the current version is rendered again while its row stays ready, then its files are swapped
test("a ready film below the current render version is rendered again and swapped", async () => {
	const sentQueries = stubRenderReads(toFilmStateRow("ready", 1))
	const { deleteObjects } = stubRenderSteps()
	const drawOwnImage = spyOn(topicVideoImage, "generateTopicVideoImage")
	const clearVisitorPagesSpy = spyOn(visitorPageCaches, "clearVisitorPagesOfTopic").mockResolvedValue()
	const renderResult = await renderTopicVideo({ podcastEpisodeId: "episode-1", isPlatformBilled: true })
	expect(renderResult).toMatchObject({ outcome: "rendered" })
	expect(clearVisitorPagesSpy.mock.calls).toEqual([["topic-1"]])

	// the film keeps the image it shows, and of its stored files only the chapter images in the first style are deleted.
	// the second delete is of the shots the render kept, of which the bucket lists none
	expect(drawOwnImage).not.toHaveBeenCalled()
	expect(deleteObjects).toHaveBeenCalledTimes(2)
	expect(deleteObjects.mock.calls[1]?.[0]).toEqual([])
	const deletedKeys: string[] = deleteObjects.mock.calls[0]?.[0] ?? []
	expect(deletedKeys).toContain("episodes/episode-1/video/chapter-0-image.jpg")
	expect(deletedKeys.every((deletedKey) => /\/chapter-\d+-image(-\d+)?\.jpg$/.test(deletedKey))).toBe(true)

	// the row is never written rendering, and one update swaps the keys only while the row is ready below the current
	// render version
	expect(toFilmRowWrite(sentQueries)).toBeUndefined()
	const [swapUpdate, ...otherUpdates] = toTableUpdates(sentQueries, "topic_videos")
	expect(otherUpdates).toEqual([])
	expect(swapUpdate?.text).toContain('"render_version" < $')
	expect(swapUpdate?.text).toContain('"status" = $')
	expect(swapUpdate?.values).not.toContain("rendering")
	expect(swapUpdate?.values).toContain(`episodes/episode-1/video/intro-image-1-v${TOPIC_VIDEO_RENDER_VERSION}.mp4`)
	expect(swapUpdate?.values).toContain(`episodes/episode-1/video/captions-v${TOPIC_VIDEO_RENDER_VERSION}.vtt`)

	// the replaced files are scheduled for deletion, the old captions and the old film among them
	const replacedDeletion = sentQueries.find(
		(sentQuery) =>
			sentQuery.text.startsWith('insert into "pending_object_deletions"') &&
			sentQuery.values.includes("episodes/episode-1/video/film-image-1.mp4"),
	)
	expect(replacedDeletion?.values).toContain("episodes/episode-1/video/chapters.mp4")
	expect(replacedDeletion?.values).toContain("episodes/episode-1/video/captions.vtt")
})

// a re-render that fails after an upload deletes what it uploaded and never touches the row of the film that plays
test("a failed re-render leaves the film row unchanged and deletes its uploads", async () => {
	const sentQueries = stubRenderReads(toFilmStateRow("ready", 1))
	const { upload, deleteObjects } = stubRenderSteps()
	upload.mockImplementation(async ({ key, uploadedKeys }: { key: string; uploadedKeys: string[] }) => {
		// the intro uploads, and the next upload fails
		if (uploadedKeys.length > 0) {
			throw new Error("the bucket is down")
		}
		uploadedKeys.push(key)
		return key
	})

	// the render throws an error
	const render = renderTopicVideo({ podcastEpisodeId: "episode-1", isPlatformBilled: true })
	await expect(render).rejects.toThrow("the bucket is down")
	expect(deleteObjects).toHaveBeenCalledWith([
		`episodes/episode-1/video/intro-image-1-v${TOPIC_VIDEO_RENDER_VERSION}.mp4`,
	])
	expect(toFilmRowWrite(sentQueries)).toBeUndefined()
	expect(toTableUpdates(sentQueries, "topic_videos")).toEqual([])
})

// no attempt could finish a removed podcast episode's film, so the render ends as a skip instead of a failure
test("a render that stops after its podcast episode was removed is skipped, and uploads nothing", async () => {
	// the podcast episode is removed while the film's files render, and the removal stops the render
	const sentQueries = stubRenderReads(null, "removed")
	const { upload } = stubRenderSteps()
	const removal = new AbortController()
	spyOn(videoFilm, "writeVideoFilm").mockImplementation(async () => {
		removal.abort(new Error("the podcast episode was removed"))
	})

	// the render ends as skipped, with no upload and no ready row
	const renderResult = await renderTopicVideo({ podcastEpisodeId: "episode-1", signal: removal.signal })
	expect(renderResult).toEqual({ outcome: "skipped", reason: "removed" })
	expect(upload).not.toHaveBeenCalled()
	expect(toTableUpdates(sentQueries, "topic_videos")).toEqual([])
})

// a re-render whose podcast episode lost its chapters records the failed version, and the film that plays stays ready
test("a re-render with missing inputs records the failed render version and keeps the row ready", async () => {
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "episodes" inner join "topics"')) {
			return [RENDERABLE_PODCAST_EPISODE_ROW]
		}
		return text.startsWith('select "status", "render_version"') ? [toFilmStateRow("ready", 1)] : []
	})

	// the render warns once and skips
	const warnSpy = spyOn(console, "warn").mockImplementation(() => {})
	const renderResult = await renderTopicVideo({ podcastEpisodeId: "episode-1", isPlatformBilled: true })
	expect(renderResult).toEqual({ outcome: "skipped", reason: "missing-inputs" })
	expect(warnSpy).toHaveBeenCalledTimes(1)

	// no failed row is written, and the one update sets the failed render version on the ready row
	expect(toFilmRowWrite(sentQueries)).toBeUndefined()
	const [failedVersionUpdate] = toTableUpdates(sentQueries, "topic_videos")
	expect(failedVersionUpdate?.text).toContain('set "failed_render_version" = $')
	expect(failedVersionUpdate?.values).toContain(TOPIC_VIDEO_RENDER_VERSION)
	expect(failedVersionUpdate?.values).not.toContain("failed")
})

test.each(["upload", "publication"])(
	"an animated replacement keeps its ready predecessor after a failed %s",
	async (stage) => {
		const queries = stubRenderReads(toFilmStateRow("ready", 3))
		const { upload, deleteObjects } = stubRenderSteps()
		if (stage === "upload") {
			upload.mockRejectedValueOnce(Error("simulated failure"))
		} else {
			spyOn(topicVideoRows, "publishTopicVideoReplacement").mockRejectedValueOnce(Error("simulated failure"))
		}

		// the render fails, and the ready film's row and files stay as they were
		await expect(
			renderTopicVideo({ podcastEpisodeId: "episode-1", renderVersion: 4, isPlatformBilled: true }),
		).rejects.toThrow("simulated failure")
		expect(toTableUpdates(queries, "topic_videos")).toEqual([])
		expect(deleteObjects).not.toHaveBeenCalled()
	},
)

test.skipIf(!Bun.which("ffmpeg"))(
	"an oversized live encode stops and cleans up without replacing the ready film",
	async () => {
		// feed a real encoder through the audio preparation step and retain the existing ready row
		const restore = saveEnvSettings(["TOPIC_VIDEO_DISK_LIMIT_MIB"])
		const sent = stubRenderReads(toFilmStateRow("ready", 1))
		const { upload } = stubRenderSteps()
		let workDirectory = ""
		let stopped = false
		Bun.env.TOPIC_VIDEO_DISK_LIMIT_MIB = "1"

		// the audio download writes raw video into the render's folder until the limit stops it
		spyOn(storage, "downloadPodcastEpisodeFile").mockImplementation(async ({ filePath, signal }) => {
			workDirectory = dirname(filePath)
			try {
				await ffmpeg.runFfmpeg({
					ffmpegArguments: [
						"-y",
						"-re",
						"-f",
						"lavfi",
						"-i",
						"testsrc2=s=640x360:r=24",
						"-threads",
						"1",
						"-c:v",
						"rawvideo",
						"-t",
						"15",
						"-f",
						"rawvideo",
						filePath,
					],
					signal,
					timeoutMs: 20000,
				})
			} finally {
				stopped = signal?.aborted ?? false
			}
		})
		try {
			await expect(renderTopicVideo({ podcastEpisodeId: "episode-1", renderVersion: 4 })).rejects.toThrow(
				"1 MiB temporary disk limit",
			)
			expect(stopped).toBe(true)
			expect(existsSync(workDirectory)).toBe(false)
			expect(upload).not.toHaveBeenCalled()
			expect(toTableUpdates(sent, "topic_videos")).toEqual([])
		} finally {
			restore()
		}
	},
	30000,
)

test("a film stays ready when the worker already exceeds its memory allowance", async () => {
	// run the regular render entry point with a limit below the worker’s resident memory
	const restore = saveEnvSettings(["TOPIC_VIDEO_MEMORY_LIMIT_MIB"])
	const sent = stubRenderReads(toFilmStateRow("ready", 1))
	const { upload } = stubRenderSteps()
	try {
		Bun.env.TOPIC_VIDEO_MEMORY_LIMIT_MIB = "1"
		await expect(renderTopicVideo({ podcastEpisodeId: "episode-1", renderVersion: 4 })).rejects.toThrow(
			"1 MiB memory limit",
		)
		expect(upload).not.toHaveBeenCalled()
		expect(toTableUpdates(sent, "topic_videos")).toEqual([])
	} finally {
		restore()
	}
})

test("cancellation during upload leaves the previous film playable", async () => {
	const sent = stubRenderReads(toFilmStateRow("ready", 3))
	const controller = new AbortController()
	const { upload } = stubRenderSteps()
	upload.mockImplementationOnce(async () => {
		controller.abort(new Error("cancelled upload"))
		return "unpublished-intro"
	})

	// the render fails with the cancellation, and the ready film's row is not written
	await expect(
		renderTopicVideo({ podcastEpisodeId: "episode-1", renderVersion: 4, signal: controller.signal }),
	).rejects.toThrow("cancelled upload")
	expect(toTableUpdates(sent, "topic_videos")).toEqual([])
})
