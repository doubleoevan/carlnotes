// scan queue read tests: the queue report, the backlog crossing, the dispatch counts that each queue sizes, the scan
// dispatch limit, and the film queue report
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as quotas from "@carlnotes/db/quotas"
import * as scan from "@carlnotes/pipeline/scan"
import { SCAN_BACKLOG_CROSSING } from "@carlnotes/pipeline/scanWorkflowClient"
import { type TaskQueueDescription, toBacklogCrossing } from "@carlnotes/pipeline/temporalTaskQueues"
import * as monitoring from "@carlnotes/server/monitoring"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { readScanDispatchCounts, reportScanQueue, reportTopicVideoQueue, toDispatchableScanCount } from "./scanQueue"
import { startScheduledTestPage, toScheduledTopic } from "./scheduledTopicTestFixtures"

// each test starts with the scan dispatch limit unset
const restoreEnvSettings = saveEnvSettings(["SCAN_DISPATCH_LIMIT", "TOPIC_VIDEO_CONCURRENCY"])
beforeEach(() => {
	delete Bun.env.SCAN_DISPATCH_LIMIT
	delete Bun.env.TOPIC_VIDEO_CONCURRENCY
})

// put each spied function, the connection pool's own query, and the scan dispatch limit back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
	restoreEnvSettings()
})

// a Scan queue with a worker polling it and nothing waiting
const HEALTHY_SCAN_QUEUE = { pollerCount: 1, backlogCount: 0, oldestBacklogAgeMs: 0 }

// the sweep reports a queue nothing polls, and leaves a backlog's wait to the worker's minute line
test("reportScanQueue reports a queue nothing polls and never a backlog", async () => {
	const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
	spyOn(monitoring, "reportError").mockImplementation(() => {})
	await reportScanQueue({ readScanQueue: async () => HEALTHY_SCAN_QUEUE })
	expect(consoleErrorSpy).not.toHaveBeenCalled()

	// a queue nothing polls
	await reportScanQueue({ readScanQueue: async () => ({ ...HEALTHY_SCAN_QUEUE, pollerCount: 0 }) })
	expect(String(consoleErrorSpy.mock.calls.at(-1)?.[0])).toContain(
		"no temporal worker is polling the topic-scans queue",
	)

	// a queue whose oldest Scan has waited 20 minutes, on either scan queue
	consoleErrorSpy.mockClear()
	const waitingScanQueue = { pollerCount: 1, backlogCount: 12, oldestBacklogAgeMs: 20 * 60 * 1000 }
	await reportScanQueue({ readScanQueue: async () => waitingScanQueue })
	await reportScanQueue({ taskQueue: "topic-scans-scheduled", readScanQueue: async () => waitingScanQueue })
	expect(consoleErrorSpy).not.toHaveBeenCalled()
})

// a describe that fails is logged, reported with the queue's name, and reads as no description, and the sweep goes on
test("reportScanQueue reports a queue it could not read and never fails the sweep", async () => {
	const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const failedRead = reportScanQueue({ readScanQueue: () => Promise.reject(new Error("temporal unreachable")) })
	await expect(failedRead).resolves.toBeNull()
	expect(consoleErrorSpy.mock.calls[0]?.[0]).toBe("could not read the topic-scans task queue")

	// one report in the scheduled scan stage, with the same message on every sweep and the queue it could not read
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	const [reportedError, stage, extra] = reportErrorSpy.mock.calls[0] ?? []
	expect((reportedError as Error).message).toBe("the sweep could not read a scan task queue")
	expect([stage, extra]).toEqual(["scheduled-scan", { taskQueue: "topic-scans" }])
})

// an older server gives a depth and no age, so its backlog is never reported as past the limit
test("the scan backlog crossing needs a known age past 15 minutes", () => {
	const toScanBacklogCrossing = (oldestBacklogAgeMs: number | null): monitoring.ThresholdCrossing | null =>
		toBacklogCrossing({
			taskQueueDescription: { pollerCount: 1, backlogCount: 40, oldestBacklogAgeMs },
			...SCAN_BACKLOG_CROSSING,
		})
	expect(toScanBacklogCrossing(null)).toBeNull()
	expect(toScanBacklogCrossing(15 * 60 * 1000)).toBeNull()
	expect(toScanBacklogCrossing(16 * 60 * 1000)?.condition).toBe("scan-backlog")
})

// a person's first or manual Scan waits on the Scan queue, and a scheduled one on its own
test("a backlog of first Scans does not slow the scheduled Scans, and each queue sizes its own starts", async () => {
	// 300 first Scans wait on the Scan queue, and the scheduled queue is empty
	const backlogCountByQueue: Record<string, number> = { "topic-scans": 300, "topic-scans-scheduled": 0 }
	const readTaskQueue = async (taskQueue: string): Promise<typeof HEALTHY_SCAN_QUEUE> => ({
		...HEALTHY_SCAN_QUEUE,
		backlogCount: backlogCountByQueue[taskQueue] ?? 0,
	})
	expect(await readScanDispatchCounts(readTaskQueue)).toEqual({
		isScanQueueRead: true,
		dispatchableScanCount: 0,
		dispatchableScheduledScanCount: 100,
	})

	// 80 scheduled Scans wait on their own queue, which leaves 20 of the limit, whatever the Scan queue holds
	backlogCountByQueue["topic-scans"] = 0
	backlogCountByQueue["topic-scans-scheduled"] = 80
	expect(await readScanDispatchCounts(readTaskQueue)).toEqual({
		isScanQueueRead: true,
		dispatchableScanCount: 100,
		dispatchableScheduledScanCount: 20,
	})
})

test("a scheduled queue that cannot be read starts no scheduled Scan, and is reported", async () => {
	// the Scan queue reads, and the scheduled queue's read fails
	spyOn(console, "error").mockImplementation(() => {})
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const scanDispatchCounts = await readScanDispatchCounts(async (taskQueue) => {
		if (taskQueue === "topic-scans-scheduled") {
			throw new Error("temporal unreachable")
		}
		return HEALTHY_SCAN_QUEUE
	})

	// manual Scans keep their count, and the scheduled count is unknown
	expect(scanDispatchCounts).toEqual({
		isScanQueueRead: true,
		dispatchableScanCount: 100,
		dispatchableScheduledScanCount: null,
	})
	expect(reportErrorSpy.mock.calls.map((reportCall) => reportCall[2])).toEqual([{ taskQueue: "topic-scans-scheduled" }])

	// a Scan queue that cannot be read is one report, and the scheduled queue behind the same server is not read
	reportErrorSpy.mockClear()
	const readQueueNames: string[] = []
	const unreachableCounts = await readScanDispatchCounts(async (taskQueue) => {
		readQueueNames.push(taskQueue)
		throw new Error("temporal unreachable")
	})
	expect(unreachableCounts).toEqual({
		isScanQueueRead: false,
		dispatchableScanCount: 100,
		dispatchableScheduledScanCount: null,
	})
	expect(readQueueNames).toEqual(["topic-scans"])
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
})

// the dispatchable scan count is the limit minus the backlog, never below zero, and the whole limit for an unread queue
test("toDispatchableScanCount subtracts the backlog from the limit and keeps the limit for an unread queue", () => {
	expect(toDispatchableScanCount({ pollerCount: 2, backlogCount: 30, oldestBacklogAgeMs: null })).toBe(70)
	expect(toDispatchableScanCount({ pollerCount: 2, backlogCount: 500, oldestBacklogAgeMs: null })).toBe(0)
	expect(toDispatchableScanCount(null)).toBe(100)
})

// the limit is read on every sweep, so a set value replaces the default and zero leaves nothing to start
test("toDispatchableScanCount reads the scan dispatch limit that is set, and zero leaves no Scan to start", () => {
	// a limit of 40 with a backlog of 30 leaves 10
	Bun.env.SCAN_DISPATCH_LIMIT = "40"
	expect(toDispatchableScanCount({ pollerCount: 2, backlogCount: 30, oldestBacklogAgeMs: null })).toBe(10)

	// a limit of zero leaves none, with an empty queue and with an unread one
	Bun.env.SCAN_DISPATCH_LIMIT = "0"
	expect(toDispatchableScanCount(HEALTHY_SCAN_QUEUE)).toBe(0)
	expect(toDispatchableScanCount(null)).toBe(0)
})

// a scan dispatch limit of zero starts no scheduled Scan and writes no Scan row, so every Topic stays scheduled
test("a scan dispatch limit of zero starts no scheduled Scan, and every Topic stays scheduled", async () => {
	// 40 scheduled Topics of one owner with scans left today and a spent key budget, and an empty scan queue
	Bun.env.SCAN_DISPATCH_LIMIT = "0"
	const scheduledTopics = Array.from({ length: 40 }, (_, i) => toScheduledTopic(`topic-${i}`))
	spyOn(quotas, "scansRemainingToday").mockResolvedValue(1000)
	const startTopicScanSpy = spyOn(scan, "startTopicScan").mockResolvedValue({ status: "running" })
	const sentQueries = stubConnectionPool()

	// start the scheduled Topics' Scans as the sweep does
	const topicSweepSummary = await startScheduledTestPage({
		scheduledTopics,
		dailyTopicIdsByOwner: new Map(),
		budgetExhaustedOwnerIds: new Set(["owner-1"]),
		dispatchableScanCount: toDispatchableScanCount(HEALTHY_SCAN_QUEUE),
	})

	// no Scan started, every Topic is left for a later sweep, and no Scan row was read or written
	expect(startTopicScanSpy).not.toHaveBeenCalled()
	expect(topicSweepSummary).toMatchObject({ scheduled: 40, started: 0, skippedOverBacklog: 40, skippedOverBudget: 0 })
	expect(sentQueries).toEqual([])
})

// a start against a queue with no poller succeeds, so a film would wait there with no error
test("the sweep reports a film queue that nothing polls, unless films are off", async () => {
	spyOn(console, "error").mockImplementation(() => {})
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const readQueueNames: string[] = []
	const readUnpolledQueue = async (taskQueue: string): Promise<TaskQueueDescription> => {
		readQueueNames.push(taskQueue)
		return { pollerCount: 0, backlogCount: 2, oldestBacklogAgeMs: null }
	}

	// the film queue is read by its name and reported in the film stage
	await reportTopicVideoQueue(readUnpolledQueue)
	expect(readQueueNames).toEqual(["episode-videos"])
	expect(reportErrorSpy.mock.calls.map((reportCall) => reportCall.slice(1))).toEqual([
		["topic-video", { taskQueue: "episode-videos" }],
	])

	// a polled queue is quiet, a failed read is only logged, and films that are off are not read at all
	await reportTopicVideoQueue(async () => ({ pollerCount: 1, backlogCount: 0, oldestBacklogAgeMs: null }))
	await reportTopicVideoQueue(() => Promise.reject(new Error("temporal unreachable")))
	Bun.env.TOPIC_VIDEO_CONCURRENCY = "0"
	await reportTopicVideoQueue(readUnpolledQueue)
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	expect(readQueueNames).toHaveLength(1)
})
