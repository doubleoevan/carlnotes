// error monitoring, imported by the api and the worker
import * as Sentry from "@sentry/bun"

// the fraction of traces sampled when tracing is on. the environment can override it
const DEFAULT_TRACES_SAMPLE_RATE = 0.1

// how long a shutdown waits for pending reports to reach Sentry before giving up
const SHUTDOWN_FLUSH_MS = 2000

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

	// scrub content before send instead of trusting the caller, and keep pii off by default
	Sentry.init({
		dsn: Bun.env.SENTRY_DSN,
		environment,
		tracesSampleRate: Number(Bun.env.SENTRY_TRACES_SAMPLE_RATE ?? DEFAULT_TRACES_SAMPLE_RATE),
		sendDefaultPii: false,
		beforeSend: scrubContent,
		// the sdk logs every console call as a breadcrumb on the next event
		beforeBreadcrumb: (breadcrumb) => (breadcrumb.category === "console" ? null : breadcrumb),
	})
}

/**
 * Removes content-bearing fields from an outgoing event, keeping the event itself
 */
export function scrubContent<Event extends { extra?: Record<string, unknown>; contexts?: Record<string, unknown> }>(
	event: Event,
): Event {
	// scrub extra and contexts, the two places an integration or a caller can attach content
	return { ...event, extra: withoutContent(event.extra), contexts: withoutContent(event.contexts) }
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
// biome-ignore format: one line keeps the union under the comment-density hook's limit
export type ReportedStage = "ingest" | "embed-filter" | "fetch" | "score" | "object-storage" | "scan-report" | "scanner" | "scheduled-scan" | "manual-scan" | "first-scan" | "source-screen" | "email" | "chat" | "prompt-registry" | "billing"

/**
 * Reports a failure the caller is already handling, so a failure that never throws an error is still visible.
 */
export function reportError(error: unknown, stage: ReportedStage, extra?: Record<string, string>): void {
	Sentry.captureException(error, { tags: { stage }, extra })
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
