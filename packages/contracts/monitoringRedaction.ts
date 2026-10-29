// send-time redaction for selected content fields and URL secrets in Sentry events

// an event on its way to Sentry, as the redaction reads and rewrites it
type OutgoingEvent = {
	extra?: Record<string, unknown>
	contexts?: Record<string, unknown>
	request?: { url?: string; query_string?: unknown; headers?: Record<string, string> }
	spans?: { data?: Record<string, unknown> }[]
}

/**
 * Removes named content fields, bounds attached strings, and redacts request, trace, and span URL secrets.
 */
export function redactEvent<Event extends OutgoingEvent>(event: Event): Event {
	// redact extra and contexts, where integrations and callers attach content
	const redactedEvent = { ...event, extra: withoutContent(event.extra), contexts: withoutContent(event.contexts) }

	// remove query strings and invite tokens from recorded request, trace, and span URL fields
	const traceContext = redactedEvent.contexts?.trace as { data?: Record<string, unknown> } | undefined
	if (traceContext?.data) {
		traceContext.data = withoutUrlSecrets(traceContext.data)
	}
	return {
		...redactedEvent,
		...(event.request ? { request: withoutRequestUrlSecrets(event.request) } : {}),
		...(event.spans ? { spans: event.spans.map((span) => ({ ...span, data: withoutUrlSecrets(span.data) })) } : {}),
	}
}

/**
 * Applies event redaction and replaces request and trace URLs with the recorded route when available.
 */
export function redactTransaction<Event extends OutgoingEvent>(event: Event): Event {
	// a transaction the request middleware named has its route, and a page the ui has no route for keeps its path
	const redactedEvent = redactEvent(event)
	const traceData = (redactedEvent.contexts?.trace as { data?: Record<string, unknown> } | undefined)?.data
	const route = traceData?.["http.route"]
	if (!traceData || typeof route !== "string" || !route.startsWith("/")) {
		return redactedEvent
	}

	// the route replaces the path in the trace's urls and in the request's
	const toRouteUrl = <Url>(url: Url): Url | string =>
		typeof url === "string" && URL.canParse(url) ? `${new URL(url).origin}${route}` : url
	Object.assign(traceData, {
		"url.full": toRouteUrl(traceData["url.full"]),
		url: toRouteUrl(traceData.url),
		"url.path": route,
	})
	const request = redactedEvent.request && { ...redactedEvent.request, url: toRouteUrl(redactedEvent.request.url) }
	return { ...redactedEvent, ...(request ? { request } : {}) }
}

// the fields named for a query string, which are dropped whole
const QUERY_STRING_FIELDS = new Set(["url.query", "http.query", "query_string"])

// a value that reads as a url or a path, whose query string starts at its "?" and its fragment at its "#"
const URL_OR_PATH_PATTERN = /^(https?:\/\/|\/)/

// private invitation and podcast-feed tokens in paths
const PRIVATE_TOKEN_PATH_PATTERNS = [
	/(\/invite\/)[^/?#]+/g,
	/(\/invites\/)[^/?#]+(?=\/(?:head|preview\.png)(?:$|[/?#]))/g,
	/(\/podcast-feeds\/)[^/?#]+/g,
]

/**
 * Returns a record without its query string fields, and every url or path in it without its query, fragment, or token.
 */
export function withoutUrlSecrets(record: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
	if (!record) {
		return record
	}
	const keptEntries = Object.entries(record)
		.filter(([field]) => !QUERY_STRING_FIELDS.has(field))
		.map(([field, value]) => [
			field,
			typeof value === "string" && URL_OR_PATH_PATTERN.test(value) ? toRedactedUrl(value) : value,
		])
	return Object.fromEntries(keptEntries)
}

// remove query fields and fragments, and replace private path tokens
function toRedactedUrl(url: string): string {
	const urlWithoutQueryOrFragment = url.split(/[?#]/)[0] ?? url
	return PRIVATE_TOKEN_PATH_PATTERNS.reduce(
		(redactedUrl, pattern) => redactedUrl.replace(pattern, "$1:token"),
		urlWithoutQueryOrFragment,
	)
}

// a request with no query string or invite link's token on its url, its recorded query, or a header such as its referer
function withoutRequestUrlSecrets<Request extends NonNullable<OutgoingEvent["request"]>>(request: Request): Request {
	const keptRequest = withoutUrlSecrets(request) as Request
	return request.headers ? { ...keptRequest, headers: withoutUrlSecrets(request.headers) } : keptRequest
}

// event fields that could include a context doc or a page's content. they are dropped before an event is sent.
const CONTENT_FIELD_PATTERN = /content|context|document|snippet|prompt|markdown|text/i

// the maximum attached string length retained in a report
const MAX_REPORT_STRING_CHARS = 500

// copy an attached object with its content fields removed
function withoutContent(attached: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
	if (!attached) {
		return attached
	}

	// remove matching top-level fields and bound strings inside remaining plain objects
	const seen = new WeakSet<object>([attached])
	const keptEntries = Object.entries(attached)
		.filter(([field]) => !CONTENT_FIELD_PATTERN.test(field))
		.map(([field, value]) => [field, truncateLongStrings(value, seen)])
	return Object.fromEntries(keptEntries)
}

// truncate long strings while walking nested plain objects
function truncateLongStrings(value: unknown, seen = new WeakSet<object>()): unknown {
	// retain a bounded prefix and mark the omitted remainder
	if (typeof value === "string" && URL_OR_PATH_PATTERN.test(value)) {
		return toRedactedUrl(value)
	}
	if (typeof value === "string" && value.length > MAX_REPORT_STRING_CHARS) {
		return `${value.slice(0, MAX_REPORT_STRING_CHARS)}…[truncated]`
	}

	// a Date, Map, or Error has no own enumerable entries, so walking one would replace it with an empty object
	if (!isPlainObject(value)) {
		return value
	}

	if (seen.has(value)) {
		return "[circular]"
	}
	seen.add(value)
	return Object.fromEntries(Object.entries(value).map(([field, nested]) => [field, truncateLongStrings(nested, seen)]))
}

// whether a value is a plain object literal, the only shape worth walking for hidden content
function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null) {
		return false
	}
	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
}
