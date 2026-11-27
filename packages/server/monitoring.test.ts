// monitoring tests for the zero-reporting default, the release tag, the error report windows, the slot a report
// takes before it is sent, and the fatal exit
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { HOUR_MS } from "@carlnotes/contracts/time"
import * as Sentry from "@sentry/bun"
import {
	clearReportHistory,
	decideErrorReport,
	type ErrorReportWindow,
	exitOnFatalError,
	limitReportsBySlot,
	reportError,
	reportThresholdCrossing,
	shutdownMonitoring,
	startMonitoring,
	toLoggableError,
	toSentryRelease,
} from "./monitoring"
import { saveEnvSettings } from "./savedEnvSettings"

// each test starts as a process that takes no slot and has reported nothing
afterEach(() => {
	limitReportsBySlot(null)
	clearReportHistory()
	mock.restore()
})

// a fatal error is logged, reported once under its stage, and exits with code 1 after the report flushes
test("exitOnFatalError reports the error once and exits 1", async () => {
	// stub the report, the flush, the log, and the exit, so the test process keeps running
	const captureExceptionSpy = spyOn(Sentry, "captureException").mockImplementation(() => "")
	const flushSpy = spyOn(Sentry, "flush").mockResolvedValue(true)
	const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
	const exitSpy = spyOn(process, "exit").mockImplementation((() => {}) as typeof process.exit)

	try {
		// exit on a connection failure, as the worker does if Temporal refuses the connection
		const connectionError = new Error("temporal connection refused, for the fatal exit test")
		await exitOnFatalError({ error: connectionError, stage: "startup", message: "temporal worker failed" })

		// the error is logged, sent once under startup, flushed, and the exit code is 1
		expect(consoleErrorSpy).toHaveBeenCalledWith("temporal worker failed", connectionError)
		expect(captureExceptionSpy).toHaveBeenCalledTimes(1)
		expect(captureExceptionSpy.mock.calls[0]?.[1]).toMatchObject({ tags: { stage: "startup" } })
		expect(flushSpy).toHaveBeenCalledTimes(1)
		expect(exitSpy).toHaveBeenCalledWith(1)
	} finally {
		// restore the real report, flush, log, and exit
		captureExceptionSpy.mockRestore()
		flushSpy.mockRestore()
		consoleErrorSpy.mockRestore()
		exitSpy.mockRestore()
	}
})

// without a sentry dsn set, nothing starts
test("monitoring is a no-op without its key", () => {
	// clear the sentry dsn so the run is deterministic regardless of the calling shell's environment
	const restoreEnvSettings = saveEnvSettings(["SENTRY_DSN"])
	delete Bun.env.SENTRY_DSN

	try {
		// the call does not throw an error and has no client to send through
		expect(() => startMonitoring()).not.toThrow()
	} finally {
		restoreEnvSettings()
	}
})

// one stage's one error is reported ten times an hour, the rest are skipped, and the next hour's first report says how
// many were skipped. another error in the same stage has its own window
test("decideErrorReport sends ten reports an hour, and the next hour's first report sends the skipped count", () => {
	const errorReportWindows = new Map<string, ErrorReportWindow>()
	const errorReportDecisions = Array.from({ length: 12 }, () =>
		decideErrorReport({ errorReportWindowByKey: errorReportWindows, key: "fetch:timed out", nowMs: 1_000 }),
	)
	expect(errorReportDecisions.filter((errorReportDecision) => errorReportDecision.isSent)).toHaveLength(10)
	expect(errorReportDecisions.slice(10).every((errorReportDecision) => !errorReportDecision.isSent)).toBe(true)

	// the tenth report alone reaches the limit
	const limitReachedPlaces = errorReportDecisions.flatMap((decision, place) => (decision.isLimitReached ? [place] : []))
	expect(limitReachedPlaces).toEqual([9])

	// another error has its own window, and the next hour reopens the first with the two it skipped
	expect(
		decideErrorReport({ errorReportWindowByKey: errorReportWindows, key: "fetch:connection reset", nowMs: 1_000 }),
	).toEqual({ isSent: true, skippedCount: 0, isLimitReached: false })
	expect(
		decideErrorReport({ errorReportWindowByKey: errorReportWindows, key: "fetch:timed out", nowMs: 1_000 + HOUR_MS }),
	).toEqual({ isSent: true, skippedCount: 2, isLimitReached: false })
})

// ten reports an hour stay under an error rate alert, so the tenth also warns through the alert on threshold warnings
test("the tenth report of one stage's error in an hour sends one error-loop warning that names the stage", () => {
	const captureMessageSpy = spyOn(Sentry, "captureMessage").mockImplementation(() => "")
	const captureExceptionSpy = spyOn(Sentry, "captureException").mockImplementation(() => "")

	// nine reports of one error warn nobody, and the tenth sends the warning
	for (let report = 0; report < 9; report++) {
		reportError(new Error("the speech model timed out"), "podcast-episode")
	}
	expect(captureMessageSpy).not.toHaveBeenCalled()
	reportError(new Error("the speech model timed out"), "podcast-episode")
	expect(captureMessageSpy.mock.calls).toEqual([
		[
			"one stage's error repeated to the hourly report limit",
			{
				level: "warning",
				fingerprint: ["performance", "error-loop"],
				tags: { alert: "performance", condition: "error-loop", stage: "podcast-episode" },
				extra: { sentReportCount: 10 },
			},
		],
	])

	// the hour's later repeats send no report and no second warning, and neither does another error of the stage
	for (let report = 0; report < 30; report++) {
		reportError(new Error("the speech model timed out"), "podcast-episode")
		reportError(new Error("the script was rejected"), "podcast-episode")
	}
	expect(captureExceptionSpy).toHaveBeenCalledTimes(20)
	expect(captureMessageSpy).toHaveBeenCalledTimes(1)

	// another stage's looping error has a warning of its own
	for (let report = 0; report < 10; report++) {
		reportError(new Error("the page could not be read"), "fetch")
	}
	expect(captureMessageSpy).toHaveBeenCalledTimes(2)
	expect(captureMessageSpy.mock.calls[1]?.[1]).toMatchObject({ tags: { stage: "fetch" } })
})

// the windows stop at the key limit, and the oldest error's window is dropped first
test("decideErrorReport drops the oldest error's window past the key limit", () => {
	const errorReportWindows = new Map<string, ErrorReportWindow>()
	for (let i = 0; i < 1000; i++) {
		decideErrorReport({ errorReportWindowByKey: errorReportWindows, key: `api-route:error ${i}`, nowMs: 1_000 })
	}

	// the thousand-and-first error drops the first
	decideErrorReport({ errorReportWindowByKey: errorReportWindows, key: "api-route:one more", nowMs: 1_000 })
	expect(errorReportWindows.size).toBe(1000)
	expect(errorReportWindows.has("api-route:error 0")).toBe(false)
	expect(errorReportWindows.has("api-route:one more")).toBe(true)
})

// the release is SENTRY_RELEASE if set, then the commit SHA Northflank deployed, then none
test("toSentryRelease reads SENTRY_RELEASE, then Northflank's deployed commit SHA", () => {
	expect(toSentryRelease({ SENTRY_RELEASE: "a-release", NF_DEPLOYMENT_SHA: "abc123" })).toBe("a-release")
	expect(toSentryRelease({ NF_DEPLOYMENT_SHA: "abc123" })).toBe("abc123")
	expect(toSentryRelease({ SENTRY_RELEASE: "", NF_DEPLOYMENT_SHA: "" })).toBeUndefined()
	expect(toSentryRelease({})).toBeUndefined()
})

// a process that is new on every run asks a store that outlives it before each report
test("a report that takes its slot is sent, one whose slot is held is not, and one whose slot cannot be asked for is sent", async () => {
	// a slot per report key: taken, held, and a store that fails
	const captureMessageSpy = spyOn(Sentry, "captureMessage").mockImplementation(() => "")
	const captureExceptionSpy = spyOn(Sentry, "captureException").mockImplementation(() => "")
	spyOn(Sentry, "flush").mockResolvedValue(true)
	const askedReportKeys: string[] = []
	limitReportsBySlot(async (reportKey) => {
		// the store fails for one key, and another report holds the slot of the keys that say so
		askedReportKeys.push(reportKey)
		if (reportKey.includes("unreadable")) {
			throw new Error("the slot store is down")
		}
		return !reportKey.includes("held")
	})

	// three warnings and two errors, then the shutdown that waits for their slots
	for (const condition of ["slot-taken", "slot-held", "slot-unreadable"]) {
		reportThresholdCrossing({ condition, message: `the ${condition} warning`, values: {} })
	}
	reportError(new Error("a taken error, for the slot test"), "worker")
	reportError(new Error("a held error, for the slot test"), "worker")
	expect(captureMessageSpy).not.toHaveBeenCalled()
	await shutdownMonitoring()

	// each report asked under its own key, and only the held ones were dropped
	expect(askedReportKeys).toEqual([
		"condition:slot-taken",
		"condition:slot-held",
		"condition:slot-unreadable",
		"error:worker:a taken error, for the slot test",
		"error:worker:a held error, for the slot test",
	])
	expect(captureMessageSpy.mock.calls.map(([message]) => message)).toEqual([
		"the slot-taken warning",
		"the slot-unreadable warning",
	])
	expect(captureExceptionSpy.mock.calls.map(([error]) => (error as Error).message)).toEqual([
		"a taken error, for the slot test",
	])
})

// a short-lived process exits right after its shutdown, so a report still asking for its slot has to finish first
test("a shutdown sends a report that is still waiting on its slot before it flushes", async () => {
	// a slot that is given only once the test releases it
	const sentOrder: string[] = []
	spyOn(Sentry, "captureMessage").mockImplementation(() => `${sentOrder.push("warning")}`)
	spyOn(Sentry, "flush").mockImplementation(async () => sentOrder.push("flush") > 0)
	const slotGate = Promise.withResolvers<boolean>()
	limitReportsBySlot(() => slotGate.promise)

	// the warning waits, the shutdown waits on it, and the flush follows the send
	reportThresholdCrossing({ condition: "slot-waiting", message: "a waiting warning", values: {} })
	const shutdown = shutdownMonitoring()
	expect(sentOrder).toEqual([])
	slotGate.resolve(true)
	await shutdown
	expect(sentOrder).toEqual(["warning", "flush"])
})

// a long-running process keeps its own hourly counts and asks no store
test("a process that takes no slot sends its report at once", () => {
	const captureMessageSpy = spyOn(Sentry, "captureMessage").mockImplementation(() => "")
	reportThresholdCrossing({ condition: "no-slot", message: "a warning with no slot", values: {} })
	expect(captureMessageSpy).toHaveBeenCalledTimes(1)
})

test("a loggable error keeps its name, message, and status, and never the request it sent", () => {
	// a model call's error with the chat text in its request body
	const modelCallError = Object.assign(new Error("Bad Gateway"), {
		name: "AI_APICallError",
		statusCode: 502,
		requestBodyValues: { messages: [{ content: "my private question" }] },
	})
	expect(toLoggableError(modelCallError)).toBe("AI_APICallError: Bad Gateway (502)")
	expect(toLoggableError(new TypeError("fetch failed"))).toBe("TypeError: fetch failed")
	expect(toLoggableError("timed out")).toBe("timed out")
})
