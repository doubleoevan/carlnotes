// the film row's writes, with the connection pool stubbed: the render state a render reads, the row written once a
// render is queued, the failure mark that keeps a ready film ready, and the swap that changes nothing for a film removed
// or already swapped
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import {
	restoreConnectionPool,
	type SentQuery,
	stubConnectionPool,
	toTableUpdates,
} from "@carlnotes/db/connectionPoolStub"
import * as storage from "@carlnotes/db/store"
import * as monitoring from "@carlnotes/server/monitoring"
import { markTopicVideoFailed } from "./topicVideoFailures"
import {
	loadTopicVideoRenderState,
	publishTopicVideoReplacement,
	recordPlatformTopicVideoSpend,
	saveQueuedTopicVideoRendering,
	TOPIC_VIDEO_RENDER_VERSION,
} from "./topicVideoRows"

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

// stub the bucket's listing of the shots a render kept and their delete, and return the delete's spy
function stubStoredShots(storedShotKeys: string[] = []): ReturnType<typeof spyOn> {
	spyOn(storage, "listStoredObjectKeys").mockResolvedValue(storedShotKeys)
	return spyOn(storage, "deleteStoredObjects").mockResolvedValue(undefined)
}

// the writes to the pending object deletions among the queries a test sent
function toPendingDeletionWrites(sentQueries: SentQuery[]): SentQuery[] {
	return sentQueries.filter((sentQuery) => sentQuery.text.includes('"pending_object_deletions"'))
}

test("the current render version is 3", () => {
	expect(TOPIC_VIDEO_RENDER_VERSION).toBe(3)
})

test("a render reads the film's status and its render version", async () => {
	stubConnectionPool(() => [["ready", 1]])
	expect(await loadTopicVideoRenderState("episode-1")).toEqual({ status: "ready", renderVersion: 1 })

	// a podcast episode with no film row has no render state
	stubConnectionPool(() => [])
	expect(await loadTopicVideoRenderState("episode-1")).toBeNull()
})

test("a queued render writes its rendering row for a published podcast episode alone", async () => {
	// a published podcast episode gets the row, which never replaces a ready film's
	const publishedQueries = stubConnectionPool(({ text }) => (text.startsWith("select") ? [["published"]] : []))
	await saveQueuedTopicVideoRendering("episode-1")
	const rowInsert = publishedQueries.find((sentQuery) => sentQuery.text.startsWith('insert into "topic_videos"'))
	expect(rowInsert?.values).toContain("rendering")
	expect(rowInsert?.text).toContain('"status" <> $')

	// a removed podcast episode's render is skipped, so it gets no row
	const removedQueries = stubConnectionPool(({ text }) => (text.startsWith("select") ? [["removed"]] : []))
	await saveQueuedTopicVideoRendering("episode-1")
	expect(removedQueries.map((sentQuery) => sentQuery.text.split(" ")[0])).toEqual(["select"])
})

test("the failure mark keeps a ready film ready and records the failed render version", async () => {
	// the update that records the failed version finds a ready film
	stubStoredShots()
	const reportError = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const sentQueries = stubConnectionPool(({ text }) =>
		text.startsWith('update "topic_videos" set "failed_render_version"') ? [["film-1"]] : [],
	)
	await markTopicVideoFailed({ podcastEpisodeId: "episode-1", reason: "ffmpeg exited with code 1" })

	// one update, which sets the failed render version on a ready row and never the status
	const filmRowUpdates = toTableUpdates(sentQueries, "topic_videos")
	expect(filmRowUpdates).toHaveLength(1)
	expect(filmRowUpdates[0]?.values).toContain(TOPIC_VIDEO_RENDER_VERSION)
	expect(filmRowUpdates[0]?.values).toContain("ready")
	expect(filmRowUpdates[0]?.values).not.toContain("failed")
	expect(reportError).toHaveBeenCalledTimes(1)
})

test("the failure mark marks a film that never was ready as failed", async () => {
	// no ready film, so the update that records the failed version finds no row
	const storedShotKeys = ["episodes/episode-1/video/shots/v3/shot-1.mp4"]
	const deleteStoredShots = stubStoredShots(storedShotKeys)
	const reportError = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const sentQueries = stubConnectionPool(() => [])
	await markTopicVideoFailed({ podcastEpisodeId: "episode-1", reason: "ffmpeg exited with code 1" })

	// the second update writes the failed status with the error
	const [, failedUpdate] = toTableUpdates(sentQueries, "topic_videos")
	expect(failedUpdate?.values).toContain("failed")
	expect(failedUpdate?.values).toContain("ffmpeg exited with code 1")
	expect(reportError).toHaveBeenCalledTimes(1)

	// no attempt is left to reuse the shots that the render kept, at any render version. each accepted delete clears its
	// own pending deletion, so the failure mark clears none, and a failed delete keeps its row for the sweep
	expect(storage.listStoredObjectKeys).toHaveBeenCalledWith("episodes/episode-1/video/shots/")
	expect(deleteStoredShots).toHaveBeenCalledWith(storedShotKeys)
	expect(toPendingDeletionWrites(sentQueries)).toEqual([])
})

// a cancelled backfill must list a film it was rendering again on its next run
test("a cancelled render fails a first render, and leaves a ready film with no failed version and no report", async () => {
	// a first render in progress: its row is failed and the failure is reported
	const deleteStoredShots = stubStoredShots()
	const reportError = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const cancelledMark = { podcastEpisodeId: "episode-1", reason: "cancelled", isCancelled: true }
	const firstRenderQueries = stubConnectionPool(({ text }) =>
		text.startsWith('update "topic_videos" set "status"') ? [["film-1"]] : [],
	)
	await markTopicVideoFailed(cancelledMark)
	expect(
		toTableUpdates(firstRenderQueries, "topic_videos").map((sentQuery) => sentQuery.values.includes("failed")),
	).toEqual([true])
	expect(reportError).toHaveBeenCalledTimes(1)

	// a ready film: the one update matches no row that is not ready, no failed version is set, and nothing is reported
	const readyFilmQueries = stubConnectionPool(() => [])
	await markTopicVideoFailed(cancelledMark)
	const readyFilmUpdates = toTableUpdates(readyFilmQueries, "topic_videos")
	expect(readyFilmUpdates).toHaveLength(1)
	expect(readyFilmUpdates[0]?.text).not.toContain('"failed_render_version"')
	expect(readyFilmUpdates[0]?.text).toContain('"status" <> $')
	expect(reportError).toHaveBeenCalledTimes(1)

	// the shots stay for the render that the next backfill starts
	expect(deleteStoredShots).not.toHaveBeenCalled()
})

// the planner's call on a platform-billed render and a Free owner's first animated picture record through this write
test("the platform's film spend is a spends row with no user, and a failed write is reported and not thrown", async () => {
	// an animated picture that the platform's key paid for
	const reportError = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const platformSpend = { podcastEpisodeId: "episode-1", kind: "topicVideoAnimation", dollars: 0.36 } as const
	const sentQueries = stubConnectionPool(() => [])
	await recordPlatformTopicVideoSpend(platformSpend)
	expect(sentQueries).toHaveLength(1)
	expect(sentQueries[0]?.text).toStartWith('insert into "spends"')
	expect(sentQueries[0]?.values).toEqual(expect.arrayContaining(["topicVideoAnimation", 0.36, "episode-1"]))

	// a cost of nothing writes no row, and a failed write is reported while the render goes on
	await recordPlatformTopicVideoSpend({ ...platformSpend, dollars: 0 })
	expect(sentQueries).toHaveLength(1)
	stubConnectionPool(() => {
		throw new Error("the database is unreachable")
	})
	await recordPlatformTopicVideoSpend(platformSpend)
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
	await publishTopicVideoReplacement(RERENDERED_FILM)

	// the read and the update apply only to a ready film below the current render version
	const lockedRead = sentQueries.find((sentQuery) => sentQuery.text.includes("for no key update"))
	expect(lockedRead?.text).toContain('"render_version" < $')
	const [swapUpdate] = toTableUpdates(sentQueries, "topic_videos")
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
	await publishTopicVideoReplacement(RERENDERED_FILM)
	expect(toTableUpdates(sentQueries, "topic_videos")).toEqual([])
	expect(toPendingDeletionWrites(sentQueries)).toEqual([])
})
