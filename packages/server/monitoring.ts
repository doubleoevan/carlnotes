// error monitoring through Sentry: its start, the error reports and their hourly limit, and the threshold warnings

import type { ClientTelemetry } from "@carlnotes/contracts/clientTelemetry"
import { HOUR_MS } from "@carlnotes/contracts/time"
import * as Sentry from "@sentry/bun"
import { redactEvent, redactTransaction, withoutUrlSecrets } from "./monitoringRedaction"
import { toTracesSampleRate } from "./monitoringTracing"

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

// takes a report's slot in a store that outlives the process, by the report's key, and returns whether to send the
// report
export type TakeReportSlot = (reportKey: string) => Promise<boolean>

// the slot that each report of this process takes before it is sent, or null in a process that runs long enough for
// its own hourly counts to hold, and the reports still waiting on their slot
let takeReportSlot: TakeReportSlot | null = null
const waitingReports = new Set<Promise<void>>()

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
		release: toSentryRelease(Bun.env),
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

/**
 * Returns the release a report is tagged with: SENTRY_RELEASE, or the commit SHA Northflank deployed, or none.
 */
export function toSentryRelease(env: Record<string, string | undefined>): string | undefined {
	return env.SENTRY_RELEASE || env.NF_DEPLOYMENT_SHA || undefined
}

// the pipeline stages that report a failure, named so Sentry can group them the way the pipeline reads
const reportedStages = [
	"ingest",
	"embed-filter",
	"fetch",
	"score",
	"object-storage",
	"scan-report",
	"scheduled-scan",
	"manual-scan",
	"first-scan",
	"source-screen",
	"email",
	"push",
	"podcast-episode",
	"topic-video",
	"topic-image",
	"unchecked-image",
	"chat",
	"updates",
	"prompt-registry",
	"billing",
	"auth",
	"page-render",
	"api-route",
	"database",
	"startup",
	"worker",
	"dashboard",
	"job",
] as const

// one of the stages above
export type ReportedStage = (typeof reportedStages)[number]

/**
 * Returns what a log line may say about a failed call: its name, its message, and the status a model call's error
 * has. A model call's error also holds the request it sent, which is the user's chat text, and that never reaches a log.
 */
export function toLoggableError(error: unknown): string {
	if (!(error instanceof Error)) {
		return String(error)
	}
	// a model call's error names the status the proxy answered
	const { statusCode } = error as { statusCode?: unknown }
	return typeof statusCode === "number"
		? `${error.name}: ${error.message} (${statusCode})`
		: `${error.name}: ${error.message}`
}

/**
 * Reports a failure the caller is already handling, so a failure that never throws an error is still visible.
 */
export function reportError(error: unknown, stage: ReportedStage, extra?: Record<string, string>): void {
	// decide from the error's window, and send the skipped count with the report that reopens a window
	const errorReportKey = toErrorReportKey(stage, error)
	const errorReportDecision = decideErrorReport({
		errorReportWindowByKey: errorReportWindows,
		key: errorReportKey,
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
	sendReport({
		reportKey: `error:${errorReportKey}`,
		send: () => Sentry.captureException(error, { tags: { stage }, extra: reportedExtra }),
	})

	// the report that reaches the hour's limit also warns that the stage's error is looping. the ten reports alone stay
	// under an error rate alert, and the alert on threshold warnings hears this one
	if (errorReportDecision.isLimitReached) {
		reportThresholdCrossing({
			condition: "error-loop",
			message: "one stage's error repeated to the hourly report limit",
			values: { sentReportCount: ERROR_REPORTS_PER_WINDOW },
			stage,
		})
	}
}

/**
 * Makes each report and threshold warning of this process take a slot before it is sent, or stops that with null.
 * A process that is new on every run sets it, because the hourly counts in its memory start from zero each time.
 */
export function limitReportsBySlot(nextTakeReportSlot: TakeReportSlot | null): void {
	takeReportSlot = nextTakeReportSlot
}

/**
 * Forgets what this process has reported: each error's window and when each condition last sent its alert.
 */
export function clearReportHistory(): void {
	errorReportWindows.clear()
	thresholdAlertSentAt.clear()
}

// a report's key, and the call that sends the report to Sentry
type SendReportOptions = { reportKey: string; send: () => void }

// send a report at once, or once it has taken its slot in a process that takes one. a report whose slot another report
// holds is not sent, and a report whose slot could not be asked for is sent
function sendReport({ reportKey, send }: SendReportOptions): void {
	if (!takeReportSlot) {
		send()
		return
	}

	// ask for the slot, and keep the wait so a shutdown finishes it before it flushes
	const waitingReport: Promise<void> = takeReportSlot(reportKey)
		.catch(() => true)
		.then((isSlotTaken) => {
			// the report that took the slot, or that could not ask, is sent
			if (isSlotTaken) {
				send()
			}
		})
		.finally(() => waitingReports.delete(waitingReport))
	waitingReports.add(waitingReport)
}

/**
 * Decides whether one error report is sent, with how many reports its key's previous hour skipped, and whether it is
 * the report that reaches the hour's limit.
 */
export function decideErrorReport({ errorReportWindowByKey, key, nowMs }: DecideErrorReportOptions): {
	isSent: boolean
	skippedCount: number
	isLimitReached: boolean
} {
	// a report inside an open hour is sent up to the window's limit and skipped past it
	const errorReportWindow = errorReportWindowByKey.get(key)
	if (errorReportWindow && nowMs - errorReportWindow.startedAt < ERROR_REPORT_WINDOW_MS) {
		if (errorReportWindow.sentCount < ERROR_REPORTS_PER_WINDOW) {
			errorReportWindow.sentCount++
			const isLimitReached = errorReportWindow.sentCount === ERROR_REPORTS_PER_WINDOW
			return { isSent: true, skippedCount: 0, isLimitReached }
		}

		// past the limit, the report is skipped and counted
		errorReportWindow.skippedCount++
		return { isSent: false, skippedCount: 0, isLimitReached: false }
	}

	// a report that opens an hour is sent with what the hour before skipped. a new error drops the oldest window once the
	// key limit is reached
	if (!errorReportWindow && errorReportWindowByKey.size >= ERROR_REPORT_KEY_LIMIT) {
		errorReportWindowByKey.delete(errorReportWindowByKey.keys().next().value as string)
	}
	errorReportWindowByKey.delete(key)
	errorReportWindowByKey.set(key, { startedAt: nowMs, sentCount: 1, skippedCount: 0 })
	return { isSent: true, skippedCount: errorReportWindow?.skippedCount ?? 0, isLimitReached: false }
}

// the key one stage's one error counts under: the stage and the start of the error's message
function toErrorReportKey(stage: ReportedStage, error: unknown): string {
	const message = error instanceof Error ? error.message : String(error)
	return `${stage}:${message.slice(0, ERROR_REPORT_MESSAGE_CHARS)}`
}

// a gauge that crossed its threshold: the condition that names its issue, the message, the measured values, and, for
// a looping error, the stage that reported it, which has an hour of its own
export type ThresholdCrossing = {
	condition: string
	message: string
	values: Record<string, number | null>
	stage?: ReportedStage
}

/**
 * Sends one Sentry warning for a crossed threshold, grouped as its condition's own issue and tagged for the alert rule,
 * at most once an hour per condition. Returns whether this process's own hour let the warning through, which a process
 * that takes a slot then sends only if the warning takes its condition's slot.
 */
export function reportThresholdCrossing(thresholdCrossing: ThresholdCrossing, now = Date.now()): boolean {
	// a condition that alerted within the hour stays quiet, so an hour of waiting requests sends one warning, not sixty.
	// a condition with a stage is quiet for that stage alone
	const { condition, stage } = thresholdCrossing
	const alertKey = stage ? `${condition}:${stage}` : condition
	const sentAt = thresholdAlertSentAt.get(alertKey)
	if (sentAt !== undefined && now - sentAt < THRESHOLD_ALERT_QUIET_MS) {
		return false
	}
	thresholdAlertSentAt.set(alertKey, now)
	sendReport({
		reportKey: `condition:${alertKey}`,
		send: () => Sentry.captureMessage(thresholdCrossing.message, toThresholdCaptureContext(thresholdCrossing)),
	})
	return true
}

/**
 * Returns how a threshold warning is sent: its level, the fingerprint that groups it by condition,
 * the tags an alert rule matches, and the measured values.
 */
export function toThresholdCaptureContext({ condition, values, stage }: ThresholdCrossing): {
	level: "warning"
	fingerprint: string[]
	tags: Record<string, string>
	extra: Record<string, number | null>
} {
	return {
		level: "warning",
		fingerprint: ["performance", condition],
		tags: { alert: "performance", condition, ...(stage ? { stage } : {}) },
		extra: values,
	}
}

/**
 * Flushes pending reports before a short-lived process exits. Safe to call whether the monitoring started or not.
 */
export async function shutdownMonitoring(): Promise<void> {
	// a report still waiting on its slot is sent or dropped first, so the flush includes it
	await Promise.allSettled(waitingReports)

	// a flush failure must never flip the outcome the run earned
	try {
		await Sentry.flush(SHUTDOWN_FLUSH_MS)
	} catch (error) {
		console.error("monitoring shutdown failed", error)
	}
}

// the error that stops the process, the stage it is reported under, and the line logged before it
type ExitOnFatalErrorOptions = { error: unknown; stage: ReportedStage; message: string }

/**
 * Logs and reports an error that stops the process, waits for the report to send, and exits with code 1.
 */
export async function exitOnFatalError({ error, stage, message }: ExitOnFatalErrorOptions): Promise<void> {
	console.error(message, error)
	reportError(error, stage)
	await shutdownMonitoring()
	process.exit(1)
}
