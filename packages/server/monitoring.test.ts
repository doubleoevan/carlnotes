// monitoring tests for the zero-reporting default, the traces sampler, and the error report windows
import { expect, test } from "bun:test"
import { HOUR_MS } from "@carlnotes/contracts/time"
import { decideErrorReport, type ErrorReportWindow, startMonitoring, toTracesSampleRate } from "./monitoring"
import { saveEnvSettings } from "./savedEnvSettings"

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

// the platform's polling and the static files spend no quota, and the badge polls spend a tenth of it
test("toTracesSampleRate samples each request by its path", () => {
	const toRate = (spanName: string): number => toTracesSampleRate({ spanName, tracesSampleRate: 0.1 })

	// the health checks and the static files are never traced
	expect(toRate("GET /api/health")).toBe(0)
	expect(toRate("GET /api/health/deep")).toBe(0)
	expect(toRate("GET /assets/index-abc123.js")).toBe(0)
	expect(toRate("GET /docs/quickstart/")).toBe(0)
	expect(toRate("GET /favicon.ico")).toBe(0)
	expect(toRate("GET /robots.txt")).toBe(0)

	// the badge polls are traced at a tenth of the rate
	expect(toRate("GET /api/rooms/mention-count")).toBeCloseTo(0.01)
	expect(toRate("GET /api/note-badges")).toBeCloseTo(0.01)
	expect(toRate("GET /api/invites/topics/pending")).toBeCloseTo(0.01)

	// a file the api builds from the database, an api route, and a page are traced at the rate
	expect(toRate("GET /sitemap.xml")).toBe(0.1)
	expect(toRate("GET /api/topic-feed")).toBe(0.1)
	expect(toRate("GET /topics/5f3c/agents-weekly")).toBe(0.1)
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

	// another error has its own window, and the next hour reopens the first with the two it skipped
	expect(
		decideErrorReport({ errorReportWindowByKey: errorReportWindows, key: "fetch:connection reset", nowMs: 1_000 }),
	).toEqual({ isSent: true, skippedCount: 0 })
	expect(
		decideErrorReport({ errorReportWindowByKey: errorReportWindows, key: "fetch:timed out", nowMs: 1_000 + HOUR_MS }),
	).toEqual({ isSent: true, skippedCount: 2 })
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
