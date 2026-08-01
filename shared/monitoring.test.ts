// monitoring tests for the zero-reporting default and the report event content scrub
import { expect, test } from "bun:test"
import { scrubContent, startMonitoring } from "./monitoring"

// without a sentry dsn set, nothing starts
test("monitoring is a no-op without its key", () => {
	// clear the sentry dsn so the run is deterministic regardless of the calling shell's environment
	const previousDsn = Bun.env.SENTRY_DSN
	Bun.env.SENTRY_DSN = undefined

	try {
		// the call does not throw an error and has no client to send through
		expect(() => startMonitoring()).not.toThrow()
	} finally {
		Bun.env.SENTRY_DSN = previousDsn
	}
})

// the content scrub drops content-bearing fields and keeps the event, so an error is still reported
test("scrubContent removes content fields and keeps the event", () => {
	// typed as the scrub's own shape, so the assertions below compare against what a scrubbed event may hold
	const event: { extra?: Record<string, unknown>; contexts?: Record<string, unknown> } = {
		extra: { resourceContent: "a fetched page body", topicId: "topic-1", attemptCount: 2 },
		contexts: { attachmentDocument: "an uploaded file's text", runtime: { name: "bun" } },
	}
	const scrubbed = scrubContent(event)

	// the content is gone from extra and contexts
	expect(scrubbed.extra).toEqual({ topicId: "topic-1", attemptCount: 2 })
	expect(scrubbed.contexts).toEqual({ runtime: { name: "bun" } })
})

// an event with nothing attached passes through the scrub untouched
test("scrubContent leaves an event with nothing attached alone", () => {
	expect(scrubContent({})).toEqual({ extra: undefined, contexts: undefined })
})

// a cycle must not overflow the stack and take the process with it
test("scrubContent survives a circular reference", () => {
	// an object that points back at itself, the shape an ORM row or a request object can easily take
	const cyclic: Record<string, unknown> = { topicId: "topic-1" }
	cyclic.self = cyclic

	// the cycle is named rather than followed, and the rest of the object survives
	const extra = scrubContent({ extra: cyclic }).extra as { topicId: string; self: string }
	expect(extra.topicId).toBe("topic-1")
	expect(extra.self).toBe("[circular]")
})

// a Date or an Error keeps its data outside of enumerable keys, so walking one would erase it
test("scrubContent leaves built-in objects whole", () => {
	const startedAt = new Date("2026-07-31T00:00:00.000Z")
	const extra = scrubContent({ extra: { startedAt, pattern: /abc/ } }).extra as { startedAt: Date; pattern: RegExp }

	// both come back as themselves instead of empty objects
	expect(extra.startedAt).toBeInstanceOf(Date)
	expect(extra.startedAt.toISOString()).toBe("2026-07-31T00:00:00.000Z")
	expect(extra.pattern).toBeInstanceOf(RegExp)
})

// a page body hiding in a named field is bounded by length, one level down included
test("scrubContent truncates long strings wherever they hide", () => {
	// a body under a name the content filter would never catch, nested and top-level, plus a short id left alone
	const pageBody = "x".repeat(2000)
	const scrubbed = scrubContent({
		extra: { info: pageBody, topicId: "topic-1", details: { payload: pageBody } },
	})

	// both copies are cut and marked, and the identifier is untouched
	const extra = scrubbed.extra as { info: string; topicId: string; details: { payload: string } }
	expect(extra.info).toHaveLength(500 + "…[truncated]".length)
	expect(extra.info.endsWith("…[truncated]")).toBe(true)
	expect(extra.details.payload.endsWith("…[truncated]")).toBe(true)
	expect(extra.topicId).toBe("topic-1")
})
