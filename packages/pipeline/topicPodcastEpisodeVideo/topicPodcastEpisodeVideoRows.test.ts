// the film row's writes, with the connection pool stubbed: the render state a render reads, the failure mark that
// keeps a ready film ready, and the swap that changes nothing for a film removed or already swapped
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as monitoring from "@carlnotes/server/monitoring"
import {
	loadTopicPodcastEpisodeVideoRenderState,
	markTopicPodcastEpisodeVideoFailed,
	saveTopicPodcastEpisodeVideoRerendered,
	TOPIC_PODCAST_EPISODE_VIDEO_RENDER_VERSION,
} from "./topicPodcastEpisodeVideoRows"

// a film rendered again at the current render version, and the keys of the files it replaces
const RERENDERED_FILM = {
	podcastEpisodeId: "episode-1",
	objectKeys: {
		introKey: "episodes/episode-1/video/intro-image-1-v2.mp4",
		chaptersKey: "episodes/episode-1/video/chapters-v2.mp4",
		signOffKey: null,
		filmKey: "episodes/episode-1/video/film-image-1-v2.mp4",
		captionsKey: "episodes/episode-1/video/captions-v2.vtt",
	},
	byteSize: 1000,
	durationSeconds: 60.4,
	imageHash: "image-1",
	costDollars: 0,
}

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// the film row's updates among the queries a test sent
function toFilmRowUpdates(sentQueries: SentQuery[]): SentQuery[] {
	return sentQueries.filter((sentQuery) => sentQuery.text.startsWith('update "topic_podcast_episode_videos"'))
}

// the writes to the pending object deletions among the queries a test sent
function toPendingDeletionWrites(sentQueries: SentQuery[]): SentQuery[] {
	return sentQueries.filter((sentQuery) => sentQuery.text.includes('"pending_object_deletions"'))
}

test("the current render version is 2, which cuts each chapter into a montage", () => {
	expect(TOPIC_PODCAST_EPISODE_VIDEO_RENDER_VERSION).toBe(2)
})

test("a render reads the film's status and its render version", async () => {
	stubConnectionPool(() => [["ready", 1]])
	expect(await loadTopicPodcastEpisodeVideoRenderState("episode-1")).toEqual({ status: "ready", renderVersion: 1 })

	// a podcast episode with no film row has no render state
	stubConnectionPool(() => [])
	expect(await loadTopicPodcastEpisodeVideoRenderState("episode-1")).toBeNull()
})

test("the failure mark keeps a ready film ready and records the failed render version", async () => {
	// the update that records the failed version finds a ready film
	const reportError = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const sentQueries = stubConnectionPool(({ text }) =>
		text.startsWith('update "topic_podcast_episode_videos" set "failed_render_version"') ? [["film-1"]] : [],
	)
	await markTopicPodcastEpisodeVideoFailed("episode-1", "ffmpeg exited with code 1")

	// one update, which sets the failed render version on a ready row and never the status
	const filmRowUpdates = toFilmRowUpdates(sentQueries)
	expect(filmRowUpdates).toHaveLength(1)
	expect(filmRowUpdates[0]?.values).toContain(TOPIC_PODCAST_EPISODE_VIDEO_RENDER_VERSION)
	expect(filmRowUpdates[0]?.values).toContain("ready")
	expect(filmRowUpdates[0]?.values).not.toContain("failed")
	expect(reportError).toHaveBeenCalledTimes(1)
})

test("the failure mark marks a film that never was ready as failed", async () => {
	// no ready film, so the update that records the failed version finds no row
	const reportError = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const sentQueries = stubConnectionPool(() => [])
	await markTopicPodcastEpisodeVideoFailed("episode-1", "ffmpeg exited with code 1")

	// the second update writes the failed status with the error
	const [, failedUpdate] = toFilmRowUpdates(sentQueries)
	expect(failedUpdate?.values).toContain("failed")
	expect(failedUpdate?.values).toContain("ffmpeg exited with code 1")
	expect(reportError).toHaveBeenCalledTimes(1)
})

test("a swap takes the new keys and schedules the files the row played for deletion", async () => {
	// the row plays a version 1 film with no sign-off, read under the row's lock
	const replacedFilmRow = [
		"episodes/episode-1/video/intro-image-1.mp4",
		"episodes/episode-1/video/chapters.mp4",
		null,
		"episodes/episode-1/video/film-image-1.mp4",
		"episodes/episode-1/video/captions.vtt",
	]
	const sentQueries = stubConnectionPool(({ text }) => (text.includes("for no key update") ? [replacedFilmRow] : []))
	await saveTopicPodcastEpisodeVideoRerendered(RERENDERED_FILM)

	// the read and the update apply only to a ready film below the current render version
	const lockedRead = sentQueries.find((sentQuery) => sentQuery.text.includes("for no key update"))
	expect(lockedRead?.text).toContain('"render_version" < $')
	const [swapUpdate] = toFilmRowUpdates(sentQueries)
	expect(swapUpdate?.text).toContain('"render_version" < $')
	expect(swapUpdate?.values).toContain("episodes/episode-1/video/chapters-v2.mp4")
	expect(swapUpdate?.values).toContain(60)

	// the new keys leave the pending deletions, and the replaced keys join them
	const pendingDeletionWrites = toPendingDeletionWrites(sentQueries)
	const pendingDeletionDeletes = pendingDeletionWrites.filter((sentQuery) => sentQuery.text.startsWith("delete"))
	const pendingDeletionInserts = pendingDeletionWrites.filter((sentQuery) => sentQuery.text.startsWith("insert"))
	expect(pendingDeletionDeletes).toHaveLength(4)
	expect(pendingDeletionInserts).toHaveLength(1)
	expect(pendingDeletionInserts[0]?.values).toContain("episodes/episode-1/video/chapters.mp4")
	expect(pendingDeletionInserts[0]?.values).toContain("episodes/episode-1/video/film-image-1.mp4")
})

test("a swap that finds no ready film below the version changes nothing", async () => {
	const sentQueries = stubConnectionPool(() => [])
	await saveTopicPodcastEpisodeVideoRerendered(RERENDERED_FILM)
	expect(toFilmRowUpdates(sentQueries)).toEqual([])
	expect(toPendingDeletionWrites(sentQueries)).toEqual([])
})
