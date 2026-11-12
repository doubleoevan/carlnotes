// the podcast episode film routes: the film and captions urls behind the access check, and the rebuild that a stale
// film starts
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as monthlyBudgetCutoffs from "@carlnotes/db/monthlyBudgetCutoffs"
import * as redisRateLimits from "@carlnotes/db/redisRateLimits"
import * as storage from "@carlnotes/db/store"
import * as temporalClient from "@carlnotes/pipeline/temporalClient"
import * as viewerCounts from "../counts/viewerCounts"
import { toSignedInApp } from "../testSession"
import type { PodcastEpisodeRow, TopicRow } from "./podcastEpisodeRows"
import * as episodeRows from "./podcastEpisodeRows"
import { startStaleFilmRebuild, topicPodcastEpisodeVideosRoute } from "./topicPodcastEpisodeVideoRoutes"

// a published podcast episode with no image of its own, and its topic, which shows the image "image-new"
const podcastEpisodeRow: PodcastEpisodeRow = {
	id: "episode-1",
	topicId: "topic-1",
	scanId: "scan-1",
	status: "published",
	title: "Episode",
	description: null,
	season: 2026,
	episodeNumber: 1,
	audioKey: "audio-key",
	audioByteSize: 1234,
	durationSeconds: 60,
	listenerCount: 0,
	publishedAt: new Date(),
	imageHash: null,
}
const topic = { id: "topic-1", ownerId: "owner", visibility: "private", imageHash: "image-new" } as TopicRow

// the ready film's row in the film read's select order: film, captions, size, the image it was drawn from, its own
// image, null for a film with none, and the user its podcast episode bills, who is not the topic's owner
const toReadyFilmRow = (renderedImageHash: string, imageHash: string | null = null): unknown[] => [
	"films/episode-1/film.mp4",
	"films/episode-1/captions.vtt",
	5678,
	renderedImageHash,
	imageHash,
	"episode-owner",
]
const fileUrl = "https://media.example/file?X-Amz-Signature=private"
const jsonRequest = { headers: { Accept: "application/json" } }

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// spy the file url, the listen count, the stale film check's slot, which every check takes, the cutoff, and the
// rebuild start
function spyFilmRequest(): { count: ReturnType<typeof spyOn>; rebuild: ReturnType<typeof spyOn> } {
	spyOn(storage, "toPodcastEpisodeFileUrl").mockReturnValue(fileUrl)
	spyOn(redisRateLimits, "takeRateLimitSlot").mockResolvedValue(0)
	spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(false)
	const count = spyOn(viewerCounts, "countWithinRateLimit").mockResolvedValue(undefined)
	const rebuild = spyOn(temporalClient, "startTopicPodcastEpisodeVideoRebuild").mockResolvedValue(undefined)
	return { count, rebuild }
}

test("the film url checks access, counts a GET, and returns 404 for a podcast episode without a film", async () => {
	// a podcast episode the user cannot open is a 404 that counts nothing
	const { count } = spyFilmRequest()
	const access = spyOn(episodeRows, "loadAccessiblePodcastEpisode").mockResolvedValue(null)
	stubConnectionPool(() => [toReadyFilmRow("image-new")])
	const app = toSignedInApp(topicPodcastEpisodeVideosRoute, "listener")
	const denied = await app.request("/episodes/episode-1/video.mp4", jsonRequest)
	expect(denied.status).toBe(404)
	expect(denied.headers.get("Cache-Control")).toBe("private, no-store")
	expect(count).not.toHaveBeenCalled()

	// a podcast episode the user can open, with no ready film, is a 404 too
	access.mockResolvedValue({ podcastEpisodeRow, topic })
	restoreConnectionPool()
	stubConnectionPool(() => [])
	expect((await app.request("/episodes/episode-1/video.mp4", jsonRequest)).status).toBe(404)
	expect(count).not.toHaveBeenCalled()
})

test("a ready film returns its signed url, and a HEAD keeps its length without counting a play", async () => {
	// the JSON form names the film's url
	const { count } = spyFilmRequest()
	spyOn(episodeRows, "loadAccessiblePodcastEpisode").mockResolvedValue({ podcastEpisodeRow, topic })
	stubConnectionPool(() => [toReadyFilmRow("image-new")])
	const app = toSignedInApp(topicPodcastEpisodeVideosRoute, "listener")
	const response = await app.request("/episodes/episode-1/video.mp4", jsonRequest)
	expect(response.status).toBe(200)
	expect((await response.json()).videoUrl).toBe(fileUrl)
	expect(count).toHaveBeenCalledTimes(1)

	// a plain GET redirects, and a HEAD returns the film's length and type
	expect((await app.request("/episodes/episode-1/video.mp4")).headers.get("Location")).toBe(fileUrl)
	const head = await app.request("/episodes/episode-1/video.mp4", { method: "HEAD" })
	expect(head.headers.get("Content-Length")).toBe("5678")
	expect(head.headers.get("Content-Type")).toBe("video/mp4")
	expect(count).toHaveBeenCalledTimes(2)

	// the captions url names the captions, and a plain GET returns the captions from this origin
	const captions = await app.request("/episodes/episode-1/captions.vtt", jsonRequest)
	expect((await captions.json()).captionsUrl).toBe(fileUrl)
	const stream = spyOn(storage, "attachmentStream").mockReturnValue(new Response("WEBVTT").body as ReadableStream)
	const captionsFile = await app.request("/episodes/episode-1/captions.vtt")
	expect(captionsFile.headers.get("Content-Type")).toBe("text/vtt; charset=utf-8")
	expect(await captionsFile.text()).toBe("WEBVTT")
	expect(stream).toHaveBeenCalledWith("films/episode-1/captions.vtt")
})

test("a film drawn from an older image starts a rebuild, and the film that plays now is served", async () => {
	// the film shows image-old while the topic shows image-new
	const { rebuild } = spyFilmRequest()
	spyOn(episodeRows, "loadAccessiblePodcastEpisode").mockResolvedValue({ podcastEpisodeRow, topic })
	const sentQueries = stubConnectionPool(() => [toReadyFilmRow("image-old")])
	const app = toSignedInApp(topicPodcastEpisodeVideosRoute, "listener")
	expect((await app.request("/episodes/episode-1/video.mp4", jsonRequest)).status).toBe(200)
	expect(rebuild).toHaveBeenCalledWith("episode-1")

	// the film read joins its podcast episode for the owner, and the cutoff is checked for that owner
	expect(sentQueries[0]?.text).toContain('inner join "episodes" on "episodes"."id" =')
	expect(monthlyBudgetCutoffs.isMonthlyBudgetCutoffPassed).toHaveBeenCalledWith("episode-owner", "podcastEpisodes")
})

test("a current film, or a podcast episode owner past the cutoff, starts no rebuild", async () => {
	// a film drawn from the shown image is current
	const { rebuild } = spyFilmRequest()
	const currentFilm = { renderedImageHash: "image-new", imageHash: null, ownerId: "episode-owner" }
	await startStaleFilmRebuild({ podcastEpisodeRow, topic }, currentFilm)
	expect(rebuild).not.toHaveBeenCalled()

	// a stale film waits while the user its podcast episode bills is past the podcast episode cutoff
	const cutoff = spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(true)
	await startStaleFilmRebuild({ podcastEpisodeRow, topic }, { ...currentFilm, renderedImageHash: "image-old" })
	expect(cutoff).toHaveBeenCalledWith("episode-owner", "podcastEpisodes")
	expect(cutoff).not.toHaveBeenCalledWith("owner", "podcastEpisodes")
	expect(rebuild).not.toHaveBeenCalled()
})

test("a stale film's second request inside the minute runs no spend read and starts no rebuild", async () => {
	// the first check takes the podcast episode's slot, and the second finds the slot held
	const { rebuild } = spyFilmRequest()
	const slot = spyOn(redisRateLimits, "takeRateLimitSlot").mockResolvedValueOnce(0).mockResolvedValueOnce(30_000)
	const cutoff = spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(true)
	const staleFilm = { renderedImageHash: "image-old", imageHash: null, ownerId: "episode-owner" }
	await startStaleFilmRebuild({ podcastEpisodeRow, topic }, staleFilm)
	await startStaleFilmRebuild({ podcastEpisodeRow, topic }, staleFilm)

	// one spend read for the two requests, under the podcast episode's own key for a minute
	expect(cutoff).toHaveBeenCalledTimes(1)
	expect(rebuild).not.toHaveBeenCalled()
	expect(slot).toHaveBeenCalledWith({ key: "stale-film-check:episode-1", slotMs: 60_000 })

	// a current film takes no slot
	slot.mockClear()
	await startStaleFilmRebuild({ podcastEpisodeRow, topic }, { ...staleFilm, renderedImageHash: "image-new" })
	expect(slot).not.toHaveBeenCalled()
})

test("a film with its own image rebuilds for that image alone, never for its podcast episode's", async () => {
	// the film was drawn from its own image, so the image its topic shows now starts nothing
	const { rebuild } = spyFilmRequest()
	await startStaleFilmRebuild(
		{ podcastEpisodeRow, topic },
		{ renderedImageHash: "film-image", imageHash: "film-image", ownerId: "episode-owner" },
	)
	expect(rebuild).not.toHaveBeenCalled()

	// a regenerate or an upload gave the film a new image, which a play of the stale film rebuilds for
	spyOn(episodeRows, "loadAccessiblePodcastEpisode").mockResolvedValue({ podcastEpisodeRow, topic })
	stubConnectionPool(() => [toReadyFilmRow("film-image", "film-image-new")])
	const app = toSignedInApp(topicPodcastEpisodeVideosRoute, "listener")
	expect((await app.request("/episodes/episode-1/video.mp4", jsonRequest)).status).toBe(200)
	expect(rebuild).toHaveBeenCalledWith("episode-1")
})
