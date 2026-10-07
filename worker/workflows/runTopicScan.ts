// the durable Scan: it runs the pipeline's three stages as activities
import {
	CancellationScope,
	getExternalWorkflowHandle,
	isCancellation,
	ParentClosePolicy,
	patched,
	proxyActivities,
	startChild,
} from "@temporalio/workflow"
// a relative import. temporal bundles workflow code with webpack, which has no @shared alias
import { toWorkflowFailureReason } from "../../shared/scanFailure"
// the workflow that renders a succeeded Scan's Podcast Episode, and the queue that it runs on
import {
	PODCAST_EPISODE_TASK_QUEUE,
	type RenderPodcastEpisodeWorkflowInput,
	renderPodcastEpisodeWorkflow,
} from "./renderPodcastEpisode"
import type * as scanActivities from "./runTopicScanActivities"
// the workflow that emails a completed Scan's outcome, the queue that it runs on, and the signal that ends its wait
import {
	podcastEpisodeOutlineSettledSignal,
	SCAN_EMAIL_TASK_QUEUE,
	type ScanEmailWorkflowInput,
	sendScanEmailWorkflow,
} from "./sendScanEmail"
// the attempt counts the retry policies that the temporal activities read
import {
	FINISH_ATTEMPTS,
	FINISH_TIMEOUT_MS,
	FINISH_TOTAL_TIMEOUT_MS,
	HEARTBEAT_TIMEOUT_MS,
	INGEST_ATTEMPTS,
	INGEST_TIMEOUT_MS,
	INGEST_TOTAL_TIMEOUT_MS,
	REVIEW_ATTEMPTS,
	REVIEW_TIMEOUT_MS,
	REVIEW_TOTAL_TIMEOUT_MS,
} from "./stageTimeouts"

// ingest activity may be retried: it dedupes on canonical url
const { ingestForScan } = proxyActivities<typeof scanActivities>({
	startToCloseTimeout: INGEST_TIMEOUT_MS,
	scheduleToCloseTimeout: INGEST_TOTAL_TIMEOUT_MS,
	heartbeatTimeout: HEARTBEAT_TIMEOUT_MS,
	retry: { maximumAttempts: INGEST_ATTEMPTS },
})

// review pays for the fetches and the model calls, so it gets one retry and no more
const { reviewForScan } = proxyActivities<typeof scanActivities>({
	startToCloseTimeout: REVIEW_TIMEOUT_MS,
	scheduleToCloseTimeout: REVIEW_TOTAL_TIMEOUT_MS,
	heartbeatTimeout: HEARTBEAT_TIMEOUT_MS,
	retry: { maximumAttempts: REVIEW_ATTEMPTS },
})

// the closing writes are idempotent, so they may retry. they are short enough not to need a heartbeat
const { finishScan, failScan, stopScan, reportScanEmailNotStarted, reportPodcastEpisodeRenderNotStarted } =
	proxyActivities<typeof scanActivities>({
		startToCloseTimeout: FINISH_TIMEOUT_MS,
		scheduleToCloseTimeout: FINISH_TOTAL_TIMEOUT_MS,
		retry: { maximumAttempts: FINISH_ATTEMPTS },
	})

/**
 * Runs one Topic's Scan to a terminal status. The Scan row is opened by whoever started this workflow,
 * so this fills in that Scan row instead of writing its own.
 */
export async function runTopicScanWorkflow(
	scanId: string,
	topicId: string,
	ownerId: string,
	trigger: scanActivities.ScanTrigger,
): Promise<void> {
	// the Budget spent so far, and the status that the finishScan activity saved
	let spentBudget: scanActivities.IngestStageResult["budget"] | undefined
	let finishedScanStatus: scanActivities.IngestStageResult["status"] | undefined

	// a stage that throws an error ends the Scan as failed with whatever it had already spent
	try {
		const ingestResult = await ingestForScan(scanId, topicId)
		spentBudget = ingestResult.budget

		const reviewResult = await reviewForScan(scanId, topicId, ownerId, ingestResult, ingestResult.budget)
		spentBudget = reviewResult.budget

		// a cancelled stage returns what it had instead of throwing an error
		if (CancellationScope.current().consideredCancelled) {
			await stopCancelledScan(scanId)
			return
		}
		await finishScan(scanId, topicId, ownerId, ingestResult, reviewResult)
		finishedScanStatus = ingestResult.status
	} catch (error) {
		// a cancel that lands while a stage is waiting rejects that stage instead of returning through it
		if (isCancellation(error)) {
			await stopCancelledScan(scanId)
			return
		}
		await failScan(scanId, toWorkflowFailureReason(error), spentBudget)
	}

	// a succeeded Scan starts its podcast episode render in its own workflow.
	// a Scan replaying from before the patch started no podcast episode workflow
	const isPodcastEpisodeReadyToRender = finishedScanStatus === "succeeded" && patched("episode-render-workflow")

	// email a completed Scan's outcome from its own workflow, outside the try so nothing here can fail the Scan.
	// a Scan replaying a closing write from before the patch already sent its email, so the patch marker skips the start
	const isScanEmailReadyToSend = trigger !== "scheduled" || finishedScanStatus === "succeeded"
	if (finishedScanStatus !== undefined && isScanEmailReadyToSend && patched("scan-email-workflow")) {
		// a scheduled Scan's digest goes to the subscribers, and any other Scan reports to whoever ran it
		// or created the Topic. either email waits for the outline of a Podcast Episode that is ready to render
		const scanEmailInput = { scanId, topicId, isPodcastEpisodeReadyToRender }
		await startScanEmail(
			trigger === "scheduled"
				? { ...scanEmailInput, trigger }
				: { ...scanEmailInput, trigger, reportRecipientUserId: ownerId },
		)
	}

	// start the podcast episode render after the email workflow, so the email workflow exists before the outline signal.
	// the Podcast Episode bills the Scan's owner
	if (isPodcastEpisodeReadyToRender) {
		const isPodcastEpisodeRenderStarted = await startPodcastEpisodeRender({
			scanId,
			topicId,
			billedUserId: ownerId,
			trigger,
		})

		// end the email's wait if the podcast episode render never started
		if (!isPodcastEpisodeRenderStarted) {
			await signalPodcastEpisodeOutlineSettled(scanId)
		}
	}
}

// save a Scan the user cancelled
function stopCancelledScan(scanId: string): Promise<void> {
	return CancellationScope.nonCancellable(() => stopScan(scanId))
}

// start the Scan's email as a child that outlives this workflow, so the Topic's next Scan never waits on it,
// and return its handle if this call started it. an existing child is left alone, and any other failure is reported
async function startScanEmail(scanEmailWorkflowInput: ScanEmailWorkflowInput): Promise<void> {
	try {
		await startChild(sendScanEmailWorkflow, {
			workflowId: toScanEmailWorkflowId(scanEmailWorkflowInput.scanId),
			taskQueue: SCAN_EMAIL_TASK_QUEUE,
			parentClosePolicy: ParentClosePolicy.ABANDON,
			args: [scanEmailWorkflowInput],
		})
	} catch (error) {
		// a child with this id is the Scan's email, already on its way
		if (error instanceof Error && error.name === "WorkflowExecutionAlreadyStartedError") {
			return
		}
		await reportScanEmailNotStarted(scanEmailWorkflowInput.scanId, toWorkflowFailureReason(error))
	}
}

// the id of a Scan's email workflow
function toScanEmailWorkflowId(scanId: string): string {
	return `scan-email-${scanId}`
}

// end the wait of the Scan's email workflow for the podcast episode outline, through the workflow's id.
// an email workflow that an earlier run of this workflow started gets the signal too
async function signalPodcastEpisodeOutlineSettled(scanId: string): Promise<void> {
	try {
		await getExternalWorkflowHandle(toScanEmailWorkflowId(scanId)).signal(podcastEpisodeOutlineSettledSignal)
	} catch {
		// an email workflow that already finished, or never started, has no wait to end
	}
}

// start the podcast episode render as a child that outlives this workflow, and return whether a render is running.
// a child that already exists is left alone, and any other failure to start is reported
async function startPodcastEpisodeRender(
	renderPodcastEpisodeWorkflowInput: RenderPodcastEpisodeWorkflowInput,
): Promise<boolean> {
	try {
		await startChild(renderPodcastEpisodeWorkflow, {
			workflowId: `episode-${renderPodcastEpisodeWorkflowInput.scanId}`,
			taskQueue: PODCAST_EPISODE_TASK_QUEUE,
			parentClosePolicy: ParentClosePolicy.ABANDON,
			args: [renderPodcastEpisodeWorkflowInput],
		})
		return true
	} catch (error) {
		// a child with this id is the Scan's Podcast Episode, already rendering
		if (error instanceof Error && error.name === "WorkflowExecutionAlreadyStartedError") {
			return true
		}
		await reportPodcastEpisodeRenderNotStarted(renderPodcastEpisodeWorkflowInput.scanId, toWorkflowFailureReason(error))
		return false
	}
}
