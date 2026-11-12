// the generated image setting: how many one film draws
import { afterEach, expect, test } from "bun:test"
import { generatedChapterImageLimit } from "./podcastEpisodeSettings"
import { saveEnvSettings } from "./savedEnvSettings"

// the setting, put back after each test
const LIMIT_SETTING = "TOPIC_PODCAST_EPISODE_VIDEO_GENERATED_CHAPTER_IMAGE_LIMIT"
const restoreEnvSettings = saveEnvSettings([LIMIT_SETTING])
afterEach(restoreEnvSettings)

// unset, empty, and an unreadable value keep 40 images, a whole number is used, and zero turns generated images off
test("the limit defaults to 40, reads a whole number, and reads zero as off", () => {
	const expectedLimits: [string | undefined, number][] = [
		[undefined, 40],
		["", 40],
		["0", 0],
		["6", 6],
		["-1", 40],
		["forty", 40],
		["2.5", 40],
	]
	for (const [value, expectedValue] of expectedLimits) {
		// set or unset the value, then read it
		delete Bun.env[LIMIT_SETTING]
		if (value !== undefined) {
			Bun.env[LIMIT_SETTING] = value
		}
		expect(generatedChapterImageLimit()).toBe(expectedValue)
	}
})
