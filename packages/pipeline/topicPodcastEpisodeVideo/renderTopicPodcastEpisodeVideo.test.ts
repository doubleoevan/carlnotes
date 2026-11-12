// the film render's skips and its render version, with the connection pool stubbed: a spent owner gets a failed row, a
// platform-billed render skips the spend check, a podcast episode missing its inputs gets a failed row once, a film at
// the current render version is skipped, and a ready film below it is rendered again and swapped while it stays ready
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as monthlyBudgetCutoffs from "@carlnotes/db/monthlyBudgetCutoffs"
import * as podcastFeedCache from "@carlnotes/db/podcastFeedCache"
import * as storage from "@carlnotes/db/store"
import * as ffmpeg from "@carlnotes/models/ffmpeg"
import { renderTopicPodcastEpisodeVideo } from "./renderTopicPodcastEpisodeVideo"
import * as topicPodcastEpisodeVideoImage from "./topicPodcastEpisodeVideoImage"
import * as topicPodcastEpisodeVideoInputs from "./topicPodcastEpisodeVideoInputs"
import * as topicPodcastEpisodeVideoRows from "./topicPodcastEpisodeVideoRows"
import * as videoCaptions from "./videoCaptions"
import * as videoChapterImages from "./videoChapterImages"
import * as videoHotTakes from "./videoHotTakes"
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
	return sentQueries.find((sentQuery) => sentQuery.text.startsWith('insert into "topic_podcast_episode_videos"'))
}

// an owner past the podcast episode spend cutoff gets no render, and a failed row that the backfill's listing leaves out
test("an owner past the spend cutoff gets a failed film row", async () => {
	// the owner is past the cutoff
	const sentQueries = stubPodcastEpisodeReads()
	const cutoffSpy = spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(true)
	try {
		const renderResult = await renderTopicPodcastEpisodeVideo({ podcastEpisodeId: "episode-1" })
		expect(renderResult).toEqual({ outcome: "skipped", reason: "spend-cutoff" })
	} finally {
		cutoffSpy.mockRestore()
	}

	// the film row is written failed, with the reason, and never as rendering
	const filmRowWrite = toFilmRowWrite(sentQueries)
	expect(filmRowWrite?.text).toContain('on conflict ("episode_id") do update')
	expect(filmRowWrite?.values).toContain("failed")
	expect(filmRowWrite?.values).toContain("spend-cutoff")
	expect(filmRowWrite?.values).not.toContain("rendering")
})

// the backfill's platform-billed render never asks about the owner's spend, and a podcast episode with no audio or
// chapters gets a failed row that no listing finds again
test("a platform-billed render skips the spend check, and missing inputs write a failed row", async () => {
	// render on the platform's bill a podcast episode with no audio, transcript, or chapters
	const sentQueries = stubPodcastEpisodeReads()
	const cutoffSpy = spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(true)
	const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

	// the render skips the spend check and warns once
	try {
		const renderResult = await renderTopicPodcastEpisodeVideo({ podcastEpisodeId: "episode-1", isPlatformBilled: true })
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
	const renderResult = await renderTopicPodcastEpisodeVideo({ podcastEpisodeId: "episode-1" })
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
// and the row a film's update returns
function stubRenderReads(filmStateRow: unknown[] | null): SentQuery[] {
	return stubConnectionPool(({ text }) => {
		if (text.includes('from "episodes" inner join "topics"')) {
			return [RENDERABLE_PODCAST_EPISODE_ROW]
		}
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
		return text.startsWith('update "topic_podcast_episode_videos"') ? [["film-1"]] : []
	})
}

// stub every step that reads storage, runs ffmpeg, or draws, so a render writes its rows and nothing else. returns the
// upload's spy, which records each key, and the spy of the delete that a failure runs
function stubRenderSteps(): { upload: ReturnType<typeof spyOn>; deleteObjects: ReturnType<typeof spyOn> } {
	// the audio, the timeline's inputs, and the captions
	spyOn(storage, "downloadPodcastEpisodeFile").mockResolvedValue(undefined)
	spyOn(ffmpeg, "probeDurationSeconds").mockResolvedValue(60)
	spyOn(videoCaptions, "detectPauseSeconds").mockResolvedValue([])
	spyOn(videoHotTakes, "loadHotTakesStartSeconds").mockResolvedValue(new Map())
	spyOn(topicPodcastEpisodeVideoInputs, "toVideoCaptionChapters").mockReturnValue([])

	// the film's image, the parts, and the joined film
	spyOn(topicPodcastEpisodeVideoImage, "drawTopicPodcastEpisodeVideoImage").mockResolvedValue(null)
	spyOn(topicPodcastEpisodeVideoInputs, "loadShownImageStill").mockResolvedValue({
		stillPng: new Uint8Array([7]),
		zoomLimit: 2,
		isPodcastCard: false,
	})
	spyOn(videoParts, "renderVideoImageParts").mockResolvedValue({ introPath: "/work/intro.mp4", signOffPath: null })
	spyOn(videoChapterImages, "prepareChapterImages").mockResolvedValue({
		chapterImages: new Map(),
		podcastCardImages: [],
		drawnGeneratedChapterImageCount: 5,
	})
	spyOn(videoParts, "renderVideoChaptersPart").mockResolvedValue("/work/chapters.mp4")
	spyOn(videoParts, "writeVideoFilm").mockResolvedValue(undefined)

	// each upload records its key, and the feeds' cache is dropped
	const upload = spyOn(topicPodcastEpisodeVideoRows, "uploadTopicPodcastEpisodeVideoFile").mockImplementation(
		async ({ filePath, key, uploadedKeys }) => {
			if (!filePath) {
				return null
			}
			uploadedKeys.push(key)
			return key
		},
	)
	spyOn(podcastFeedCache, "deletePodcastFeedCache").mockResolvedValue(undefined)
	const deleteObjects = spyOn(storage, "deleteStoredObjects").mockResolvedValue(undefined)
	return { upload, deleteObjects }
}

// the film row's updates a render sent
function toFilmRowUpdates(sentQueries: SentQuery[]): SentQuery[] {
	return sentQueries.filter((sentQuery) => sentQuery.text.startsWith('update "topic_podcast_episode_videos"'))
}

test("a ready film at the current render version is skipped", async () => {
	const sentQueries = stubRenderReads(toFilmStateRow("ready", 2))
	const { upload } = stubRenderSteps()
	const renderResult = await renderTopicPodcastEpisodeVideo({ podcastEpisodeId: "episode-1", isPlatformBilled: true })
	expect(renderResult).toEqual({ outcome: "skipped", reason: "ready" })

	// nothing is uploaded or written
	expect(upload).not.toHaveBeenCalled()
	expect(toFilmRowWrite(sentQueries)).toBeUndefined()
	expect(toFilmRowUpdates(sentQueries)).toEqual([])
})

// a first render shows its row rendering, then stores its film at the current render version under versioned keys
test("a new film is stored at the current render version", async () => {
	const sentQueries = stubRenderReads(null)
	stubRenderSteps()
	const renderResult = await renderTopicPodcastEpisodeVideo({ podcastEpisodeId: "episode-1" })
	expect(renderResult).toMatchObject({ outcome: "rendered", generatedChapterImageCount: 5 })

	// the row is written rendering first, then ready at version 2 with its keys
	expect(toFilmRowWrite(sentQueries)?.values).toContain("rendering")
	const [readyUpdate] = toFilmRowUpdates(sentQueries)
	expect(readyUpdate?.text).toContain('"render_version" = $')
	expect(readyUpdate?.values).toContain("ready")
	expect(readyUpdate?.values).toContain(2)
	expect(readyUpdate?.values).toContain("episodes/episode-1/video/chapters-v2.mp4")
	expect(readyUpdate?.values).toContain("episodes/episode-1/video/film-image-1-v2.mp4")
})

// a ready film below the current version is rendered again while its row stays ready, then its files are swapped
test("a ready film below the current render version is rendered again and swapped", async () => {
	const sentQueries = stubRenderReads(toFilmStateRow("ready", 1))
	const { deleteObjects } = stubRenderSteps()
	const drawOwnImage = spyOn(topicPodcastEpisodeVideoImage, "drawTopicPodcastEpisodeVideoImage")
	const renderResult = await renderTopicPodcastEpisodeVideo({ podcastEpisodeId: "episode-1", isPlatformBilled: true })
	expect(renderResult).toMatchObject({ outcome: "rendered" })

	// the film keeps the image it shows, and the swapped film's files are never deleted
	expect(drawOwnImage).not.toHaveBeenCalled()
	expect(deleteObjects).not.toHaveBeenCalled()

	// the row is never written rendering, and one update swaps the keys only while the row is ready below version 2
	expect(toFilmRowWrite(sentQueries)).toBeUndefined()
	const [swapUpdate, ...otherUpdates] = toFilmRowUpdates(sentQueries)
	expect(otherUpdates).toEqual([])
	expect(swapUpdate?.text).toContain('"render_version" < $')
	expect(swapUpdate?.text).toContain('"status" = $')
	expect(swapUpdate?.values).not.toContain("rendering")
	expect(swapUpdate?.values).toContain("episodes/episode-1/video/intro-image-1-v2.mp4")
	expect(swapUpdate?.values).toContain("episodes/episode-1/video/captions-v2.vtt")

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
	const render = renderTopicPodcastEpisodeVideo({ podcastEpisodeId: "episode-1", isPlatformBilled: true })
	await expect(render).rejects.toThrow("the bucket is down")
	expect(deleteObjects).toHaveBeenCalledWith(["episodes/episode-1/video/intro-image-1-v2.mp4"])
	expect(toFilmRowWrite(sentQueries)).toBeUndefined()
	expect(toFilmRowUpdates(sentQueries)).toEqual([])
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
	const renderResult = await renderTopicPodcastEpisodeVideo({ podcastEpisodeId: "episode-1", isPlatformBilled: true })
	expect(renderResult).toEqual({ outcome: "skipped", reason: "missing-inputs" })
	expect(warnSpy).toHaveBeenCalledTimes(1)

	// no failed row is written, and the one update sets the failed render version on the ready row
	expect(toFilmRowWrite(sentQueries)).toBeUndefined()
	const [failedVersionUpdate] = toFilmRowUpdates(sentQueries)
	expect(failedVersionUpdate?.text).toContain('set "failed_render_version" = $')
	expect(failedVersionUpdate?.values).toContain(2)
	expect(failedVersionUpdate?.values).not.toContain("failed")
})
