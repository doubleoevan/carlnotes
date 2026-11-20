// request tracing through Sentry: the traces sampler, a request's transaction, and the stage and query spans

import type { Span } from "@sentry/bun"
import * as Sentry from "@sentry/bun"

// Sentry's span type, so a caller can type a span without importing Sentry
export type { Span }

// the paths never traced: the health checks, which the platform and a monitor poll all day
const UNTRACED_PATHS = new Set(["/api/health", "/api/health/deep", "/api/health/ready"])

// the path prefixes never traced: the built assets, the docs site, and the screenshots the ui serves as files
const UNTRACED_PATH_PREFIXES = ["/assets/", "/docs", "/screenshots/"]

// the files at the site root that the api builds from the database, which are traced like any other request
const TRACED_ROOT_FILES = new Set(["/sitemap.xml", "/feed.xml", "/llms.txt", "/llms-full.txt"])

// the badge polls every open tab sends, the most frequent requests and the least varied
const BADGE_POLL_PATHS = new Set(["/api/rooms/mention-count", "/api/note-badges", "/api/invites/topics/pending"])

// how many times less often a badge poll is traced than any other request
const BADGE_POLL_SAMPLE_DIVISOR = 10

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
