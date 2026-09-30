// the workflow that emails a finished Scan's outcome. a scheduled Scan sends its digest one batch at a time, and any
// other Scan sends its report to whoever ran it or created the Topic
import { ActivityFailure, ApplicationFailure, proxyActivities } from "@temporalio/workflow"
import type { ResendFailure } from "../email"
import type { ScanTrigger } from "./runTopicScanActivities"
import type * as emailActivities from "./sendScanEmailActivities"

// the task queue that this workflow and its activities run on, kept apart from the scan activities' slots
export const SCAN_EMAIL_TASK_QUEUE = "scan-emails"

// how long one send may take, and how its retries back off: 15 seconds, doubling up to 10 minutes apart, for at most
// 10 attempts, about 45 minutes in all
const SEND_TIMEOUT_MS = 60 * 1000
const SEND_RETRY_POLICY = {
	initialInterval: 15 * 1000,
	backoffCoefficient: 2,
	maximumInterval: 10 * 60 * 1000,
	maximumAttempts: 10,
}

// planning and each send share the retry policy. an activity marks a failure final if waiting cannot fix it
const { planScanDigest, sendScanDigestBatch, sendScanReport } = proxyActivities<typeof emailActivities>({
	startToCloseTimeout: SEND_TIMEOUT_MS,
	retry: SEND_RETRY_POLICY,
})

// the report of an undelivered send retries a few times, and a report that still fails is left in the worker's log
const { reportUndeliveredScanEmail } = proxyActivities<typeof emailActivities>({
	startToCloseTimeout: SEND_TIMEOUT_MS,
	retry: { maximumAttempts: 3 },
})

// the Scan whose email this is and what asked for it. a manual or creation Scan also names who gets its report
export type ScanEmailWorkflowInput =
	| { trigger: Extract<ScanTrigger, "scheduled">; scanId: string; topicId: string }
	| { trigger: Exclude<ScanTrigger, "scheduled">; scanId: string; topicId: string; reportRecipientUserId: string }

/**
 * Sends a finished Scan's email, the digest one batch at a time or the report to whoever ran the Scan or created the
 * Topic. A send that fails for good or runs out of attempts is reported, and the next batch still goes out.
 */
export async function sendScanEmailWorkflow(scanEmailWorkflowInput: ScanEmailWorkflowInput): Promise<void> {
	// the Scan that every send and report names
	const { scanId, topicId } = scanEmailWorkflowInput

	// a manual or creation Scan sends its report, and a report that does not go out is reported
	if (scanEmailWorkflowInput.trigger !== "scheduled") {
		try {
			await sendScanReport({ scanId, recipientUserId: scanEmailWorkflowInput.reportRecipientUserId })
		} catch (error) {
			await reportUndeliveredSend({ scanId, topicId, emailKind: "manual-scan", batchIndex: null, error })
		}
		return
	}

	// a scheduled Scan plans its digest. a digest that cannot be planned is reported, and nothing is sent
	let recipientUserIdBatches: string[][]
	try {
		recipientUserIdBatches = await planScanDigest(scanId)
	} catch (error) {
		await reportUndeliveredSend({ scanId, topicId, emailKind: "topic-scan", batchIndex: null, error })
		return
	}

	// send each batch on its own, so a batch that fails is reported and the next one still goes out
	for (const [batchIndex, recipientUserIds] of recipientUserIdBatches.entries()) {
		try {
			await sendScanDigestBatch({ scanId, recipientUserIds })
		} catch (error) {
			await reportUndeliveredSend({ scanId, topicId, emailKind: "topic-scan", batchIndex, error })
		}
	}
}

// a send that did not go out, with the failure that its activity ended with
type ReportUndeliveredSendOptions = Omit<emailActivities.UndeliveredScanEmail, "failure"> & { error: unknown }

// report a send that did not go out, with what Resend said about it
async function reportUndeliveredSend({ error, ...undeliveredScanEmail }: ReportUndeliveredSendOptions): Promise<void> {
	await reportUndeliveredScanEmail({ ...undeliveredScanEmail, failure: toResendFailure(error) })
}

// what Resend said about a failed send, read from the activity's failure, or the failure's own message if Resend was
// never reached
function toResendFailure(error: unknown): ResendFailure {
	// an activity's failure wraps what the activity threw
	const failureCause = error instanceof ActivityFailure ? error.cause : error

	// a Resend rejection includes what Resend said as its details
	if (failureCause instanceof ApplicationFailure && failureCause.type === "ResendFailure") {
		const [resendFailure] = failureCause.details as ResendFailure[]
		if (resendFailure) {
			return resendFailure
		}
	}
	return { httpStatus: null, resendError: failureCause instanceof Error ? failureCause.message : String(failureCause) }
}
