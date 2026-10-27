// error monitoring and request tracing through Sentry

import type { ClientTelemetry } from "@carlnotes/contracts/clientTelemetry"
import { HOUR_MS } from "@carlnotes/contracts/time"
import type { Span } from "@sentry/bun"
import * as Sentry from "@sentry/bun"
import { redactEvent, redactTransaction, withoutUrlSecrets } from "./monitoringRedaction"

/**
 * Labels request errors with isolated client telemetry.
 */
export function withRequestTelemetry<Result>(properties: ClientTelemetry, run: () => Result): Result {
	// the SDK installs asynchronous isolation only when monitoring starts
	if (!Sentry.getClient()) {
		return run()
	}
	return Sentry.withIsolationScope((scope) => {
		// keep simultaneous requests from sharing their device tags
		scope.setTags(properties)
		return run()
	})
}

// Sentry's span type, so a caller can type a span without importing Sentry
export type { Span }

// the fraction of traces sampled when tracing is on. the environment can override it
const DEFAULT_TRACES_SAMPLE_RATE = 0.1

// how long a shutdown waits for pending reports to reach Sentry before giving up
const SHUTDOWN_FLUSH_MS = 2000

// how long a threshold alert stays quiet after it is sent, per condition, however long the condition lasts
const THRESHOLD_ALERT_QUIET_MS = HOUR_MS

// when each condition last sent its alert from this process. each replica sends its own warning for a condition,
// and the condition's fingerprint groups the replicas' warnings in one Sentry issue
const thresholdAlertSentAt = new Map<string, number>()

// how many reports of one stage's one error are sent in a window before the rest are skipped, how long the window is,
// and how many errors are tracked
const ERROR_REPORTS_PER_WINDOW = 10
const ERROR_REPORT_WINDOW_MS = HOUR_MS
const ERROR_REPORT_KEY_LIMIT = 1000

// how many characters of an error's message name it, so one error with a long, varying message counts once
const ERROR_REPORT_MESSAGE_CHARS = 200

// what one stage's one error has done this hour: when its hour began, how many reports were sent, and how many were
// skipped
export type ErrorReportWindow = { startedAt: number; sentCount: number; skippedCount: number }

// the error report windows to decide from, the key of the error to report, and the time of the report in milliseconds
export type DecideErrorReportOptions = {
	errorReportWindowByKey: Map<string, ErrorReportWindow>
	key: string
	nowMs: number
}

// the error report windows of this process, keyed by stage and message
const errorReportWindows = new Map<string, ErrorReportWindow>()

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

	// sample each request by its path, redact content from errors and transactions alike,
	// and keep personal data off by default
	const tracesSampleRate = Number(Bun.env.SENTRY_TRACES_SAMPLE_RATE ?? DEFAULT_TRACES_SAMPLE_RATE)
	Sentry.init({
		dsn: Bun.env.SENTRY_DSN,
		environment,
		tracesSampler: (samplingContext) =>
			samplingContext.inheritOrSampleWith(toTracesSampleRate({ spanName: samplingContext.name, tracesSampleRate })),
		dataCollection: {
			userInfo: false,
			cookies: false,
			httpHeaders: false,
			httpBodies: [],
			urlQueryParams: false,
			genAI: { inputs: false, outputs: false },
			databaseQueryData: false,
			stackFrameVariables: false,
		},
		beforeSend: redactEvent,
		// a streamed trace skips beforeSendTransaction, so traces send whole, as transactions
		traceLifecycle: "static",
		beforeSendTransaction: redactTransaction,
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
	"podcast-episode",
	"chat",
	"prompt-registry",
	"billing",
	"auth",
	"page-render",
	"api-route",
	"database",
] as const

// one of the stages above
export type ReportedStage = (typeof reportedStages)[number]

/**
 * Reports a failure the caller is already handling, so a failure that never throws an error is still visible.
 */
export function reportError(error: unknown, stage: ReportedStage, extra?: Record<string, string>): void {
	// decide from the error's window, and send the skipped count with the report that reopens a window
	const errorReportDecision = decideErrorReport({
		errorReportWindowByKey: errorReportWindows,
		key: toErrorReportKey(stage, error),
		nowMs: Date.now(),
	})
	if (!errorReportDecision.isSent) {
		return
	}

	// send the report, with the skipped count if the previous hour skipped any
	const reportedExtra =
		errorReportDecision.skippedCount > 0
			? { ...extra, skippedReportCount: String(errorReportDecision.skippedCount) }
			: extra
	Sentry.captureException(error, { tags: { stage }, extra: reportedExtra })
}

/**
 * Decides whether one error report is sent, and with how many reports its key's previous hour skipped.
 */
export function decideErrorReport({ errorReportWindowByKey, key, nowMs }: DecideErrorReportOptions): {
	isSent: boolean
	skippedCount: number
} {
	// a report inside an open hour is sent up to the window's limit and skipped past it
	const errorReportWindow = errorReportWindowByKey.get(key)
	if (errorReportWindow && nowMs - errorReportWindow.startedAt < ERROR_REPORT_WINDOW_MS) {
		if (errorReportWindow.sentCount < ERROR_REPORTS_PER_WINDOW) {
			errorReportWindow.sentCount++
			return { isSent: true, skippedCount: 0 }
		}

		// past the limit, the report is skipped and counted
		errorReportWindow.skippedCount++
		return { isSent: false, skippedCount: 0 }
	}

	// a report that opens an hour is sent with what the hour before skipped. a new error drops the oldest window once the
	// key limit is reached
	if (!errorReportWindow && errorReportWindowByKey.size >= ERROR_REPORT_KEY_LIMIT) {
		errorReportWindowByKey.delete(errorReportWindowByKey.keys().next().value as string)
	}
	errorReportWindowByKey.delete(key)
	errorReportWindowByKey.set(key, { startedAt: nowMs, sentCount: 1, skippedCount: 0 })
	return { isSent: true, skippedCount: errorReportWindow?.skippedCount ?? 0 }
}

// the key one stage's one error counts under: the stage and the start of the error's message
function toErrorReportKey(stage: ReportedStage, error: unknown): string {
	const message = error instanceof Error ? error.message : String(error)
	return `${stage}:${message.slice(0, ERROR_REPORT_MESSAGE_CHARS)}`
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
