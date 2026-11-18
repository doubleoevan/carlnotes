// what the worker starts for films at each film setting: the Worker on the film queue, and the film backfill
import { afterEach, beforeEach, expect, test } from "bun:test"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { readTopicVideoStartup } from "./temporal"
import { readWorkerQueueGroup } from "./workerQueueGroup"

// the film settings the tests change
const CONCURRENCY_SETTING = "TOPIC_VIDEO_CONCURRENCY"
const BACKFILL_CONCURRENCY_SETTING = "TOPIC_VIDEO_BACKFILL_CONCURRENCY"
const TOPIC_VIDEO_SETTINGS = [CONCURRENCY_SETTING, BACKFILL_CONCURRENCY_SETTING, "WORKER_QUEUE_GROUP", "WORKER_ROLE"]

// each test starts with no film setting set, and the settings are put back after it
const restoreEnvSettings = saveEnvSettings(TOPIC_VIDEO_SETTINGS)
beforeEach(() => {
	for (const topicVideoSetting of TOPIC_VIDEO_SETTINGS) {
		delete Bun.env[topicVideoSetting]
	}
})
afterEach(restoreEnvSettings)

test("with no film setting set the worker polls the film queue and starts the film backfill", () => {
	expect(readTopicVideoStartup()).toEqual({
		isTopicVideoQueuePolled: true,
		isTopicVideoBackfillStarted: true,
	})
})

// the backfill's switch turns the backfill off alone, so a new podcast episode's film still has a Worker to render it
test("a film backfill concurrency of zero starts no film backfill, and the worker still polls the film queue", () => {
	Bun.env[BACKFILL_CONCURRENCY_SETTING] = "0"
	expect(readTopicVideoStartup()).toEqual({
		isTopicVideoQueuePolled: true,
		isTopicVideoBackfillStarted: false,
	})
})

// films that are off start nothing, whatever the backfill concurrency
test("a film concurrency of zero polls no film queue and starts no film backfill", () => {
	Bun.env[CONCURRENCY_SETTING] = "0"
	Bun.env[BACKFILL_CONCURRENCY_SETTING] = "3"
	expect(readTopicVideoStartup()).toEqual({
		isTopicVideoQueuePolled: false,
		isTopicVideoBackfillStarted: false,
	})
})

test("the main queue group leaves film polling to the isolated films queue group", () => {
	Bun.env.WORKER_QUEUE_GROUP = "main"
	expect(readTopicVideoStartup()).toEqual({ isTopicVideoQueuePolled: false, isTopicVideoBackfillStarted: false })
	Bun.env.WORKER_QUEUE_GROUP = "films"
	expect(readTopicVideoStartup().isTopicVideoQueuePolled).toBe(true)
	Bun.env.WORKER_ROLE = "main"
	expect(readWorkerQueueGroup()).toBe("films")
	delete Bun.env.WORKER_QUEUE_GROUP
	expect(readWorkerQueueGroup()).toBe("main")
	expect(() => readWorkerQueueGroup("film")).toThrow()
})
