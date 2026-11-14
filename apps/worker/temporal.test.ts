// what the worker starts for films at each film setting: the Worker on the film queue, and the film backfill
import { afterEach, beforeEach, expect, test } from "bun:test"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { readTopicPodcastEpisodeVideoStartup } from "./temporal"

// the film settings the tests change
const CONCURRENCY_SETTING = "TOPIC_PODCAST_EPISODE_VIDEO_CONCURRENCY"
const BACKFILL_CONCURRENCY_SETTING = "TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_CONCURRENCY"
const TOPIC_PODCAST_EPISODE_VIDEO_SETTINGS = [CONCURRENCY_SETTING, BACKFILL_CONCURRENCY_SETTING]

// each test starts with no film setting set, and the settings are put back after it
const restoreEnvSettings = saveEnvSettings(TOPIC_PODCAST_EPISODE_VIDEO_SETTINGS)
beforeEach(() => {
	for (const topicPodcastEpisodeVideoSetting of TOPIC_PODCAST_EPISODE_VIDEO_SETTINGS) {
		delete Bun.env[topicPodcastEpisodeVideoSetting]
	}
})
afterEach(restoreEnvSettings)

test("with no film setting set the worker polls the film queue and starts the film backfill", () => {
	expect(readTopicPodcastEpisodeVideoStartup()).toEqual({
		isTopicPodcastEpisodeVideoQueuePolled: true,
		isTopicPodcastEpisodeVideoBackfillStarted: true,
	})
})

// the backfill's switch turns the backfill off alone, so a new podcast episode's film still has a Worker to render it
test("a film backfill concurrency of zero starts no film backfill, and the worker still polls the film queue", () => {
	Bun.env[BACKFILL_CONCURRENCY_SETTING] = "0"
	expect(readTopicPodcastEpisodeVideoStartup()).toEqual({
		isTopicPodcastEpisodeVideoQueuePolled: true,
		isTopicPodcastEpisodeVideoBackfillStarted: false,
	})
})

// films that are off start nothing, whatever the backfill concurrency
test("a film concurrency of zero polls no film queue and starts no film backfill", () => {
	Bun.env[CONCURRENCY_SETTING] = "0"
	Bun.env[BACKFILL_CONCURRENCY_SETTING] = "3"
	expect(readTopicPodcastEpisodeVideoStartup()).toEqual({
		isTopicPodcastEpisodeVideoQueuePolled: false,
		isTopicPodcastEpisodeVideoBackfillStarted: false,
	})
})
