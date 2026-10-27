// redaction tests: what an outgoing event keeps and what it loses: content, query strings, and invite tokens
import { expect, test } from "bun:test"
import { redactEvent, redactTransaction } from "./monitoringRedaction"

// the content redaction drops content-bearing fields and keeps the event, so an error is still reported
test("redactEvent removes content fields and keeps the event", () => {
	// typed as the redaction's own shape, so the assertions below compare against what a redacted event can include
	const event: { extra?: Record<string, unknown>; contexts?: Record<string, unknown> } = {
		extra: { resourceContent: "a fetched page body", topicId: "topic-1", attemptCount: 2 },
		contexts: { attachmentDocument: "an uploaded file's text", runtime: { name: "bun" } },
	}
	const redacted = redactEvent(event)

	// the content is gone from extra and contexts
	expect(redacted.extra).toEqual({ topicId: "topic-1", attemptCount: 2 })
	expect(redacted.contexts).toEqual({ runtime: { name: "bun" } })
})

// an event with nothing attached passes through the redaction untouched
test("redactEvent leaves an event with nothing attached alone", () => {
	expect(redactEvent({})).toEqual({ extra: undefined, contexts: undefined })
})

// a cycle must not overflow the stack and take the process with it
test("redactEvent survives a circular reference", () => {
	// an object that points back at itself, the shape an ORM row or a request object can easily take
	const cyclic: Record<string, unknown> = { topicId: "topic-1" }
	cyclic.self = cyclic

	// the cycle is named instead of being followed, and the rest of the object survives
	const extra = redactEvent({ extra: cyclic }).extra as { topicId: string; self: string }
	expect(extra.topicId).toBe("topic-1")
	expect(extra.self).toBe("[circular]")
})

// a Date or an Error keeps its data outside of enumerable keys, so walking one would erase it
test("redactEvent leaves built-in objects whole", () => {
	const startedAt = new Date("2026-07-31T00:00:00.000Z")
	const extra = redactEvent({ extra: { startedAt, pattern: /abc/ } }).extra as { startedAt: Date; pattern: RegExp }

	// both come back as themselves instead of empty objects
	expect(extra.startedAt).toBeInstanceOf(Date)
	expect(extra.startedAt.toISOString()).toBe("2026-07-31T00:00:00.000Z")
	expect(extra.pattern).toBeInstanceOf(RegExp)
})

// a page body hiding in a named field is bounded by length, one level down included
test("redactEvent truncates long strings wherever they hide", () => {
	// a body under a name the content filter would never catch, nested and top-level, plus a short id left alone
	const pageBody = "x".repeat(2000)
	const redacted = redactEvent({
		extra: { info: pageBody, topicId: "topic-1", details: { payload: pageBody } },
	})

	// both copies are cut and marked, and the identifier is untouched
	const extra = redacted.extra as { info: string; topicId: string; details: { payload: string } }
	expect(extra.info).toHaveLength(500 + "…[truncated]".length)
	expect(extra.info.endsWith("…[truncated]")).toBe(true)
	expect(extra.details.payload.endsWith("…[truncated]")).toBe(true)
	expect(extra.topicId).toBe("topic-1")
})

// a transaction goes through the same redaction and reports every url by its route,
// and no query string leaves on its request, a header, its trace, or a span
test("redactTransaction reports a transaction's urls by its route and removes every query string", () => {
	// the fields a transaction from Sentry's Bun integration includes, with a token in the path, the query, and the referer
	const referer = "https://carlnotes.com/reset-password?token=secret-referer"
	const transactionEvent: Parameters<typeof redactTransaction>[0] = {
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
	const redacted = redactTransaction(transactionEvent)

	// the content is gone, every url is the route's, and the referer and the outgoing request keep their paths
	const routeUrl = "https://carlnotes.com/invite/:token"
	expect(redacted.contexts).toEqual({
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
	expect(redacted.request).toEqual({
		url: routeUrl,
		headers: { referer: "https://carlnotes.com/reset-password", accept: "text/html" },
	})
	expect(redacted.spans).toEqual([{ data: { "url.full": "https://api.example.com/v1", "db.system": "postgresql" } }])
	expect(JSON.stringify(redacted)).not.toContain("secret")
})

// an error keeps the path it happened on, which is what makes it debuggable, and loses only its query strings and fragments
test("redactEvent keeps an error's path and removes its query strings", () => {
	// typed as the redaction's own shape, so the assertion below compares against what a redacted event can include
	const errorEvent: Parameters<typeof redactEvent>[0] = {
		request: {
			url: "https://carlnotes.com/topics/5f3c/agents-weekly?token=secret-query",
			query_string: "token=secret-query",
			headers: { referer: "https://carlnotes.com/reset-password?token=secret-referer#secret-fragment" },
		},
	}
	const redacted = redactEvent(errorEvent)
	expect(redacted.request).toEqual({
		url: "https://carlnotes.com/topics/5f3c/agents-weekly",
		headers: { referer: "https://carlnotes.com/reset-password" },
	})
})

// an invite link's token is a key to the invite, so no path sends it, while an id and every other path stay as they are
test("redactEvent replaces an invite link's token in every url and path", () => {
	// the invite page, the referer it sends, the head route the page reads, and paths that include no token
	const errorEvent: Parameters<typeof redactEvent>[0] = {
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
	const redacted = redactEvent(errorEvent)

	// each token becomes :token, and each invites route with no token keeps its path
	expect(redacted.request).toEqual({
		url: "https://carlnotes.com/invite/:token",
		headers: { referer: "https://carlnotes.com/invite/:token" },
	})
	expect(redacted.spans?.map((span) => span.data?.["url.full"])).toEqual([
		"http://localhost:3000/api/invites/:token/head",
		"http://localhost:3000/api/invites/:token/preview.png",
		"http://localhost:3000/api/invites/topics/pending",
		"http://localhost:3000/api/invites/5f3c/accept",
	])
	expect(JSON.stringify(redacted)).not.toContain("secret")
})
