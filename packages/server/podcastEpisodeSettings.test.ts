// the imagined image settings: the seconds a chapter runs before it may get one, and how many one film gets
import { afterEach, expect, test } from "bun:test"
import { imaginedChapterImageLimit, imaginedChapterImageMinimumSeconds } from "./podcastEpisodeSettings"
import { saveEnvSettings } from "./savedEnvSettings"

// the two settings, put back after each test
const MINIMUM_SECONDS_SETTING = "TOPIC_PODCAST_EPISODE_VIDEO_IMAGINED_CHAPTER_IMAGE_MINIMUM_SECONDS"
const LIMIT_SETTING = "TOPIC_PODCAST_EPISODE_VIDEO_IMAGINED_CHAPTER_IMAGE_LIMIT"
const restoreEnvSettings = saveEnvSettings([MINIMUM_SECONDS_SETTING, LIMIT_SETTING])
afterEach(restoreEnvSettings)

// unset, empty, zero, and an unreadable value keep 90 seconds, and a whole number above zero is used
test("the minimum seconds default to 90 and read a whole number above zero", () => {
	const expectedSeconds: [string | undefined, number][] = [
		[undefined, 90],
		["", 90],
		["120", 120],
		["0", 90],
		["-30", 90],
		["ninety", 90],
		["45.5", 90],
	]
	for (const [value, expectedValue] of expectedSeconds) {
		// set or unset the value, then read it
		delete Bun.env[MINIMUM_SECONDS_SETTING]
		if (value !== undefined) {
			Bun.env[MINIMUM_SECONDS_SETTING] = value
		}
		expect(imaginedChapterImageMinimumSeconds()).toBe(expectedValue)
	}
})

// unset, empty, and an unreadable value keep 4 images, a whole number is used, and zero turns imagined images off
test("the limit defaults to 4, reads a whole number, and reads zero as off", () => {
	const expectedLimits: [string | undefined, number][] = [
		[undefined, 4],
		["", 4],
		["0", 0],
		["6", 6],
		["-1", 4],
		["four", 4],
		["2.5", 4],
	]
	for (const [value, expectedValue] of expectedLimits) {
		// set or unset the value, then read it
		delete Bun.env[LIMIT_SETTING]
		if (value !== undefined) {
			Bun.env[LIMIT_SETTING] = value
		}
		expect(imaginedChapterImageLimit()).toBe(expectedValue)
	}
})
