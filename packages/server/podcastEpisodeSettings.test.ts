// the podcast episode settings: how many of a scheduled Scan's chapters record at once, how many films render at once,
// how many the backfill renders, whether the backfill runs, and how many generated images one film draws by default
import { afterEach, beforeEach, expect, test } from "bun:test"
import {
	generatedChapterImageLimit,
	isTopicVideoBackfillEnabled,
	newTopicVideoRenderVersion,
	podcastScheduledChapterConcurrency,
	topicVideoBackfillConcurrency,
	topicVideoConcurrency,
} from "./podcastEpisodeSettings"
import { saveEnvSettings } from "./savedEnvSettings"

// the settings the tests change
const CONCURRENCY_SETTING = "TOPIC_VIDEO_CONCURRENCY"
const BACKFILL_CONCURRENCY_SETTING = "TOPIC_VIDEO_BACKFILL_CONCURRENCY"
const LIMIT_SETTING = "TOPIC_VIDEO_GENERATED_CHAPTER_IMAGE_LIMIT"
const SCHEDULED_CHAPTER_SETTING = "PODCAST_SCHEDULED_CHAPTER_CONCURRENCY"
const TOPIC_VIDEO_SETTINGS = [
	CONCURRENCY_SETTING,
	BACKFILL_CONCURRENCY_SETTING,
	LIMIT_SETTING,
	SCHEDULED_CHAPTER_SETTING,
]

// each test starts with no setting set, and the settings are put back after it
const restoreEnvSettings = saveEnvSettings(TOPIC_VIDEO_SETTINGS)
beforeEach(() => {
	for (const topicVideoSetting of TOPIC_VIDEO_SETTINGS) {
		delete Bun.env[topicVideoSetting]
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

// capacity must never shrink to nothing, so zero reads as the default, as an unset or unreadable value does
test("the scheduled chapter concurrency defaults to 32, reads zero as 32, and reads a whole number above zero", () => {
	expectSettingValues({
		settingName: SCHEDULED_CHAPTER_SETTING,
		readSetting: podcastScheduledChapterConcurrency,
		expectedSettingValues: [
			[undefined, 32],
			["", 32],
			["0", 32],
			["48", 48],
			["-1", 32],
			["many", 32],
		],
	})
})

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
		readSetting: topicVideoConcurrency,
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
		readSetting: topicVideoBackfillConcurrency,
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
	expect(isTopicVideoBackfillEnabled()).toBe(true)
	Bun.env[BACKFILL_CONCURRENCY_SETTING] = "0"
	expect(isTopicVideoBackfillEnabled()).toBe(false)
	expect(topicVideoConcurrency()).toBe(1)
})

// films that are off run no backfill, whatever the backfill concurrency
test("a film concurrency of zero turns the backfill off too", () => {
	Bun.env[CONCURRENCY_SETTING] = "0"
	Bun.env[BACKFILL_CONCURRENCY_SETTING] = "3"
	expect(isTopicVideoBackfillEnabled()).toBe(false)
})

test("stopping and resuming animated admissions changes only the version selected for the next recording", () => {
	// the setting as it was, to put back after the test
	const before = Bun.env.TOPIC_VIDEO_ANIMATED_CHAPTERS
	try {
		// with the setting unset, a new recording gets version 4
		delete Bun.env.TOPIC_VIDEO_ANIMATED_CHAPTERS
		const admitted = newTopicVideoRenderVersion()
		expect(admitted).toBe(4)
		// a recording admitted before the setting turned off keeps version 4, and the next one gets version 3
		Bun.env.TOPIC_VIDEO_ANIMATED_CHAPTERS = "false"
		expect(newTopicVideoRenderVersion()).toBe(3)
		expect(admitted).toBe(4)
		// with the setting on again, the next recording gets version 4
		Bun.env.TOPIC_VIDEO_ANIMATED_CHAPTERS = "true"
		expect(newTopicVideoRenderVersion()).toBe(4)
	} finally {
		// put the setting back
		if (before === undefined) {
			delete Bun.env.TOPIC_VIDEO_ANIMATED_CHAPTERS
		} else {
			Bun.env.TOPIC_VIDEO_ANIMATED_CHAPTERS = before
		}
	}
})
