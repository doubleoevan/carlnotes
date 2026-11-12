// a listener's saved progress: a play in either format counts once, and a film's play counts among the film plays too

import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { ZURICH_PLACE } from "@carlnotes/contracts/placeTestFixtures"
import type { PodcastEpisodeFormat } from "@carlnotes/contracts/podcast"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as analytics from "@carlnotes/server/analytics"
import * as viewerCounts from "../counts/viewerCounts"
import { savePodcastEpisodeListen } from "./podcastEpisodeListens"

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// save a playback start on a private topic in the format given, and return the play counts the upsert sent
async function saveStartedListen(format?: PodcastEpisodeFormat): Promise<unknown[]> {
	// stub the pool, the listener count, and the event
	const sentQueries = stubConnectionPool()
	spyOn(viewerCounts, "countPodcastEpisodeListen").mockResolvedValue(undefined)
	spyOn(analytics, "trackEvent")
	await savePodcastEpisodeListen({
		userId: "listener",
		podcastEpisodeId: "episode-1",
		topic: { id: "topic-1", visibility: "private" },
		analyticsProperties: {
			entryPoint: "web",
			plan: "free",
			platform: "desktop",
			browserPlatform: "other",
			isInAppBrowser: false,
		},
		progressSeconds: 0,
		isPlaybackStart: true,
		isCompleted: false,
		format,
		place: ZURICH_PLACE,
	})

	// the upsert adds to both counts on a conflict
	const [upsert] = sentQueries
	expect(upsert?.text).toContain('"video_play_count" = "episode_listens"."video_play_count" + $')

	// the insert's two counts, then the update's two counts
	const values = upsert?.values ?? []
	return [values[3], values[4], values[6], values[7]]
}

test("a film's playback start counts one play and one film play, and reports its format", async () => {
	// the insert counts one play and one film play, and the update adds the same
	expect(await saveStartedListen("video")).toEqual([1, 1, 1, 1])
	expect(viewerCounts.countPodcastEpisodeListen).toHaveBeenCalledWith({
		requestSender: expect.objectContaining({ userId: "listener", place: ZURICH_PLACE }),
		podcastEpisodeId: "episode-1",
		format: "video",
	})
	expect(analytics.trackEvent).toHaveBeenCalledWith(
		"episode_played",
		"listener",
		expect.objectContaining({ format: "video" }),
	)
})

test("an audio playback start counts one play and no film play", async () => {
	// the insert and the update each count one play and no film play
	expect(await saveStartedListen()).toEqual([1, 0, 1, 0])
	expect(analytics.trackEvent).toHaveBeenCalledWith(
		"episode_played",
		"listener",
		expect.objectContaining({ format: "audio" }),
	)
})
