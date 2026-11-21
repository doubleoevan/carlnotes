// the film rebuild's skips and its swap, with the connection pool stubbed: a film rendered from the image it shows now,
// its own or else its podcast episode's, a film that plays while an upload that would be its image is unchecked, and
// an owner past the spend cutoff are left as they are, a film marked rendering is ready again or rebuilt whatever its
// owner spent, and a rebuild swaps only the film it read, while it still shows the image the rebuild drew from
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as monthlyBudgetCutoffs from "@carlnotes/db/monthlyBudgetCutoffs"
import * as podcastFeedCache from "@carlnotes/db/podcastFeedCache"
import * as statusReadCaches from "@carlnotes/db/statusReadCaches"
import * as storage from "@carlnotes/db/store"
import { toTopicVideoChaptersKey, toTopicVideoRenderAttemptUploadKey } from "@carlnotes/db/topicVideoKeys"
import * as visitorPageCaches from "@carlnotes/db/visitorPageCaches"
import * as analytics from "@carlnotes/server/analytics"
import { rebuildTopicVideo } from "./rebuildTopicVideo"
import * as filmFiles from "./renderFilmFiles"
import * as topicVideoInputs from "./topicVideoInputs"
import * as topicVideoRows from "./topicVideoRows"
import * as videoAudio from "./videoAudio"
import * as videoChapterImages from "./videoChapterImages"
import * as videoFilm from "./videoFilm"
import * as videoImageParts from "./videoImageParts"
import {
	planVideoScenes,
	sha256Hash,
	toRetainedPosterHash,
	toStoredVideoScenePlan,
	toVideoScenePlansHash,
} from "./videoScenePlan"
import type { VideoSegment } from "./videoTimeline"

// a published podcast episode with audio, a transcript, and its own image, in the column order the film's read selects
const PUBLISHED_PODCAST_EPISODE_ROW = [
	"topic-1",
	"owner-1",
	"published",
	"Agents that review code",
	2026,
	14,
	"episodes/episode-1/audio.mp3",
	{},
	"image-new",
	"AI Agents",
	null,
]

// a ready film rendered from an older image, in the column order the film's read selects
const READY_FILM_ROW = ["ready", "intro.mp4", "chapters.mp4", "sign-off.mp4", "film.mp4", "image-old", 1]

// put the connection pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// answer the podcast episode read and the film read, which was rendered from an image of the given hash. the film has
// its own image if a hash for one is given, and is ready unless another status is given
function stubRebuildReads(
	renderedImageHash: string,
	topicVideoImageHash: string | null = null,
	status = "ready",
): SentQuery[] {
	const readyFilmRow = [status, "intro.mp4", "chapters.mp4", "sign-off.mp4", "film.mp4", renderedImageHash, 1]
	return stubConnectionPool(({ text }) => {
		// the podcast episode read with its film's own image last, then the film read, and no rows for anything else
		if (text.includes('from "episodes" inner join "topics"')) {
			return [[...PUBLISHED_PODCAST_EPISODE_ROW, topicVideoImageHash]]
		}
		return text.startsWith('select "status"') ? [readyFilmRow] : []
	})
}

// whether the film row was updated
function isFilmRowUpdated(sentQueries: SentQuery[]): boolean {
	return sentQueries.some((sentQuery) => sentQuery.text.startsWith('update "topic_videos"'))
}

// a film already rendered from the image the podcast episode shows needs no rebuild
test("a film rendered from the current image is skipped", async () => {
	const sentQueries = stubRebuildReads("image-new")
	const rebuildResult = await rebuildTopicVideo("episode-1")
	expect(rebuildResult).toEqual({ outcome: "skipped", reason: "current" })
	expect(isFilmRowUpdated(sentQueries)).toBe(false)
})

// a film with its own image is current while it was rendered from that image, whatever its podcast episode shows now
test("a film rendered from its own image is skipped, though its podcast episode's image changed", async () => {
	const sentQueries = stubRebuildReads("film-image", "film-image")
	const rebuildResult = await rebuildTopicVideo("episode-1")
	expect(rebuildResult).toEqual({ outcome: "skipped", reason: "current" })
	expect(isFilmRowUpdated(sentQueries)).toBe(false)
})

// a film keeps the image it was rendered from while the upload that replaced that image is unchecked
test("a film that plays while its new image is an upload still unchecked is skipped", async () => {
	// the film's own image is an upload that has an unchecked image row
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "unchecked_images"')) {
			return [["topicPodcastEpisodeVideoImage", "film-upload"]]
		}

		// the podcast episode read with that upload as its film's own image, then the film read
		if (text.includes('from "episodes" inner join "topics"')) {
			return [[...PUBLISHED_PODCAST_EPISODE_ROW, "film-upload"]]
		}
		return text.startsWith('select "status"') ? [READY_FILM_ROW] : []
	})

	// the film that plays now stays, with nothing written
	const rebuildResult = await rebuildTopicVideo("episode-1")
	expect(rebuildResult).toEqual({ outcome: "skipped", reason: "unchecked" })
	expect(isFilmRowUpdated(sentQueries)).toBe(false)
})

// an owner past the podcast episode spend cutoff keeps the film that plays now
test("an owner past the spend cutoff keeps the stale film", async () => {
	// the film shows an old image, and the owner is past the cutoff
	const sentQueries = stubRebuildReads("image-old")
	const cutoffSpy = spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(true)
	try {
		const rebuildResult = await rebuildTopicVideo("episode-1")
		expect(rebuildResult).toEqual({ outcome: "skipped", reason: "spend-cutoff" })
	} finally {
		cutoffSpy.mockRestore()
	}

	// nothing was written
	expect(isFilmRowUpdated(sentQueries)).toBe(false)
})

// a film marked rendering because its image was unpublished shows that image again once the image passes its check
test("a film marked rendering that is drawn from the current image is ready again, under the topic's lock", async () => {
	const clearStatusReadsSpy = spyOn(statusReadCaches, "clearStatusReads").mockResolvedValue()
	const sentQueries = stubRebuildReads("image-new", null, "rendering")
	const rebuildResult = await rebuildTopicVideo("episode-1")
	expect(rebuildResult).toEqual({ outcome: "skipped", reason: "current" })
	expect(clearStatusReadsSpy).toHaveBeenCalledWith("topicVideo", "episode-1")

	// the Topic's image visibility lock is shared and comes before the read of the image and the write
	const lockIndex = sentQueries.findIndex(({ text }) => text.includes("pg_advisory_xact_lock_shared"))
	expect(sentQueries[lockIndex]?.values).toEqual(["unchecked-image-topic:topic-1"])
	expect(sentQueries[lockIndex + 1]?.text).toContain('from "episodes" inner join "topics"')
	expect(sentQueries[lockIndex + 2]?.text).toContain('from "unchecked_images"')
	const filmUpdate = sentQueries[lockIndex + 3]
	expect(filmUpdate?.text).toStartWith('update "topic_videos"')

	// the film is ready again if it is still marked rendering and drawn from that image. the second value is the time
	// the row changed
	expect(filmUpdate?.values.toSpliced(1, 1)).toEqual([
		"ready",
		"episode-1",
		"rendering",
		"image-new",
		"chapters.mp4",
		"film.mp4",
	])
})

// a film marked rendering plays nothing, so the spend cutoff that keeps a stale film playing does not stop its rebuild
test("a film marked rendering is rebuilt whatever its owner spent, and its rebuild fails if its image changes", async () => {
	// the film was drawn from an image it no longer shows, and the read inside the swap finds another image again
	let podcastEpisodeReadCount = 0
	const renderingFilmRow = ["rendering", "intro.mp4", "chapters.mp4", null, "film.mp4", "image-old", 3]
	const sentQueries = stubConnectionPool(({ text }) => {
		// the podcast episode shows one image at the start of the rebuild and another at its swap
		if (text.includes('from "episodes" inner join "topics"')) {
			podcastEpisodeReadCount += 1
			const podcastEpisodeImageHash = podcastEpisodeReadCount === 1 ? "image-new" : "image-newer"
			return [[...PUBLISHED_PODCAST_EPISODE_ROW.slice(0, 8), podcastEpisodeImageHash, "AI Agents", null, null]]
		}
		return text.startsWith('select "status"') ? [renderingFilmRow] : []
	})

	// the steps that read storage and run ffmpeg
	const cutoffSpy = spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(true)
	spyOn(storage, "downloadPodcastEpisodeFile").mockResolvedValue(undefined)
	spyOn(storage, "deleteStoredObjects").mockResolvedValue(undefined)
	spyOn(videoAudio, "loadVideoAudio").mockResolvedValue({
		audioPath: "/work/audio.mp3",
		durationSeconds: 60,
		segments: [],
		captionCues: [],
	})
	spyOn(topicVideoInputs, "loadShownImageStill").mockResolvedValue({
		stillPng: new Uint8Array([7]),
		zoomLimit: 2,
		isPodcastCard: false,
	})
	spyOn(videoChapterImages, "prepareChapterImages").mockResolvedValue({
		chapterImages: new Map(),
		podcastCardImages: [],
		firstChapterImages: [],
		newlyGeneratedChapterImageCount: 0,
	})
	spyOn(videoImageParts, "renderVideoImageParts").mockResolvedValue({ introPath: null, signOffPath: null })
	spyOn(videoFilm, "rewriteVideoFilm").mockResolvedValue(undefined)
	spyOn(topicVideoRows, "uploadTopicVideoFile").mockResolvedValue("film-key")

	// the rebuild runs past the cutoff, and throws an error before the swap because the image changed while it ran
	await expect(rebuildTopicVideo("episode-1")).rejects.toThrow("image changed during its rebuild")
	expect(cutoffSpy).not.toHaveBeenCalled()
	expect(isFilmRowUpdated(sentQueries)).toBe(false)
})

// a rebuild that a re-render overtook finds no film with the chapters part it read, so it swaps nothing and its new
// files stay pending deletion
test("a rebuild swaps only a film that still has the chapters part it read", async () => {
	// a film at render version 2 rendered from an old image, whose swap finds no row
	const readyFilmRow = ["ready", "intro.mp4", "chapters-v2.mp4", "sign-off.mp4", "film.mp4", "image-old", 2]
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "episodes" inner join "topics"')) {
			return [[...PUBLISHED_PODCAST_EPISODE_ROW, null]]
		}
		return text.startsWith('select "status"') ? [readyFilmRow] : []
	})

	// the steps that read storage and run ffmpeg, and an upload that records each key
	spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(false)
	spyOn(storage, "downloadPodcastEpisodeFile").mockResolvedValue(undefined)
	spyOn(videoAudio, "loadVideoAudio").mockResolvedValue({
		audioPath: "/work/audio.mp3",
		durationSeconds: 60,
		segments: [],
		captionCues: [],
	})
	const stillPng = new Uint8Array([7])
	spyOn(topicVideoInputs, "loadShownImageStill").mockResolvedValue({
		stillPng,
		zoomLimit: 2,
		isPodcastCard: false,
	})
	const prepareChapterImages = spyOn(videoChapterImages, "prepareChapterImages").mockResolvedValue({
		chapterImages: new Map(),
		podcastCardImages: [],
		firstChapterImages: [],
		newlyGeneratedChapterImageCount: 0,
	})
	spyOn(videoImageParts, "renderVideoImageParts").mockResolvedValue({ introPath: "/work/intro.mp4", signOffPath: null })
	spyOn(videoFilm, "rewriteVideoFilm").mockResolvedValue(undefined)
	const clearFeed = spyOn(podcastFeedCache, "deletePodcastFeedCache").mockResolvedValue(undefined)
	const clearStatusReadsSpy = spyOn(statusReadCaches, "clearStatusReads").mockResolvedValue()
	const track = spyOn(analytics, "trackEvent").mockImplementation(() => {})

	// each upload records its key
	const uploadedKeys: string[] = []
	spyOn(topicVideoRows, "uploadTopicVideoFile").mockImplementation(async ({ filePath, key }) => {
		if (filePath) {
			uploadedKeys.push(key)
		}
		return filePath ? key : null
	})

	// the rebuild is superseded, so nothing is cleared or tracked
	expect(await rebuildTopicVideo("episode-1")).toEqual({ outcome: "skipped", reason: "superseded" })
	expect(clearFeed).not.toHaveBeenCalled()
	expect(clearStatusReadsSpy).not.toHaveBeenCalled()
	expect(track).not.toHaveBeenCalled()

	// the intro and the sign-off cut through the chapters' stored images, with none generated
	expect(prepareChapterImages).toHaveBeenCalledWith(expect.objectContaining({ isChapterImageGenerationSkipped: true }))

	// the new parts are keyed by the new image and the film's render version
	expect(uploadedKeys).toEqual([
		expect.stringMatching(/^episodes\/episode-1\/video\/intro-image-new-v2-[a-f0-9-]{36}\.mp4$/),
		expect.stringMatching(/^episodes\/episode-1\/video\/film-image-new-v2-[a-f0-9-]{36}\.mp4$/),
	])

	// the swap names the image and the chapters part the rebuild read, and with no row swapped nothing else is written.
	// a swapped film is ready, which lets a film marked rendering play again
	const [swapUpdate] = sentQueries.filter((sentQuery) => sentQuery.text.startsWith('update "topic_videos"'))
	expect(swapUpdate?.values).toContain("ready")
	expect(swapUpdate?.text).toContain('"rendered_image_hash" = $')
	expect(swapUpdate?.text).toContain('"chapters_key" = $')
	expect(swapUpdate?.values).toContain("chapters-v2.mp4")
	expect(sentQueries.some((sentQuery) => sentQuery.text.includes('"pending_object_deletions"'))).toBe(false)
})

test.each(["matching", "replaced", "changed-poster", "legacy"] as const)(
	"a poster rebuild verifies the %s scene plan against the published chapters key",
	async (scenario) => {
		// render one public source picture, then authorize a different picture in a competing plan
		const episode = "episode-1"
		const picture = Buffer.from("first picture")
		const replacement = Buffer.from("second picture")
		const createPlan = (bytes: Buffer): ReturnType<typeof planVideoScenes> => {
			const sourceImageHash = sha256Hash(bytes)
			return planVideoScenes({
				episode,
				position: 0,
				frameCount: 120,
				startSeconds: 0,
				title: "",
				captions: [],
				sourceImageHashes: [sourceImageHash],
				videoSceneImages: [{ sourceImageHash, origin: "resource", width: 1280, height: 720 }],
			})
		}

		// the published plan, the current picture, and the film's one chapter
		const published = createPlan(picture)
		const current = scenario === "replaced" ? replacement : picture
		const sceneSources = [{ position: 0, resourceId: "resource", resourceImageKeys: [] }]
		const segments: VideoSegment[] = [{ kind: "chapter", position: 0, startSeconds: 0, frameCount: 120 }]
		if (scenario === "changed-poster") {
			segments.push({ kind: "hot-takes", position: 0, startSeconds: 5, frameCount: 240 })
		}

		// the posters, and the scene plan hashes of the published film and of a fresh render
		const oldPoster = { stillPng: picture, zoomLimit: 2, isPodcastCard: false }
		const newPoster = { ...oldPoster, stillPng: replacement }
		const hash = toVideoScenePlansHash(
			[sha256Hash(JSON.stringify(toStoredVideoScenePlan(published)))],
			sceneSources,
			toRetainedPosterHash(episode, segments, [], oldPoster),
		)
		const freshHash = toVideoScenePlansHash(
			[sha256Hash(JSON.stringify(toStoredVideoScenePlan(createPlan(current))))],
			sceneSources,
			toRetainedPosterHash(episode, segments, [], newPoster),
		)
		const chaptersKey = toTopicVideoRenderAttemptUploadKey(
			toTopicVideoChaptersKey(episode, 4, scenario === "legacy" ? undefined : hash),
			crypto.randomUUID(),
		)

		// the film row, read and published
		const row = [scenario === "legacy" ? "rendering" : "ready", null, chaptersKey, null, "old.mp4", "image-old", 4]
		const queries = stubConnectionPool(({ text }) => {
			if (text.includes('from "episodes" inner join "topics"')) {
				return [[...PUBLISHED_PODCAST_EPISODE_ROW, null]]
			}
			if (text.includes("for share") && text.includes('from "episode_chapters"')) {
				return [[0, "resource"]]
			}

			// the publication finds the film, and the film read returns the row
			if (text.startsWith('update "topic_videos"')) {
				return [["film"]]
			}
			return text.startsWith('select "status"') ? [row] : []
		})

		// only the matching plan may read and publish the retained pixels
		const downloads = spyOn(storage, "downloadPodcastEpisodeFile").mockResolvedValue(undefined)
		spyOn(storage, "attachmentExists").mockResolvedValue(true)
		spyOn(storage, "getAttachmentBytes").mockResolvedValue(
			Buffer.from(JSON.stringify(toStoredVideoScenePlan(createPlan(current)))),
		)
		const cutoff = spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(scenario === "legacy")
		spyOn(videoAudio, "loadVideoAudio").mockResolvedValue({
			audioPath: "audio.mp3",
			durationSeconds: 5,
			captionCues: [],
			segments,
		})
		spyOn(topicVideoInputs, "loadShownImageStill").mockResolvedValue(newPoster)
		spyOn(videoChapterImages, "prepareChapterImages").mockResolvedValue({
			chapterImages: new Map([
				[
					0,
					{
						images: [{ loadSceneImage: async () => current, loadStillPng: async () => current, zoomLimit: 2 }],
						lowerThirdText: { title: "", detail: "" },
					},
				],
			]),
			sceneSources,
			podcastCardImages: [],
			firstChapterImages: [],
			newlyGeneratedChapterImageCount: 0,
		})
		// record the exact replacement frames and the key that becomes ready
		const encode = spyOn(filmFiles, "renderFilmChapters").mockResolvedValue({
			chaptersPath: "safe-chapters.mp4",
			scenePlansHash: freshHash,
		})
		spyOn(videoImageParts, "renderVideoImageParts").mockResolvedValue({ introPath: null, signOffPath: null })
		const rewrite = spyOn(videoFilm, "rewriteVideoFilm").mockResolvedValue(undefined)

		// each upload with a file keeps its key
		const upload = spyOn(topicVideoRows, "uploadTopicVideoFile").mockImplementation(
			async ({ filePath, key, uploadedKeys }) => {
				if (!filePath) {
					return null
				}
				uploadedKeys.push(key)
				return key
			},
		)

		// the feed cache, the status copy, the visitor pages, and the analytics stay in the process
		spyOn(podcastFeedCache, "deletePodcastFeedCache").mockResolvedValue(undefined)
		const clearStatusReadsSpy = spyOn(statusReadCaches, "clearStatusReads").mockResolvedValue()
		const clearVisitorPagesSpy = spyOn(visitorPageCaches, "clearVisitorPagesOfTopic").mockResolvedValue()
		const track = spyOn(analytics, "trackEvent").mockImplementation(() => {})

		// a legacy film that lost its poster can become ready even above its owner's cutoff, and its status copy and its
		// topic's visitor pages go
		expect((await rebuildTopicVideo(episode)).outcome).toBe("rebuilt")
		expect(track).toHaveBeenCalledTimes(1)
		expect(clearStatusReadsSpy).toHaveBeenCalledWith("topicVideo", episode)
		expect(clearVisitorPagesSpy.mock.calls).toEqual([["topic-1"]])

		// the publication makes the film ready with the chapters key and keeps the old film
		const publication = queries.find((query) => query.text.startsWith('update "topic_videos"'))
		expect(publication?.values).toContain("ready")
		expect(publication?.values).toContain(chaptersKey)
		expect(publication?.values).toContain("old.mp4")

		// a matching plan reads the stored chapters and renders nothing
		const downloadedKeys = downloads.mock.calls.map(([file]) => file.key)
		if (scenario === "matching") {
			expect(encode).not.toHaveBeenCalled()
			expect(downloadedKeys).toEqual([chaptersKey, "old.mp4"])
			return
		}

		// a legacy film is rebuilt without reading its owner's cutoff
		if (scenario === "legacy") {
			expect(cutoff).not.toHaveBeenCalled()
		}

		// only published narration and captions are read from the old film on the replacement path
		expect(downloadedKeys).toEqual(["old.mp4"])
		expect(encode).toHaveBeenCalledWith(
			expect.objectContaining({
				animationBilling: { ownerId: "owner-1", isPlatformBilled: false, isStoredAnimationOnly: true },
			}),
		)
		expect(rewrite).toHaveBeenCalledWith(expect.objectContaining({ chaptersPath: "safe-chapters.mp4" }))
		const uploadKey = upload.mock.calls.find(([file]) => file.filePath === "safe-chapters.mp4")?.[0].key
		expect(uploadKey).toContain(freshHash)
		expect(publication?.values).toContain(uploadKey)
		expect(
			queries.some(
				(query) =>
					query.text.startsWith('insert into "pending_object_deletions"') && query.values.includes(chaptersKey),
			),
		).toBe(true)
	},
)
