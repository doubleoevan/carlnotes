// the film switch a new podcast episode reads before it starts its film: the film concurrency, the pause on new films,
// and a spend control settings read that fails
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as dailySpendCutoffs from "@carlnotes/db/dailySpendCutoffs"
import { DEFAULT_SPEND_CONTROL_SETTINGS } from "@carlnotes/db/dailySpendCutoffTestFixtures"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { quietErrorReports } from "@carlnotes/server/monitoringTestFixtures"
import { isTopicPodcastEpisodeVideoBackfillEnabled } from "@carlnotes/server/podcastEpisodeSettings"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { isTopicPodcastEpisodeVideoEnabled } from "./recordPodcastEpisodeActivities"

// the film settings the tests change
const TOPIC_PODCAST_EPISODE_VIDEO_SETTINGS = [
	"TOPIC_PODCAST_EPISODE_VIDEO_CONCURRENCY",
	"TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_CONCURRENCY",
]
const restoreEnvSettings = saveEnvSettings(TOPIC_PODCAST_EPISODE_VIDEO_SETTINGS)

// each test starts with no film setting set, an empty in-memory Redis, and an empty spend control settings table
beforeEach(() => {
	for (const topicPodcastEpisodeVideoSetting of TOPIC_PODCAST_EPISODE_VIDEO_SETTINGS) {
		delete Bun.env[topicPodcastEpisodeVideoSetting]
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
	Bun.env.TOPIC_PODCAST_EPISODE_VIDEO_CONCURRENCY = "0"
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
		isTopicPodcastEpisodeVideoRenderingPaused: true,
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
	Bun.env.TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_CONCURRENCY = "0"
	expect(isTopicPodcastEpisodeVideoBackfillEnabled()).toBe(false)
	expect(await isTopicPodcastEpisodeVideoEnabled()).toBe(true)
})
