// the film rebuild's skips and its swap, with the connection pool stubbed: a film rendered from the image it shows now,
// its own or else its podcast episode's, and an owner past the spend cutoff are left as they are, and a rebuild swaps
// only the film it read
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as monthlyBudgetCutoffs from "@carlnotes/db/monthlyBudgetCutoffs"
import * as podcastFeedCache from "@carlnotes/db/podcastFeedCache"
import * as storage from "@carlnotes/db/store"
import * as analytics from "@carlnotes/server/analytics"
import { rebuildTopicPodcastEpisodeVideo } from "./rebuildTopicPodcastEpisodeVideo"
import * as topicPodcastEpisodeVideoInputs from "./topicPodcastEpisodeVideoInputs"
import * as topicPodcastEpisodeVideoRows from "./topicPodcastEpisodeVideoRows"
import * as videoAudio from "./videoAudio"
import * as videoChapterImages from "./videoChapterImages"
import * as videoImageParts from "./videoImageParts"
import * as videoParts from "./videoParts"

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

// put the connection pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// answer the podcast episode read and the film read, which was rendered from an image of the given hash. the film has
// its own image if a hash for one is given
function stubRebuildReads(
	renderedImageHash: string,
	topicPodcastEpisodeVideoImageHash: string | null = null,
): SentQuery[] {
	const readyFilmRow = ["ready", "intro.mp4", "chapters.mp4", "sign-off.mp4", "film.mp4", renderedImageHash, 1]
	return stubConnectionPool(({ text }) => {
		// the podcast episode read with its film's own image last, then the film read, and no rows for anything else
		if (text.includes('from "episodes" inner join "topics"')) {
			return [[...PUBLISHED_PODCAST_EPISODE_ROW, topicPodcastEpisodeVideoImageHash]]
		}
		return text.startsWith('select "status"') ? [readyFilmRow] : []
	})
}

// whether the film row was updated
function isFilmRowUpdated(sentQueries: SentQuery[]): boolean {
	return sentQueries.some((sentQuery) => sentQuery.text.startsWith('update "topic_podcast_episode_videos"'))
}

// a film already rendered from the image the podcast episode shows needs no rebuild
test("a film rendered from the current image is skipped", async () => {
	const sentQueries = stubRebuildReads("image-new")
	const rebuildResult = await rebuildTopicPodcastEpisodeVideo("episode-1")
	expect(rebuildResult).toEqual({ outcome: "skipped", reason: "current" })
	expect(isFilmRowUpdated(sentQueries)).toBe(false)
})

// a film with its own image is current while it was rendered from that image, whatever its podcast episode shows now
test("a film rendered from its own image is skipped, though its podcast episode's image changed", async () => {
	const sentQueries = stubRebuildReads("film-image", "film-image")
	const rebuildResult = await rebuildTopicPodcastEpisodeVideo("episode-1")
	expect(rebuildResult).toEqual({ outcome: "skipped", reason: "current" })
	expect(isFilmRowUpdated(sentQueries)).toBe(false)
})

// an owner past the podcast episode spend cutoff keeps the film that plays now
test("an owner past the spend cutoff keeps the stale film", async () => {
	// the film shows an old image, and the owner is past the cutoff
	const sentQueries = stubRebuildReads("image-old")
	const cutoffSpy = spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(true)
	try {
		const rebuildResult = await rebuildTopicPodcastEpisodeVideo("episode-1")
		expect(rebuildResult).toEqual({ outcome: "skipped", reason: "spend-cutoff" })
	} finally {
		cutoffSpy.mockRestore()
	}

	// nothing was written
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
	spyOn(topicPodcastEpisodeVideoInputs, "loadShownImageStill").mockResolvedValue({
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
	spyOn(videoParts, "rewriteVideoFilm").mockResolvedValue(undefined)
	spyOn(podcastFeedCache, "deletePodcastFeedCache").mockResolvedValue(undefined)
	spyOn(analytics, "trackEvent").mockImplementation(() => {})

	// each upload records its key
	const uploadedKeys: string[] = []
	spyOn(topicPodcastEpisodeVideoRows, "uploadTopicPodcastEpisodeVideoFile").mockImplementation(
		async ({ filePath, key }) => {
			if (filePath) {
				uploadedKeys.push(key)
			}
			return filePath ? key : null
		},
	)
	await rebuildTopicPodcastEpisodeVideo("episode-1")

	// the intro and the sign-off cut through the chapters' stored images, with none generated
	expect(prepareChapterImages).toHaveBeenCalledWith(expect.objectContaining({ isChapterImageGenerationSkipped: true }))

	// the new parts are keyed by the new image and the film's render version
	expect(uploadedKeys).toEqual([
		"episodes/episode-1/video/intro-image-new-v2.mp4",
		"episodes/episode-1/video/film-image-new-v2.mp4",
	])

	// the swap names the image and the chapters part the rebuild read, and with no row swapped nothing else is written
	const [swapUpdate] = sentQueries.filter((sentQuery) =>
		sentQuery.text.startsWith('update "topic_podcast_episode_videos"'),
	)
	expect(swapUpdate?.text).toContain('"rendered_image_hash" = $')
	expect(swapUpdate?.text).toContain('"chapters_key" = $')
	expect(swapUpdate?.values).toContain("chapters-v2.mp4")
	expect(sentQueries.some((sentQuery) => sentQuery.text.includes('"pending_object_deletions"'))).toBe(false)
})
