// monitoring tracing tests for the traces sampler
import { expect, test } from "bun:test"
import { toTracesSampleRate } from "./monitoringTracing"

// the platform's polling and the static files spend no quota, and the badge polls spend a tenth of it
test("toTracesSampleRate samples each request by its path", () => {
	const toRate = (spanName: string): number => toTracesSampleRate({ spanName, tracesSampleRate: 0.1 })

	// the health checks and the static files are never traced
	expect(toRate("GET /api/health")).toBe(0)
	expect(toRate("GET /api/health/deep")).toBe(0)
	expect(toRate("GET /api/health/ready")).toBe(0)
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
