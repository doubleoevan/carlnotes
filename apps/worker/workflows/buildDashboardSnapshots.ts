// the Dashboard build: the nightly run over every Dashboard with daily count rows in the window, or one Dashboard's
// rebuild after a change to who may see its items, which builds again for each change signaled while it runs. the
// nightly run also deletes daily count rows past the retention

import { toChunks } from "@carlnotes/contracts/arrays"
import type { DashboardSubject } from "@carlnotes/contracts/dashboards"
import { DASHBOARD_REBUILD_SIGNAL } from "@carlnotes/contracts/dashboardWork"
import {
	continueAsNew,
	defineSignal,
	isCancellation,
	log,
	proxyActivities,
	setHandler,
	workflowInfo,
} from "@temporalio/workflow"
import type * as activities from "./buildDashboardSnapshotsActivities"
import type { ChangedDashboardSummary } from "./buildDashboardSnapshotsActivities"

// how many Dashboards one build activity takes, and how many changed summaries one paragraph or share image activity
// takes. 25 paragraphs at the 30 second model limit fit inside the build timeout
const BATCH_SIZE = 25

// the listing and the retention delete are short, and a batch reads a year of daily counts for each of its Dashboards
const LIST_TIMEOUT_MS = 5 * 60 * 1000
const BUILD_TIMEOUT_MS = 15 * 60 * 1000
const ATTEMPTS = 3

// the build's input: the last completed UTC day, and the one Dashboard a rebuild names
export type BuildDashboardSnapshotsWorkflowInput = {
	lastDay: string
	subject?: DashboardSubject
}

// the listing and the retention delete may retry
const { listDashboardSubjectsActivity, deleteExpiredDailyCountsActivity } = proxyActivities<typeof activities>({
	startToCloseTimeout: LIST_TIMEOUT_MS,
	retry: { maximumAttempts: ATTEMPTS },
})

// a batch's build and the share images may retry. a second write of an unchanged snapshot or image changes nothing
const { buildDashboardSnapshotsActivity, drawDashboardShareImagesActivity } = proxyActivities<typeof activities>({
	startToCloseTimeout: BUILD_TIMEOUT_MS,
	retry: { maximumAttempts: ATTEMPTS },
})

// the paragraphs run once. a retry would spend the day's allowance again, and a missed paragraph keeps the last one
const { writeDashboardParagraphsActivity } = proxyActivities<typeof activities>({
	startToCloseTimeout: BUILD_TIMEOUT_MS,
	retry: { maximumAttempts: 1 },
})

// the signal a running rebuild gets for each later change, with the last completed day at that change
const rebuildRequested = defineSignal<[string]>(DASHBOARD_REBUILD_SIGNAL)

/**
 * Builds the snapshots of one Dashboard, or of every Dashboard with daily count rows in the window, then writes the
 * changed summaries' paragraphs and draws their share images.
 */
export async function buildDashboardSnapshotsWorkflow({
	lastDay,
	subject,
}: BuildDashboardSnapshotsWorkflowInput): Promise<void> {
	if (subject) {
		return rebuildDashboard(subject, lastDay)
	}

	// every Dashboard with daily count rows, a batch at a time.
	// ponytail: one payload lists every Dashboard and one history holds the run, which Temporal's 2 MB payload limit
	// fits to about 28,000 Dashboards. page the listing and continue as new per page past that
	const subjects = await listDashboardSubjectsActivity(lastDay)
	const changedSummaries: ChangedDashboardSummary[] = []
	for (const batchSubjects of toChunks(subjects, BATCH_SIZE)) {
		changedSummaries.push(...(await buildDashboardSnapshotsActivity({ subjects: batchSubjects, lastDay })))
	}

	// the changed summaries' paragraphs and share images, then the daily count rows past the retention
	await finishChangedSummaries(changedSummaries, lastDay)
	await deleteExpiredDailyCountsActivity(lastDay)
}

// build one Dashboard, then build it again for each change signaled during a build, on the last completed day that the
// latest change names. a build that loaded the daily counts before a change skips its write, and the next build writes
async function rebuildDashboard(subject: DashboardSubject, lastDay: string): Promise<void> {
	// the start's own signal reaches the handler before the first build, and each build clears the request it serves
	let rebuildLastDay = lastDay
	let isRebuildRequested = false
	setHandler(rebuildRequested, (requestedLastDay) => {
		rebuildLastDay = requestedLastDay
		isRebuildRequested = true
	})

	do {
		// build, then write the paragraphs and draw the share images
		isRebuildRequested = false
		const changedSummaries = await buildDashboardSnapshotsActivity({ subjects: [subject], lastDay: rebuildLastDay })
		await finishChangedSummaries(changedSummaries, rebuildLastDay)

		// a long run of changes builds on in a fresh history
		if (isRebuildRequested && workflowInfo().continueAsNewSuggested) {
			return continueAsNew<typeof buildDashboardSnapshotsWorkflow>({ lastDay: rebuildLastDay, subject })
		}
	} while (isRebuildRequested)
}

// write the changed summaries' paragraphs and draw their share images, a batch at a time. a failed batch is logged and
// skipped, and its summaries keep their last paragraph and image
async function finishChangedSummaries(changedSummaries: ChangedDashboardSummary[], lastDay: string): Promise<void> {
	for (const batchSummaries of toChunks(changedSummaries, BATCH_SIZE)) {
		await runBatchActivity("paragraph", () =>
			writeDashboardParagraphsActivity({ changedSummaries: batchSummaries, lastDay }),
		)
		await runBatchActivity("share image", () => drawDashboardShareImagesActivity(batchSummaries))
	}
}

// run one batch's activity, and log a failure other than a cancellation
async function runBatchActivity(batchName: string, runActivity: () => Promise<unknown>): Promise<void> {
	try {
		await runActivity()
	} catch (error) {
		// a cancelled build stops here, and the next batch runs after any other failure
		if (isCancellation(error)) {
			throw error
		}
		log.warn(`a dashboard ${batchName} batch failed`, { error: String(error) })
	}
}
