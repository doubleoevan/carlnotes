// monitoring tests for the zero-reporting default and the report event content scrub
import { expect, test } from "bun:test"
import { scrubContent, scrubTransaction, startMonitoring, toTracesSampleRate } from "./monitoring"

// without a sentry dsn set, nothing starts
test("monitoring is a no-op without its key", () => {
	// clear the sentry dsn so the run is deterministic regardless of the calling shell's environment
	const originalDsn = Bun.env.SENTRY_DSN
	Bun.env.SENTRY_DSN = undefined

	try {
		// the call does not throw an error and has no client to send through
		expect(() => startMonitoring()).not.toThrow()
	} finally {
		Bun.env.SENTRY_DSN = originalDsn
	}
})

// the content scrub drops content-bearing fields and keeps the event, so an error is still reported
test("scrubContent removes content fields and keeps the event", () => {
	// typed as the scrub's own shape, so the assertions below compare against what a scrubbed event can include
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

	// the cycle is named instead of being followed, and the rest of the object survives
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

// a transaction goes through the same scrub and reports every url by its route,
// and no query string leaves on its request, a header, its trace, or a span
test("scrubTransaction reports a transaction's urls by its route and removes every query string", () => {
	// the fields a transaction from Sentry's Bun integration includes, with a token in the path, the query, and the referer
	const referer = "https://carlnotes.com/reset-password?token=secret-referer"
	const transactionEvent: Parameters<typeof scrubTransaction>[0] = {
		contexts: {
			attachmentDocument: "an uploaded file's text",
			trace: {
				data: {
					"http.route": "/invite/:token",
					"url.path": "/invite/secret-path-token",
					"url.full": "https://carlnotes.com/invite/secret-path-token?consent_code=secret-query",
					url: "https://carlnotes.com/invite/secret-path-token",
					"url.query": "?consent_code=secret-query",
					"http.query": "consent_code=secret-query",
					"http.request.header.referer": referer,
				},
			},
		},
		request: {
			url: "https://carlnotes.com/invite/secret-path-token?consent_code=secret-query",
			query_string: "consent_code=secret-query",
			headers: { referer, accept: "text/html" },
		},
		spans: [{ data: { "url.full": "https://api.example.com/v1?key=secret-outgoing", "db.system": "postgresql" } }],
	}
	const scrubbed = scrubTransaction(transactionEvent)

	// the content is gone, every url is the route's, and the referer and the outgoing request keep their paths
	const routeUrl = "https://carlnotes.com/invite/:token"
	expect(scrubbed.contexts).toEqual({
		trace: {
			data: {
				"http.route": "/invite/:token",
				"url.path": "/invite/:token",
				"url.full": routeUrl,
				url: routeUrl,
				"http.request.header.referer": "https://carlnotes.com/reset-password",
			},
		},
	})
	expect(scrubbed.request).toEqual({
		url: routeUrl,
		headers: { referer: "https://carlnotes.com/reset-password", accept: "text/html" },
	})
	expect(scrubbed.spans).toEqual([{ data: { "url.full": "https://api.example.com/v1", "db.system": "postgresql" } }])
	expect(JSON.stringify(scrubbed)).not.toContain("secret")
})

// an error keeps the path it happened on, which is what makes it debuggable, and loses only its query strings and fragments
test("scrubContent keeps an error's path and removes its query strings", () => {
	// typed as the scrub's own shape, so the assertion below compares against what a scrubbed event can include
	const errorEvent: Parameters<typeof scrubContent>[0] = {
		request: {
			url: "https://carlnotes.com/topics/5f3c/agents-weekly?token=secret-query",
			query_string: "token=secret-query",
			headers: { referer: "https://carlnotes.com/reset-password?token=secret-referer#secret-fragment" },
		},
	}
	const scrubbed = scrubContent(errorEvent)
	expect(scrubbed.request).toEqual({
		url: "https://carlnotes.com/topics/5f3c/agents-weekly",
		headers: { referer: "https://carlnotes.com/reset-password" },
	})
})

// an invite link's token is a key to the invite, so no path sends it, while an id and every other path stay as they are
test("scrubContent replaces an invite link's token in every url and path", () => {
	// the invite page, the referer it sends, the head route the page reads, and paths that include no token
	const errorEvent: Parameters<typeof scrubContent>[0] = {
		request: {
			url: "https://carlnotes.com/invite/secret-invite-token?utm_source=x",
			headers: { referer: "https://carlnotes.com/invite/secret-referer-token" },
		},
		spans: [
			{ data: { "url.full": "http://localhost:3000/api/invites/secret-head-token/head" } },
			{ data: { "url.full": "http://localhost:3000/api/invites/secret-image-token/preview.png" } },
			{ data: { "url.full": "http://localhost:3000/api/invites/topics/pending" } },
			{ data: { "url.full": "http://localhost:3000/api/invites/5f3c/accept" } },
		],
	}
	const scrubbed = scrubContent(errorEvent)

	// each token becomes :token, and each invites route with no token keeps its path
	expect(scrubbed.request).toEqual({
		url: "https://carlnotes.com/invite/:token",
		headers: { referer: "https://carlnotes.com/invite/:token" },
	})
	expect(scrubbed.spans?.map((span) => span.data?.["url.full"])).toEqual([
		"http://localhost:3000/api/invites/:token/head",
		"http://localhost:3000/api/invites/:token/preview.png",
		"http://localhost:3000/api/invites/topics/pending",
		"http://localhost:3000/api/invites/5f3c/accept",
	])
	expect(JSON.stringify(scrubbed)).not.toContain("secret")
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
