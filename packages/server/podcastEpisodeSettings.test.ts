// the film settings: how many films render at once, how many the backfill renders, whether the backfill runs, and how
// many generated images one film draws by default
import { afterEach, beforeEach, expect, test } from "bun:test"
import {
	generatedChapterImageLimit,
	isTopicPodcastEpisodeVideoBackfillEnabled,
	topicPodcastEpisodeVideoBackfillConcurrency,
	topicPodcastEpisodeVideoConcurrency,
} from "./podcastEpisodeSettings"
import { saveEnvSettings } from "./savedEnvSettings"

// the settings the tests change
const CONCURRENCY_SETTING = "TOPIC_PODCAST_EPISODE_VIDEO_CONCURRENCY"
const BACKFILL_CONCURRENCY_SETTING = "TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_CONCURRENCY"
const LIMIT_SETTING = "TOPIC_PODCAST_EPISODE_VIDEO_GENERATED_CHAPTER_IMAGE_LIMIT"
const TOPIC_PODCAST_EPISODE_VIDEO_SETTINGS = [CONCURRENCY_SETTING, BACKFILL_CONCURRENCY_SETTING, LIMIT_SETTING]

// each test starts with no setting set, and the settings are put back after it
const restoreEnvSettings = saveEnvSettings(TOPIC_PODCAST_EPISODE_VIDEO_SETTINGS)
beforeEach(() => {
	for (const topicPodcastEpisodeVideoSetting of TOPIC_PODCAST_EPISODE_VIDEO_SETTINGS) {
		delete Bun.env[topicPodcastEpisodeVideoSetting]
	}
})
afterEach(restoreEnvSettings)

// a setting, its reader, and the number the reader returns for each value of the setting, where undefined is unset
type ExpectSettingValuesOptions = {
	settingName: string
	readSetting: () => number
	expectedSettingValues: [string | undefined, number][]
}

// expect the number the setting's reader returns for each value of the setting in turn
function expectSettingValues({ settingName, readSetting, expectedSettingValues }: ExpectSettingValuesOptions): void {
	for (const [settingValue, expectedNumber] of expectedSettingValues) {
		// set or unset the setting, then read it
		delete Bun.env[settingName]
		if (settingValue !== undefined) {
			Bun.env[settingName] = settingValue
		}
		expect(readSetting()).toBe(expectedNumber)
	}
}

// unset, empty, and an unreadable value keep 40 images, a whole number is used, and zero turns generated images off
test("the limit defaults to 40, reads a whole number, and reads zero as off", () => {
	expectSettingValues({
		settingName: LIMIT_SETTING,
		readSetting: generatedChapterImageLimit,
		expectedSettingValues: [
			[undefined, 40],
			["", 40],
			["0", 0],
			["6", 6],
			["-1", 40],
			["forty", 40],
			["2.5", 40],
		],
	})
})

// unset, empty, and an unreadable value render one film at a time, a whole number is used, and zero turns films off
test("the film concurrency defaults to 1, reads 2 as 2, and reads zero as off", () => {
	expectSettingValues({
		settingName: CONCURRENCY_SETTING,
		readSetting: topicPodcastEpisodeVideoConcurrency,
		expectedSettingValues: [
			[undefined, 1],
			["", 1],
			["0", 0],
			["2", 2],
			["-1", 1],
			["two", 1],
		],
	})
})

// unset, empty, and an unreadable value backfill one film at a time, a whole number is used, and zero reads as zero
test("the film backfill concurrency defaults to 1, reads a whole number, and reads zero as off", () => {
	expectSettingValues({
		settingName: BACKFILL_CONCURRENCY_SETTING,
		readSetting: topicPodcastEpisodeVideoBackfillConcurrency,
		expectedSettingValues: [
			[undefined, 1],
			["", 1],
			["0", 0],
			["3", 3],
			["-1", 1],
			["three", 1],
		],
	})
})

// the backfill runs with nothing set, and a backfill concurrency of zero turns the backfill off while films stay on
test("a film backfill concurrency of zero turns the backfill off and leaves films on", () => {
	expect(isTopicPodcastEpisodeVideoBackfillEnabled()).toBe(true)
	Bun.env[BACKFILL_CONCURRENCY_SETTING] = "0"
	expect(isTopicPodcastEpisodeVideoBackfillEnabled()).toBe(false)
	expect(topicPodcastEpisodeVideoConcurrency()).toBe(1)
})

// films that are off run no backfill, whatever the backfill concurrency
test("a film concurrency of zero turns the backfill off too", () => {
	Bun.env[CONCURRENCY_SETTING] = "0"
	Bun.env[BACKFILL_CONCURRENCY_SETTING] = "3"
	expect(isTopicPodcastEpisodeVideoBackfillEnabled()).toBe(false)
})
