// the send-time scrub that every outgoing Sentry event passes: no content, no query string, and no invite token

// an event on its way to Sentry, as the scrub reads and rewrites it
type OutgoingEvent = {
	extra?: Record<string, unknown>
	contexts?: Record<string, unknown>
	request?: { url?: string; query_string?: unknown; headers?: Record<string, string> }
	spans?: { data?: Record<string, unknown> }[]
}

/**
 * Removes content-bearing fields, every query string, and every invite link's token from an outgoing event,
 * keeping the event itself.
 */
export function scrubContent<Event extends OutgoingEvent>(event: Event): Event {
	// scrub extra and contexts, the two places an integration or a caller can attach content
	const scrubbedEvent = { ...event, extra: withoutContent(event.extra), contexts: withoutContent(event.contexts) }

	// a query string can include a reset token or a consent code, and a path an invite link's token,
	// so neither leaves on the request, a header, the trace, or a span
	const traceContext = scrubbedEvent.contexts?.trace as { data?: Record<string, unknown> } | undefined
	if (traceContext?.data) {
		traceContext.data = withoutUrlSecrets(traceContext.data)
	}
	return {
		...scrubbedEvent,
		...(event.request ? { request: withoutRequestUrlSecrets(event.request) } : {}),
		...(event.spans ? { spans: event.spans.map((span) => ({ ...span, data: withoutUrlSecrets(span.data) })) } : {}),
	}
}

/**
 * Scrubs an outgoing transaction like any event, then reports each of its urls by its route,
 * so no id or token in a path reaches Sentry either.
 */
export function scrubTransaction<Event extends OutgoingEvent>(event: Event): Event {
	// a transaction the request middleware named has its route, and a page the ui has no route for keeps its path
	const scrubbedEvent = scrubContent(event)
	const traceData = (scrubbedEvent.contexts?.trace as { data?: Record<string, unknown> } | undefined)?.data
	const route = traceData?.["http.route"]
	if (!traceData || typeof route !== "string" || !route.startsWith("/")) {
		return scrubbedEvent
	}

	// the route replaces the path in the trace's urls and in the request's
	const toRouteUrl = <Url>(url: Url): Url | string =>
		typeof url === "string" && URL.canParse(url) ? `${new URL(url).origin}${route}` : url
	Object.assign(traceData, {
		"url.full": toRouteUrl(traceData["url.full"]),
		url: toRouteUrl(traceData.url),
		"url.path": route,
	})
	const request = scrubbedEvent.request && { ...scrubbedEvent.request, url: toRouteUrl(scrubbedEvent.request.url) }
	return { ...scrubbedEvent, ...(request ? { request } : {}) }
}

// the fields named for a query string, which are dropped whole
const QUERY_STRING_FIELDS = new Set(["url.query", "http.query", "query_string"])

// a value that reads as a url or a path, whose query string starts at its "?" and its fragment at its "#"
const URL_OR_PATH_PATTERN = /^(https?:\/\/|\/)/

// an invite link's token in a path, on the invite page and its accept route,
// and on the api routes that read the link for its page head and its preview image
const INVITE_TOKEN_PATTERNS = [/(\/invite\/)[^/?#]+/g, /(\/invites\/)[^/?#]+(?=\/(?:head|preview\.png)(?:$|[/?#]))/g]

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

// a url or a path cut at its query string or its fragment, with an invite link's token replaced by :token
function toRedactedUrl(url: string): string {
	const urlWithoutQueryOrFragment = url.split(/[?#]/)[0] ?? url
	return INVITE_TOKEN_PATTERNS.reduce(
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

// an identifier is short and content is long, so any string past this length is treated as content wherever it hides
const MAX_REPORT_STRING_CHARS = 500

// a copy of one attached object with every content-bearing field dropped, or undefined when there was nothing to scrub
function withoutContent(attached: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
	if (!attached) {
		return attached
	}

	// the name filter removes what is labeled as content, and the length limit catches what is content
	const seen = new WeakSet<object>([attached])
	const keptEntries = Object.entries(attached)
		.filter(([field]) => !CONTENT_FIELD_PATTERN.test(field))
		.map(([field, value]) => [field, truncateLongStrings(value, seen)])
	return Object.fromEntries(keptEntries)
}

// truncate every string in a value, walking nested objects so a body can't hide a level down
function truncateLongStrings(value: unknown, seen = new WeakSet<object>()): unknown {
	// truncated and marked, so the error report can say something was here without including it
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
