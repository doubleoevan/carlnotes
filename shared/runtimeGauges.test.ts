// the minute gauge line, the thresholds it checks, and the warning each crossing sends at most once an hour
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { reportThresholdCrossing, toThresholdCaptureContext } from "./monitoring"
import { reportRuntimeGauges, toRuntimeThresholdCrossings } from "./runtimeGauges"

// a healthy pool, and one with requests waiting for a connection
const HEALTHY_POOL = { totalCount: 4, idleCount: 3, waitingCount: 0 }
const WAITING_POOL = { totalCount: 10, idleCount: 0, waitingCount: 3 }

// put console.log and console.error back after each test
afterEach(() => {
	mock.restore()
})

// one line per minute, with the pool, the event loop delay, and what the process adds
test("reportRuntimeGauges logs one line with the pool, the delay, and the extra gauges", async () => {
	const consoleLogSpy = spyOn(console, "log").mockImplementation(() => {})
	const { line } = await reportRuntimeGauges({
		processName: "worker",
		readPoolGauges: () => HEALTHY_POOL,
		readExtraGauges: async () => ({ gauges: { scanQueue: { pollerCount: 1 } }, thresholdCrossings: [] }),
	})

	// the logged line is the returned one, as one JSON object
	expect(line).toMatchObject({
		gauges: "runtime",
		process: "worker",
		pool: HEALTHY_POOL,
		scanQueue: { pollerCount: 1 },
	})
	expect(consoleLogSpy).toHaveBeenCalledTimes(1)
	expect(JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0]))).toEqual(line)
})

// a failed extra read is logged, and the pool and the delay are still reported
test("reportRuntimeGauges still logs when the extra gauges fail", async () => {
	spyOn(console, "log").mockImplementation(() => {})
	const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
	const { line } = await reportRuntimeGauges({
		processName: "worker",
		readPoolGauges: () => HEALTHY_POOL,
		readExtraGauges: () => Promise.reject(new Error("temporal unreachable")),
	})
	expect(line).toMatchObject({ process: "worker", pool: HEALTHY_POOL })
	expect(consoleErrorSpy).toHaveBeenCalled()
})

// a waiting request and a long stall each cross their own threshold, and a healthy minute crosses none
test("toRuntimeThresholdCrossings names each crossed threshold", () => {
	expect(toRuntimeThresholdCrossings({ pool: HEALTHY_POOL, eventLoopDelay: { p99Ms: 5, maxMs: 40 } })).toEqual([])
	const crossings = toRuntimeThresholdCrossings({ pool: WAITING_POOL, eventLoopDelay: { p99Ms: 180, maxMs: 350 } })
	expect(crossings.map((crossing) => crossing.condition)).toEqual(["pool-waiting", "event-loop-delay"])
})

// a condition that lasts for hours sends one warning an hour
test("reportThresholdCrossing sends a condition at most once an hour", () => {
	const crossing = { condition: "test-throttle", message: "a test threshold", values: { waitingCount: 1 } }
	const startedAt = Date.parse("2026-09-29T00:00:00Z")
	expect(reportThresholdCrossing(crossing, startedAt)).toBe(true)
	expect(reportThresholdCrossing(crossing, startedAt + 30 * 60 * 1000)).toBe(false)
	expect(reportThresholdCrossing(crossing, startedAt + 61 * 60 * 1000)).toBe(true)
})

// each condition groups as its own issue, tagged for the alert rule
test("toThresholdCaptureContext groups a warning by its condition", () => {
	const captureContext = toThresholdCaptureContext({
		condition: "pool-waiting",
		message: "waiting",
		values: { waitingCount: 2 },
	})
	expect(captureContext).toEqual({
		level: "warning",
		fingerprint: ["performance", "pool-waiting"],
		tags: { alert: "performance", condition: "pool-waiting" },
		extra: { waitingCount: 2 },
	})
})
