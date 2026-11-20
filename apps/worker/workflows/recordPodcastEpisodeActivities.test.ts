// the film switch a new podcast episode reads before it starts its film: the film concurrency, the pause on new films,
// and a spend control settings read that fails, the encode's heartbeat, and the image step, which stores the podcast
// episode's cover once its image is settled
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as dailySpendCutoffs from "@carlnotes/db/dailySpendCutoffs"
import { DEFAULT_SPEND_CONTROL_SETTINGS } from "@carlnotes/db/dailySpendCutoffTestFixtures"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import * as podcastEpisodeAudio from "@carlnotes/pipeline/podcast/podcastEpisodeAudio"
import * as podcastEpisodeImage from "@carlnotes/pipeline/podcast/podcastEpisodeImage"
import * as podcastCover from "@carlnotes/pipeline/podcastCover"
import { quietErrorReports } from "@carlnotes/server/monitoringTestFixtures"
import { isTopicVideoBackfillEnabled } from "@carlnotes/server/podcastEpisodeSettings"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { MockActivityEnvironment } from "@temporalio/testing"
import {
	drawPodcastEpisodeImageActivity,
	encodePodcastEpisode,
	isTopicPodcastEpisodeVideoEnabled,
} from "./recordPodcastEpisodeActivities"

// the film settings the tests change
const TOPIC_VIDEO_SETTINGS = ["TOPIC_VIDEO_CONCURRENCY", "TOPIC_VIDEO_BACKFILL_CONCURRENCY"]
const restoreEnvSettings = saveEnvSettings(TOPIC_VIDEO_SETTINGS)

// each test starts with no film setting set, an empty in-memory Redis, and an empty spend control settings table
beforeEach(() => {
	for (const topicVideoSetting of TOPIC_VIDEO_SETTINGS) {
		delete Bun.env[topicVideoSetting]
	}
	stubRedisClient()
	stubConnectionPool()
})

// put the settings, both stores, and every spy back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
	restoreRedisClient()
	restoreEnvSettings()
})

// films are on by default, and the pause on new films is off in an empty table
test("a new podcast episode starts its film with nothing set", async () => {
	expect(await isTopicPodcastEpisodeVideoEnabled()).toBe(true)
})

// films that are off start none, without a read of the spend control settings
test("a film concurrency of zero starts no film, and reads no setting", async () => {
	Bun.env.TOPIC_VIDEO_CONCURRENCY = "0"
	const loadSpendControlSettingsSpy = spyOn(dailySpendCutoffs, "loadSpendControlSettings")
	expect(await isTopicPodcastEpisodeVideoEnabled()).toBe(false)
	expect(loadSpendControlSettingsSpy).not.toHaveBeenCalled()
})

// the switch is read for every new podcast episode, so a pause turned on or off holds for the next one in the same
// process
test("the pause on new films starts no film for a new podcast episode, and turning it off starts the next one's", async () => {
	// new films paused
	const loadSpendControlSettingsSpy = spyOn(dailySpendCutoffs, "loadSpendControlSettings").mockResolvedValue({
		...DEFAULT_SPEND_CONTROL_SETTINGS,
		isTopicVideoRenderingPaused: true,
	})
	expect(await isTopicPodcastEpisodeVideoEnabled()).toBe(false)

	// the pause turned off
	loadSpendControlSettingsSpy.mockResolvedValue(DEFAULT_SPEND_CONTROL_SETTINGS)
	expect(await isTopicPodcastEpisodeVideoEnabled()).toBe(true)
})

// the pause on new podcast episodes is another switch, and leaves a published podcast episode's film alone
test("the pause on new podcast episodes leaves a new podcast episode's film on", async () => {
	spyOn(dailySpendCutoffs, "loadSpendControlSettings").mockResolvedValue({
		...DEFAULT_SPEND_CONTROL_SETTINGS,
		isPodcastEpisodeRecordingPaused: true,
	})
	expect(await isTopicPodcastEpisodeVideoEnabled()).toBe(true)
})

// a settings read that fails reads the pause as off, so the film starts and the failure is reported
test("a failed settings read pauses no film", async () => {
	// the spend control settings cannot be read
	const reportErrorSpy = quietErrorReports()
	stubConnectionPool(() => {
		throw new Error("database unreachable")
	})

	// the film starts, and the failed read is reported once
	expect(await isTopicPodcastEpisodeVideoEnabled()).toBe(true)
	expect(reportErrorSpy.mock.calls.map((reportErrorCall) => reportErrorCall.slice(1))).toEqual([
		["database", { read: dailySpendCutoffs.SPEND_CONTROL_SETTINGS_KEY }],
	])
})

// the backfill's switch turns the backfill off alone
test("a film backfill concurrency of zero starts no backfill, and a new podcast episode's film still starts", async () => {
	Bun.env.TOPIC_VIDEO_BACKFILL_CONCURRENCY = "0"
	expect(isTopicVideoBackfillEnabled()).toBe(false)
	expect(await isTopicPodcastEpisodeVideoEnabled()).toBe(true)
})

// an encode whose worker was killed must be tried again after two minutes, not after its ten-minute timeout
test("the encode heartbeats while it runs, and gets the signal that a cancelled attempt aborts", async () => {
	// an encode that lets one heartbeat interval pass, and keeps the signal it was given
	let fireHeartbeat = (): void => {}
	spyOn(globalThis, "setInterval").mockImplementation(((onInterval: () => void) => {
		fireHeartbeat = onInterval
		return 7
	}) as unknown as typeof setInterval)

	// the stubbed encode fires the captured heartbeat once
	const encodeSignals: (AbortSignal | undefined)[] = []
	const encodedPodcastEpisode = { audioKey: "audio", audioByteSize: 1, durationSeconds: 1, chapterTimes: [] }
	spyOn(podcastEpisodeAudio, "encodePodcastEpisode").mockImplementation(async (_id, _chapters, signal) => {
		encodeSignals.push(signal)
		fireHeartbeat()
		return encodedPodcastEpisode
	})

	// the activity returns the encode's result after one heartbeat, and a cancelled attempt aborts the encode's signal
	const activityEnvironment = new MockActivityEnvironment()
	let heartbeatCount = 0
	activityEnvironment.on("heartbeat", () => {
		heartbeatCount += 1
	})
	expect(await activityEnvironment.run(encodePodcastEpisode, "episode-1", [])).toEqual(encodedPodcastEpisode)
	expect(heartbeatCount).toBe(1)

	// a cancel reaches the encode
	activityEnvironment.cancel()
	expect(encodeSignals[0]?.aborted).toBe(true)
})

// the image step stores the cover, so no request draws it
test("the image step stores the podcast episode's cover after its image, and after a rejected image too", async () => {
	// an image that draws, then one that is rejected for good
	const steps: string[] = []
	const drawImageSpy = spyOn(podcastEpisodeImage, "drawPodcastEpisodeImage").mockImplementation(async () => {
		steps.push("image")
	})
	spyOn(podcastCover, "storePodcastEpisodeCovers").mockImplementation(async (podcastEpisodeId) => {
		steps.push(`cover ${podcastEpisodeId}`)
		return true
	})

	// the cover follows the image
	await drawPodcastEpisodeImageActivity("episode-1")
	expect(steps).toEqual(["image", "cover episode-1"])

	// a rejected image fails the step for good, with the cover stored over the image the podcast episode is left with
	drawImageSpy.mockRejectedValue(new podcastEpisodeImage.PodcastEpisodeImageRejectedError("the image was rejected"))
	await expect(drawPodcastEpisodeImageActivity("episode-2")).rejects.toMatchObject({ nonRetryable: true })
	expect(steps).toEqual(["image", "cover episode-1", "cover episode-2"])
})

test("an image that may be drawn again stores no cover yet, and a cover that cannot be stored never fails the step", async () => {
	// a failure that another attempt can fix leaves the cover to that attempt
	const drawImageSpy = spyOn(podcastEpisodeImage, "drawPodcastEpisodeImage").mockRejectedValue(new Error("timed out"))
	const storeCoversSpy = spyOn(podcastCover, "storePodcastEpisodeCovers").mockResolvedValue(true)
	await expect(drawPodcastEpisodeImageActivity("episode-1")).rejects.toThrow("timed out")
	expect(storeCoversSpy).not.toHaveBeenCalled()

	// a cover whose draw fails is reported, and the step still ends
	drawImageSpy.mockResolvedValue(undefined)
	storeCoversSpy.mockRejectedValue(new Error("ffmpeg exited with code 1"))
	const reportErrorSpy = quietErrorReports()
	await drawPodcastEpisodeImageActivity("episode-1")
	expect(reportErrorSpy.mock.calls.map((reportCall) => reportCall.slice(1))).toEqual([
		["podcast-episode", { podcastEpisodeId: "episode-1", step: "cover" }],
	])
})
