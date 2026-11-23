// scans every Topic scheduled by its frequency and emails its new Findings to subscribers

import { toLastCompletedUtcDay } from "@carlnotes/contracts/time"
import { sizeConnectionPool } from "@carlnotes/db"
import { loadDailySpendCutoffState } from "@carlnotes/db/dailySpendCutoffs"
import { runWithJobLease } from "@carlnotes/db/jobLease"
import { shutdownTelemetry, startTelemetry } from "@carlnotes/models/telemetry"
import { reportFirecrawlCreditSpent } from "@carlnotes/pipeline/firecrawlCredit"
import { recoverPersonalSourcesWork } from "@carlnotes/pipeline/personalSources/work"
import { screenPendingSources } from "@carlnotes/pipeline/screen"
import { reapStaleScans } from "@carlnotes/pipeline/staleScans"
import { startDashboardSnapshotsWorkflow } from "@carlnotes/pipeline/temporalClient"
import { checkUncheckedImages } from "@carlnotes/pipeline/uncheckedImageChecks"
import { shutdownAnalytics } from "@carlnotes/server/analytics"
import { toPositiveInteger } from "@carlnotes/server/envSettings"
import {
	limitReportsBySlot,
	type ReportedStage,
	reportError,
	shutdownMonitoring,
	startMonitoring,
} from "@carlnotes/server/monitoring"
import { reportDailySpend } from "./dailySpend"
import { sendNotificationsEmails } from "./notificationsEmails"
import { reapStaleWork } from "./reapedKinds"
import { remindOpenReports } from "./reportReminders"
import { retryPendingObjectDeletions } from "./retryPendingObjectDeletions"
import { readScanDispatchCounts, reportTopicVideoQueue, startUndispatchedScans } from "./scanQueue"
import { startScheduledTopicScanPages, type TopicSweepSummary } from "./scheduledTopicScans"
import { takeSweepReportSlot } from "./sweepReportSlots"
import { syncViewerCounts } from "./syncViewerCounts"

// the sweep's job name, so two sweeps cannot run at once
const TOPIC_SWEEP_JOB = "scheduled-scan-sweep"

/**
 * Runs one scheduled sweep under its lease or returns null if another sweep holds the lease.
 * A sweep that loses its lease stops before its next stage or Topic and rejects with a JobLeaseLostError.
 */
export function runScheduledTopicScans(): Promise<TopicSweepSummary | null> {
	return runWithJobLease({ jobName: TOPIC_SWEEP_JOB, runTask: sweepScheduledTopics })
}

// one sweep. read the daily spend cutoffs, report the queue, dispatch what was never started, reap the Scans that went
// quiet and the other rows left in progress, screen new Sources, then start each scheduled Topic's Scan, unless the
// queue could not be read. each stage first checks that the sweep still holds its lease
async function sweepScheduledTopics(signal: AbortSignal): Promise<TopicSweepSummary> {
	// read the daily spend cutoffs once for the whole sweep
	signal.throwIfAborted()
	const cutoffState = await loadDailySpendCutoffState()

	// report a scan queue that nothing polls, and a backlog past its limit, and size this sweep's starts by each
	// queue's backlog: the rows that were never dispatched by the Scan queue's, and the scheduled Scans by their own
	signal.throwIfAborted()
	const { isScanQueueRead, dispatchableScanCount, dispatchableScheduledScanCount } = await readScanDispatchCounts()

	// report a film queue that nothing polls, unless the scan queue's read already found Temporal out of reach
	if (isScanQueueRead) {
		await reportTopicVideoQueue()
	}

	// start what was opened and never dispatched within the dispatch count, then reap what has gone quiet
	signal.throwIfAborted()
	const waitingScanTopicIds = await startUndispatchedScans({ cutoffState, dispatchableScanCount })
	signal.throwIfAborted()
	await reapStaleScans()

	// reap the other rows left in progress past their workflow's longest run
	signal.throwIfAborted()
	await reapStaleWork(signal)

	// a Source row is written before its screen starts
	signal.throwIfAborted()
	await screenPendingSources()

	// start the scheduled Topics' Scans, as many as their queue's backlog leaves of the dispatch limit
	signal.throwIfAborted()
	const topicSweepSummary = await startScheduledTopicScanPages({
		now: new Date(),
		cutoffState,
		waitingScanTopicIds,
		dispatchableScanCount: dispatchableScheduledScanCount,
		signal,
	})

	// ordinary scheduled Scans take precedence over recovery after an outage
	signal.throwIfAborted()
	await recoverPersonalSourcesWork(signal)

	// log a summary line for the sweep
	const {
		started,
		skippedWaitingScan,
		skippedOverDailySpendCutoff,
		skippedOverQuota,
		skippedOverDailyLimit,
		skippedOverDailyScanCutoff,
		skippedOverBudget,
		skippedOverBacklog,
		skippedTemporalOutage,
		failed,
	} = topicSweepSummary
	console.log(
		`scheduled scan sweep: ${started} started, ${skippedWaitingScan} with a Scan still waiting, ${skippedOverDailySpendCutoff} past the scheduled scans cutoff, ${skippedOverQuota} over quota, ${skippedOverDailyLimit} over the daily topic limit, ${skippedOverDailyScanCutoff} weekly past the daily scans cutoff, ${skippedOverBudget} over budget, ${skippedOverBacklog} left for the next sweep behind the backlog, ${skippedTemporalOutage} left for the next sweep because Temporal could not be reached, ${failed} could not start, of ${topicSweepSummary.scheduled} scheduled`,
	)
	return topicSweepSummary
}

// one stage of the sweep: its name, the stage that its failure is reported under with what else the report says, and
// the work
type SweepStage = {
	name: string
	reportedStage: ReportedStage
	extra?: Record<string, string>
	run: () => Promise<unknown>
}

// the sweep's stages in order: the leased sweep and the leased viewer count sync, which also saves the daily counts,
// then, once the leases are released, the pending object deletions, the unchecked images, the reminder of reports
// left open, the day's notifications emails, the Dashboard build for the last completed UTC day, the day's spend, and
// a Firecrawl credit that a review found spent
const SWEEP_STAGES: SweepStage[] = [
	{ name: "scheduled scans", reportedStage: "scheduled-scan", run: () => runScheduledTopicScans() },
	{ name: "viewer counts", reportedStage: "database", run: () => syncViewerCounts() },
	{ name: "object deletions", reportedStage: "object-storage", run: () => retryPendingObjectDeletions() },
	{ name: "unchecked images", reportedStage: "unchecked-image", run: () => checkUncheckedImages() },
	{ name: "report reminders", reportedStage: "email", run: () => remindOpenReports() },
	// the next two keep what their reports said before each stage had a try of its own
	{
		name: "notifications emails",
		reportedStage: "email",
		extra: { emailKind: "notifications" },
		run: () => sendNotificationsEmails(),
	},
	{
		name: "dashboard build",
		reportedStage: "worker",
		extra: { workflow: "dashboard-snapshots" },
		run: () => startDashboardSnapshotsWorkflow(toLastCompletedUtcDay()),
	},
	{ name: "daily spend", reportedStage: "scheduled-scan", run: () => reportDailySpend() },
	{ name: "firecrawl credit", reportedStage: "fetch", run: () => reportFirecrawlCreditSpent() },
]

/**
 * Runs every stage of one sweep in order, each in its own try. A stage that throws is reported under its stage and
 * the stages after it still run, so one failure never skips the viewer counts, the daily counts, the deletions, the
 * emails, or the day's spend. Returns the names of the stages that threw.
 */
export async function runSweep(): Promise<string[]> {
	const failedStageNames: string[] = []
	for (const sweepStage of SWEEP_STAGES) {
		try {
			await sweepStage.run()
		} catch (error) {
			// report the stage's failure and go on to the next stage
			console.error(`the sweep's ${sweepStage.name} stage failed`, error)
			reportError(error, sweepStage.reportedStage, { ...sweepStage.extra, sweepStage: sweepStage.name })
			failedStageNames.push(sweepStage.name)
		}
	}
	return failedStageNames
}

// run one sweep and exit, so a platform cron can invoke this file on a schedule
if (import.meta.main) {
	// monitor, then trace, the scan path, in that order so Langfuse keeps its own provider beside Sentry's.
	// both do nothing without their keys. then size the connection pool from the database
	startMonitoring()
	startTelemetry()
	await sizeConnectionPool()

	// keep on looping if an interval is set, and otherwise run one sweep and exit
	const intervalMs = toPositiveInteger(Bun.env.SCHEDULE_INTERVAL_MS, 0)
	if (intervalMs > 0) {
		await runSweep()
		setInterval(() => void runSweep(), intervalMs)
	} else {
		await runCronSweep()
	}
}

// run one sweep as the cron's process. every cron run is a new process, so each of its reports takes the hour's slot
// in Redis before it is sent, and what it reported is flushed before it exits, whatever the sweep did
async function runCronSweep(): Promise<void> {
	limitReportsBySlot(takeSweepReportSlot)
	try {
		// a run with a failed stage exits with code 1, so the sweep's cron monitor counts the run as failed
		const failedStageNames = await runSweep()
		if (failedStageNames.length > 0) {
			process.exitCode = 1
		}
	} finally {
		// the process exits here, so its spans, events, and reports are sent first
		await shutdownTelemetry()
		await shutdownAnalytics()
		await shutdownMonitoring()
	}
}
