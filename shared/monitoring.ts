// error monitoring and request tracing through Sentry
import type { Span } from "@sentry/bun"
import * as Sentry from "@sentry/bun"

// Sentry's span type, so a caller can type a span without importing Sentry
export type { Span }

// the fraction of traces sampled when tracing is on. the environment can override it
const DEFAULT_TRACES_SAMPLE_RATE = 0.1

// how long a shutdown waits for pending reports to reach Sentry before giving up
const SHUTDOWN_FLUSH_MS = 2000

// how long a threshold alert stays quiet after it is sent, per condition, however long the condition lasts
const THRESHOLD_ALERT_QUIET_MS = 60 * 60 * 1000

// when each condition last sent its alert from this process
const thresholdAlertSentAt = new Map<string, number>()

// the paths never traced: the health checks, which the platform and a monitor poll all day
const UNTRACED_PATHS = new Set(["/api/health", "/api/health/deep"])

// the path prefixes never traced: the built assets, the docs site, and the screenshots the ui serves as files
const UNTRACED_PATH_PREFIXES = ["/assets/", "/docs", "/screenshots/"]

// the files at the site root that the api builds from the database, which are traced like any other request
const TRACED_ROOT_FILES = new Set(["/sitemap.xml", "/feed.xml", "/llms.txt", "/llms-full.txt"])

// the badge polls every open tab sends, the most frequent requests and the least varied
const BADGE_POLL_PATHS = new Set(["/api/rooms/mention-count", "/api/note-badges", "/api/invites/topics/pending"])

// how many times less often a badge poll is traced than any other request
const BADGE_POLL_SAMPLE_DIVISOR = 10

/**
 * Starts error monitoring in production when `SENTRY_DSN` is set, and no-ops everywhere else.
 */
export function startMonitoring(): void {
	// no dsn means no monitoring, which is the self-hosted default
	if (!Bun.env.SENTRY_DSN) {
		return
	}

	// the sentry quota is shared across environments, so only production reports its errors
	const environment = Bun.env.DOPPLER_ENVIRONMENT ?? "dev"
	if (environment !== "prd") {
		return
	}

	// sample each request by its path, scrub content from errors and transactions alike,
	// and keep personal data off by default
	const tracesSampleRate = Number(Bun.env.SENTRY_TRACES_SAMPLE_RATE ?? DEFAULT_TRACES_SAMPLE_RATE)
	Sentry.init({
		dsn: Bun.env.SENTRY_DSN,
		environment,
		tracesSampler: (samplingContext) =>
			samplingContext.inheritOrSampleWith(toTracesSampleRate({ spanName: samplingContext.name, tracesSampleRate })),
		sendDefaultPii: false,
		beforeSend: scrubContent,
		beforeSendTransaction: scrubTransaction,
		// model calls are traced in Langfuse alone, so Sentry's AI SDK integration is left out
		integrations: (defaultIntegrations) => defaultIntegrations.filter((integration) => integration.name !== "VercelAI"),
		// a console call is never sent as a breadcrumb, and an outgoing request's breadcrumb loses the secrets in its url
		beforeBreadcrumb: (breadcrumb) =>
			breadcrumb.category === "console" ? null : { ...breadcrumb, data: withoutUrlSecrets(breadcrumb.data) },
	})
}

/**
 * Returns whether Sentry started in this process, which it does only in production with a key.
 */
export function isMonitoringStarted(): boolean {
	return Sentry.isInitialized()
}

// what a sample rate is decided from: the span's name, which starts with a request's method and path, and the rate
type ToTracesSampleRateOptions = { spanName: string; tracesSampleRate: number }

/**
 * Returns the share of spans traced for a span's name. The health checks and the static files are never traced,
 * the badge polls are traced at a tenth of the rate, and every other span at the rate.
 */
export function toTracesSampleRate({ spanName, tracesSampleRate }: ToTracesSampleRateOptions): number {
	// a request's span is named by its method and its path, and any other span's name reads as a path of its own
	const path = spanName.slice(spanName.indexOf(" ") + 1)

	// the health checks, the static prefixes, and a file at the site root the api does not build are never traced
	const isRootFile = path.lastIndexOf("/") === 0 && path.includes(".")
	const isUntraced =
		UNTRACED_PATHS.has(path) ||
		UNTRACED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
		(isRootFile && !TRACED_ROOT_FILES.has(path))
	if (isUntraced) {
		return 0
	}

	// a badge poll is traced at a tenth of the rate, and anything else at the rate
	return BADGE_POLL_PATHS.has(path) ? tracesSampleRate / BADGE_POLL_SAMPLE_DIVISOR : tracesSampleRate
}

/**
 * Returns the span of the request running now, the one Sentry's Bun integration opened, or undefined if nothing is traced.
 */
export function readRequestSpan(): Span | undefined {
	const activeSpan = Sentry.getActiveSpan()
	return activeSpan ? Sentry.getRootSpan(activeSpan) : undefined
}

// the transaction to name, the request's method and route, and the measurements it ends with
type CompleteRequestTransactionOptions = {
	requestSpan: Span
	method: string
	route: string
	measurements: Record<string, { value: number; unit: "none" | "millisecond" }>
}

/**
 * Names a request's transaction by its route and attaches its measurements.
 */
export function completeRequestTransaction({
	requestSpan,
	method,
	route,
	measurements,
}: CompleteRequestTransactionOptions): void {
	// the route replaces the url in the name, so the name includes no id and no query string
	Sentry.updateSpanName(requestSpan, `${method} ${route}`)
	requestSpan.setAttributes({ "http.route": route, "sentry.source": "route" })

	// Sentry can query each measurement and alert on it per route
	for (const [measurementName, { value, unit }] of Object.entries(measurements)) {
		Sentry.setMeasurement(measurementName, value, unit, requestSpan)
	}
}

/**
 * Runs one stage of a traced request inside its own span, or just runs it if no request is traced.
 */
export function traceRequestStage<Result>(stageName: string, runStage: () => Result): Result {
	return Sentry.startSpan({ name: stageName, op: "function", onlyIfParent: true }, runStage)
}

/**
 * Starts the span of one database statement inside a request, under the stage that sent it or the request's own span,
 * and returns the call that ends it. The statement names the span, and its parameter values never reach it.
 */
export function startQuerySpan(statement: string, requestSpan: Span): () => void {
	// the active span is the parent if its root is the request's span, which a stage's span has and a Langfuse span never has
	const activeSpan = Sentry.getActiveSpan()
	const parentSpan = activeSpan && Sentry.getRootSpan(activeSpan) === requestSpan ? activeSpan : requestSpan
	const querySpan = Sentry.startInactiveSpan({
		name: statement,
		op: "db",
		attributes: { "db.system": "postgresql" },
		parentSpan,
	})
	return () => querySpan.end()
}

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

// a record without the secrets a url can include. the fields named for a query string are dropped,
// and every url or path loses its query string, its fragment, and its invite link's token
function withoutUrlSecrets(record: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
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

// the pipeline stages that report a failure, named so Sentry can group them the way the pipeline reads
const reportedStages = [
	"ingest",
	"embed-filter",
	"fetch",
	"score",
	"object-storage",
	"scan-report",
	"scanner",
	"scheduled-scan",
	"manual-scan",
	"first-scan",
	"source-screen",
	"email",
	"chat",
	"prompt-registry",
	"billing",
	"page-render",
	"api-route",
] as const

// one of the stages above
export type ReportedStage = (typeof reportedStages)[number]

/**
 * Reports a failure the caller is already handling, so a failure that never throws an error is still visible.
 */
export function reportError(error: unknown, stage: ReportedStage, extra?: Record<string, string>): void {
	Sentry.captureException(error, { tags: { stage }, extra })
}

// a gauge that crossed its threshold: the condition that names its issue, the message, and the measured values
export type ThresholdCrossing = { condition: string; message: string; values: Record<string, number | null> }

/**
 * Sends one Sentry warning for a crossed threshold, grouped as its condition's own issue and tagged for the alert rule,
 * at most once an hour per condition. Returns whether it sent one.
 */
export function reportThresholdCrossing(thresholdCrossing: ThresholdCrossing, now = Date.now()): boolean {
	// a condition that alerted within the hour stays quiet, so an hour of waiting requests sends one warning, not sixty
	const sentAt = thresholdAlertSentAt.get(thresholdCrossing.condition)
	if (sentAt !== undefined && now - sentAt < THRESHOLD_ALERT_QUIET_MS) {
		return false
	}
	thresholdAlertSentAt.set(thresholdCrossing.condition, now)
	Sentry.captureMessage(thresholdCrossing.message, toThresholdCaptureContext(thresholdCrossing))
	return true
}

/**
 * Returns how a threshold warning is sent: its level, the fingerprint that groups it by condition,
 * the tags an alert rule matches, and the measured values.
 */
export function toThresholdCaptureContext({ condition, values }: ThresholdCrossing): {
	level: "warning"
	fingerprint: string[]
	tags: Record<string, string>
	extra: Record<string, number | null>
} {
	return {
		level: "warning",
		fingerprint: ["performance", condition],
		tags: { alert: "performance", condition },
		extra: values,
	}
}

/**
 * Flushes pending reports before a short-lived process exits. Safe to call whether the monitoring started or not.
 */
export async function shutdownMonitoring(): Promise<void> {
	// a flush failure must never flip the outcome the run earned
	try {
		await Sentry.flush(SHUTDOWN_FLUSH_MS)
	} catch (error) {
		console.error("monitoring shutdown failed", error)
	}
}
