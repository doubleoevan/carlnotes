// the worker's demand gauges: one replica's work in progress plus its share of the queue's backlog, as Prometheus text
// for each queue group, served at /metrics
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as monitoring from "@carlnotes/server/monitoring"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { readDemandGaugesText, serveDemandGauges, toDemand, toDemandGauges } from "./workerDemand"

// put the port setting and the spies back after each test
const restoreEnvSettings = saveEnvSettings(["WORKER_METRICS_PORT"])
afterEach(() => {
	restoreEnvSettings()
	mock.restore()
})

test("a replica's demand is what it runs plus its share of the backlog", () => {
	// two renders while four films wait behind one poller, then behind two, then an idle replica
	expect(toDemand(2, [{ pollerCount: 1, backlogCount: 4, oldestBacklogAgeMs: null }])).toBe(6)
	expect(toDemand(2, [{ pollerCount: 2, backlogCount: 4, oldestBacklogAgeMs: null }])).toBe(4)
	expect(toDemand(0, [{ pollerCount: 1, backlogCount: 0, oldestBacklogAgeMs: null }])).toBe(0)

	// a queue nothing polls still counts what waits in it
	expect(toDemand(0, [{ pollerCount: 0, backlogCount: 3, oldestBacklogAgeMs: null }])).toBe(3)

	// two queues each share their own backlog among their own pollers
	const scanQueue = { pollerCount: 2, backlogCount: 10, oldestBacklogAgeMs: null }
	const scheduledScanQueue = { pollerCount: 4, backlogCount: 40, oldestBacklogAgeMs: null }
	expect(toDemand(3, [scanQueue, scheduledScanQueue])).toBe(18)
})

test("a film replica serves film demand, a main worker scan demand, and a worker with no queue group both", async () => {
	// three activities in progress on whatever queues are asked about, and five tasks waiting behind one poller
	const readQueueNames: string[] = []
	const countedQueues: string[][] = []
	const readDemandGauges = (queueGroup: "films" | "main" | "all"): Promise<string> =>
		readDemandGaugesText({
			queueGroup,
			readInFlightCount: (taskQueues) => {
				countedQueues.push(taskQueues)
				return 3
			},
			readTaskQueue: async (taskQueue) => {
				readQueueNames.push(taskQueue)
				return { pollerCount: 1, backlogCount: 5, oldestBacklogAgeMs: null }
			},
		})

	// film demand counts the film Worker's and the backfill Worker's renders, and reads the film queue's backlog
	const filmText = await readDemandGauges("films")
	expect(filmText).toContain("# TYPE carlnotes_film_demand gauge\ncarlnotes_film_demand 8\n")
	expect(filmText).not.toContain("carlnotes_scan_demand")
	expect([readQueueNames, countedQueues]).toEqual([["episode-videos"], [["episode-videos", "episode-video-backfill"]]])

	// scan demand alone from a main worker, over the Scan queue and the scheduled Scans' queue: three stages in
	// progress on the two, and five waiting on each
	readQueueNames.length = 0
	countedQueues.length = 0
	expect(await readDemandGauges("main")).toContain("carlnotes_scan_demand 13\n")
	const scanQueueNames = ["topic-scans", "topic-scans-scheduled"]
	expect([readQueueNames, countedQueues]).toEqual([scanQueueNames, [scanQueueNames]])

	// both gauges with no queue group
	expect(toDemandGauges("all").map((demandGauge) => demandGauge.name)).toEqual([
		"carlnotes_scan_demand",
		"carlnotes_film_demand",
	])
})

test("the gauges are served at /metrics, and a queue that cannot be read gives the scrape no number", async () => {
	// a film replica on a port of its own, whose queue read fails on the second scrape
	Bun.env.WORKER_METRICS_PORT = "39464"
	spyOn(console, "error").mockImplementation(() => {})
	let isQueueReadable = true
	const stopServing = serveDemandGauges(
		{
			queueGroup: "films",
			readInFlightCount: () => 1,
			readTaskQueue: async () => {
				if (!isQueueReadable) {
					throw new Error("temporal unreachable")
				}
				return { pollerCount: 1, backlogCount: 0, oldestBacklogAgeMs: null }
			},
		},
		0,
	)

	// the scrape reads the gauge, any other path is not found, and a failed read is a 503
	try {
		const scrape = await fetch("http://localhost:39464/metrics")
		expect(scrape.headers.get("content-type")).toStartWith("text/plain")
		expect(await scrape.text()).toContain("carlnotes_film_demand 1\n")
		expect((await fetch("http://localhost:39464/")).status).toBe(404)

		// Temporal goes away
		isQueueReadable = false
		expect((await fetch("http://localhost:39464/metrics")).status).toBe(503)
	} finally {
		stopServing()
	}
})

test("scrapes within the cache time share one read of Temporal", async () => {
	// a main replica on a port of its own that counts its queue reads
	Bun.env.WORKER_METRICS_PORT = "39465"
	let queueReadCount = 0
	const stopServing = serveDemandGauges({
		queueGroup: "main",
		readInFlightCount: () => 0,
		readTaskQueue: async () => {
			queueReadCount++
			return { pollerCount: 1, backlogCount: 0, oldestBacklogAgeMs: null }
		},
	})

	// three scrapes at once read each scan queue once
	try {
		const scrapes = await Promise.all([1, 2, 3].map(() => fetch("http://localhost:39465/metrics")))
		expect(scrapes.map((scrape) => scrape.status)).toEqual([200, 200, 200])
		expect(queueReadCount).toBe(2)
	} finally {
		stopServing()
	}
})

// two workers on one machine, as in development, cannot both take the port
test("a port that is already taken is reported, and the worker runs on without its gauges", () => {
	Bun.env.WORKER_METRICS_PORT = "39465"
	spyOn(console, "error").mockImplementation(() => {})
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const readDemandGaugesOptions = { queueGroup: "main" as const, readInFlightCount: () => 0 }
	const stopFirstServer = serveDemandGauges(readDemandGaugesOptions)

	// the second server cannot bind, which is reported and stops nothing
	try {
		const stopSecondServer = serveDemandGauges(readDemandGaugesOptions)
		expect(reportErrorSpy.mock.calls.map((reportCall) => reportCall.slice(1))).toEqual([
			["worker", { step: "demand-gauges" }],
		])
		stopSecondServer()
	} finally {
		stopFirstServer()
	}
})
