// the topic memory concurrency setting: how many updates one worker replica runs at once
import { afterEach, expect, test } from "bun:test"
import { saveEnvSettings } from "./savedEnvSettings"
import { topicMemoryConcurrency } from "./topicMemorySettings"

// the setting, put back after each test
const restoreEnvSettings = saveEnvSettings(["TOPIC_MEMORY_CONCURRENCY"])
afterEach(restoreEnvSettings)

// capacity must never shrink to nothing, so zero reads as the default, as an unset or unreadable value does
test("the topic memory concurrency defaults to 2, reads zero as 2, and reads a whole number above zero", () => {
	// unset, empty, and zero read as the default
	delete Bun.env.TOPIC_MEMORY_CONCURRENCY
	expect(topicMemoryConcurrency()).toBe(2)
	for (const settingValue of ["", "0", "-1", "many"]) {
		Bun.env.TOPIC_MEMORY_CONCURRENCY = settingValue
		expect(topicMemoryConcurrency()).toBe(2)
	}

	// a whole number above zero is used as it is
	Bun.env.TOPIC_MEMORY_CONCURRENCY = "8"
	expect(topicMemoryConcurrency()).toBe(8)
})
