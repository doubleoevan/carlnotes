// what the worker starts for films at each film setting: the Worker on the film queue, and the film backfill, and how
// many activities the Workers on some queues have in progress
import { afterEach, beforeEach, expect, test } from "bun:test"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { toInFlightActivityCount } from "./temporal"
import { readTopicVideoStartup } from "./temporalWorkers"
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

	// the queue group setting wins over the older role setting, which still names a group by itself
	Bun.env.WORKER_ROLE = "main"
	expect(readWorkerQueueGroup()).toBe("films")
	delete Bun.env.WORKER_QUEUE_GROUP
	expect(readWorkerQueueGroup()).toBe("main")
	expect(() => readWorkerQueueGroup("film")).toThrow()
})

// a render that waits for a film slot has already been taken by its Worker, so it counts as demand
test("the activities in progress are summed over the Workers on the asked queues alone", () => {
	const toWorker = (taskQueue: string, numInFlightActivities: number): never =>
		({ options: { taskQueue }, getStatus: () => ({ numInFlightActivities }) }) as never
	const workers = [toWorker("episode-videos", 2), toWorker("episode-video-backfill", 1), toWorker("topic-scans", 5)]
	expect(toInFlightActivityCount(workers, ["episode-videos", "episode-video-backfill"])).toBe(3)
	expect(toInFlightActivityCount(workers, ["topic-scans"])).toBe(5)
	expect(toInFlightActivityCount(workers, ["episode-video-rebuilds"])).toBe(0)
})
