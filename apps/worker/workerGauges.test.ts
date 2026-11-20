// worker gauge tests: each gauged queue's numbers go in the minute line under its own field, a worker in a queue group
// gauges only the queues its group polls and names the group, a backlog whose oldest task waited too long crosses its
// threshold, and a queue that cannot be read is reported without losing the rest
import { afterEach, expect, mock, setSystemTime, spyOn, test } from "bun:test"
import * as redisGauges from "@carlnotes/db/redisGauges"
import type { TaskQueueDescription } from "@carlnotes/pipeline/temporalTaskQueues"
import * as monitoring from "@carlnotes/server/monitoring"
import { readWorkerExtraGauges, toGaugedQueues } from "./workerGauges"
import * as backfillTopicVideosActivities from "./workflows/backfillTopicVideosActivities"

// put the module mocks and the clock back after each test
afterEach(() => {
	mock.restore()
	setSystemTime()
})

// a queue with one poller and nothing waiting, and a minute in which Redis is up and crossed nothing
const IDLE_QUEUE: TaskQueueDescription = { pollerCount: 1, backlogCount: 0, oldestBacklogAgeMs: null }
function spyOnRedisGauges(): void {
	spyOn(redisGauges, "readRedisExtraGauges").mockResolvedValue({
		gauges: { redis: { isConnected: true } },
		thresholdCrossings: [],
	})
}

test("a main worker gauges the two scan queues, the scheduled chapter queue, and the topic memory queue", async () => {
	spyOnRedisGauges()
	const readQueueNames: string[] = []
	const { gauges, thresholdCrossings } = await readWorkerExtraGauges({
		queueGroup: "main",
		readTaskQueue: async (taskQueue) => {
			readQueueNames.push(taskQueue)
			return { ...IDLE_QUEUE, backlogCount: taskQueue === "episode-scheduled-chapters" ? 7 : 0 }
		},
	})

	// the line names the queue group, with each queue's numbers under its field, beside Redis, and nothing crossed
	expect(readQueueNames).toEqual([
		"topic-scans",
		"topic-scans-scheduled",
		"episode-scheduled-chapters",
		"episode-encodes",
		"topic-memories",
	])
	expect(gauges).toEqual({
		queueGroup: "main",
		scanQueue: IDLE_QUEUE,
		scheduledScanQueue: IDLE_QUEUE,
		scheduledChapterQueue: { ...IDLE_QUEUE, backlogCount: 7 },
		podcastEncodeQueue: IDLE_QUEUE,
		topicMemoryQueue: IDLE_QUEUE,
		redis: { isConnected: true },
	})
	expect(thresholdCrossings).toEqual([])
})

// a film replica's lines are told apart from a main worker's, and it reads no queue it does not poll
test("a film replica gauges the film queues alone, and a film that waited over an hour crosses its threshold", async () => {
	spyOnRedisGauges()
	const waitingQueue = { pollerCount: 1, backlogCount: 5, oldestBacklogAgeMs: 61 * 60 * 1000 }
	const readQueueNames: string[] = []
	const { gauges, thresholdCrossings } = await readWorkerExtraGauges({
		queueGroup: "films",
		readTaskQueue: async (taskQueue) => {
			readQueueNames.push(taskQueue)
			return waitingQueue
		},
		readTopicVideosLeftCount: async () => 66,
	})

	// the numbers of the film queue and of the films' short writes, the films left to render, and no scan queue's
	expect(readQueueNames).toEqual(["episode-videos", "episode-video-writes"])
	expect(gauges).toEqual({
		queueGroup: "films",
		topicVideoQueue: waitingQueue,
		topicVideoWriteQueue: waitingQueue,
		topicVideosLeftCount: 66,
		redis: { isConnected: true },
	})

	// a render that waited an hour is reported, and so is a short write that waited fifteen minutes for a main worker
	expect(thresholdCrossings.map((thresholdCrossing) => thresholdCrossing.condition)).toEqual([
		"topic-video-backlog",
		"topic-video-write-backlog",
	])
})

test("a worker with no queue group hosts every Worker and gauges every queue", () => {
	const allQueueNames = toGaugedQueues("all").map((gaugedQueue) => gaugedQueue.taskQueue)
	expect(allQueueNames).toEqual([
		"topic-scans",
		"topic-scans-scheduled",
		"episode-scheduled-chapters",
		"episode-encodes",
		"topic-memories",
		"episode-videos",
		"episode-video-writes",
	])
})

// a scheduled chapter may wait six hours in all, so an hour's wait for a slot is reported long before one is left out
test("a scheduled chapter that waited over an hour for a slot crosses its threshold", async () => {
	spyOnRedisGauges()
	const toChapterQueueCrossings = async (oldestBacklogAgeMs: number | null): Promise<unknown[]> => {
		const { thresholdCrossings } = await readWorkerExtraGauges({
			queueGroup: "main",
			readTaskQueue: async (taskQueue) =>
				taskQueue === "episode-scheduled-chapters"
					? { pollerCount: 2, backlogCount: 40, oldestBacklogAgeMs }
					: IDLE_QUEUE,
		})
		return thresholdCrossings
	}

	// an hour exactly, and a server that cannot say how long, cross nothing
	expect(await toChapterQueueCrossings(60 * 60 * 1000)).toEqual([])
	expect(await toChapterQueueCrossings(null)).toEqual([])
	expect(await toChapterQueueCrossings(61 * 60 * 1000)).toEqual([
		{
			condition: "scheduled-chapter-backlog",
			message: "a scheduled podcast chapter waited over an hour for a slot",
			values: { backlogCount: 40, oldestBacklogAgeMs: 61 * 60 * 1000 },
		},
	])
})

// a Scan's reader opens its topic memories next, so their update is held to the same wait as a Scan
test("a topic memory update that waited over fifteen minutes for a slot crosses its threshold", async () => {
	spyOnRedisGauges()
	const toMemoryQueueCrossings = async (oldestBacklogAgeMs: number | null): Promise<unknown[]> => {
		const { thresholdCrossings } = await readWorkerExtraGauges({
			queueGroup: "main",
			readTaskQueue: async (taskQueue) =>
				taskQueue === "topic-memories" ? { pollerCount: 2, backlogCount: 900, oldestBacklogAgeMs } : IDLE_QUEUE,
		})
		return thresholdCrossings
	}

	// fifteen minutes exactly, and a server that cannot say how long, cross nothing
	expect(await toMemoryQueueCrossings(15 * 60 * 1000)).toEqual([])
	expect(await toMemoryQueueCrossings(null)).toEqual([])
	expect(await toMemoryQueueCrossings(16 * 60 * 1000)).toEqual([
		{
			condition: "topic-memory-backlog",
			message: "a topic memory update waited over 15 minutes for a slot",
			values: { backlogCount: 900, oldestBacklogAgeMs: 16 * 60 * 1000 },
		},
	])
})

test("a queue that cannot be read is reported with its name, and the other queues and Redis still show", async () => {
	spyOnRedisGauges()
	spyOn(console, "error").mockImplementation(() => {})
	const reportSpy = spyOn(monitoring, "reportError").mockImplementation(() => undefined)

	// the scan queue's read fails, and the scheduled chapter queue's succeeds
	const { gauges } = await readWorkerExtraGauges({
		queueGroup: "main",
		readTaskQueue: async (taskQueue) => {
			if (taskQueue === "topic-scans") {
				throw new Error("temporal unreachable")
			}
			return IDLE_QUEUE
		},
	})

	// the unread queue shows as null, and its report names it
	expect(gauges).toEqual({
		queueGroup: "main",
		scanQueue: null,
		scheduledScanQueue: IDLE_QUEUE,
		scheduledChapterQueue: IDLE_QUEUE,
		podcastEncodeQueue: IDLE_QUEUE,
		topicMemoryQueue: IDLE_QUEUE,
		redis: { isConnected: true },
	})
	expect(reportSpy).toHaveBeenCalledTimes(1)
	expect(reportSpy.mock.calls[0]?.slice(1)).toEqual(["worker", { taskQueue: "topic-scans" }])
})

test("every gauged queue has a field of its own", () => {
	const fields = toGaugedQueues("all").map((gaugedQueue) => gaugedQueue.field)
	expect(new Set(fields).size).toBe(fields.length)
})

// the films left are one count beside the queues, and a failed count never costs the line its other numbers
test("a failed count of the films left shows as null beside the film queue's numbers", async () => {
	spyOnRedisGauges()
	spyOn(console, "error").mockImplementation(() => {})
	const { gauges } = await readWorkerExtraGauges({
		queueGroup: "films",
		readTaskQueue: async () => IDLE_QUEUE,
		readTopicVideosLeftCount: () => Promise.reject(new Error("the database is unreachable")),
	})
	expect(gauges).toMatchObject({ topicVideoQueue: IDLE_QUEUE, topicVideosLeftCount: null })
})

// the count is a pass over every Topic, so each film replica counts again only every ten minutes
test("a film replica keeps its count of the films left for ten minutes", async () => {
	spyOnRedisGauges()
	const countTopicVideosLeft = spyOn(backfillTopicVideosActivities, "countTopicVideosLeft").mockResolvedValue(66)
	const readFilmGauges = async (): Promise<unknown> =>
		(await readWorkerExtraGauges({ queueGroup: "films", readTaskQueue: async () => IDLE_QUEUE })).gauges

	// a minute line, and another nine minutes later, count once
	setSystemTime(new Date("2026-11-20T12:00:00Z"))
	expect(await readFilmGauges()).toMatchObject({ topicVideosLeftCount: 66 })
	countTopicVideosLeft.mockResolvedValue(65)
	setSystemTime(new Date("2026-11-20T12:09:00Z"))
	expect(await readFilmGauges()).toMatchObject({ topicVideosLeftCount: 66 })
	expect(countTopicVideosLeft).toHaveBeenCalledTimes(1)

	// the line ten minutes after the count counts again
	setSystemTime(new Date("2026-11-20T12:10:00Z"))
	expect(await readFilmGauges()).toMatchObject({ topicVideosLeftCount: 65 })
	expect(countTopicVideosLeft).toHaveBeenCalledTimes(2)
})
