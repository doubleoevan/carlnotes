// the activities that email a finished Scan's outcome: planning its digest, sending one digest batch or its report, and
// reporting a send that did not go out. a send that Resend did not accept throws a failure that says whether to retry
import { reportError } from "@shared/monitoring"
import { ApplicationFailure } from "@temporalio/activity"
import type { EmailKind, ResendFailure } from "../email"
import * as notify from "../notify"

// the digest plan throws only on an unexpected error, which the retry policy covers
export { planScanDigest } from "../notify"

/**
 * Sends one digest batch, throwing a failure if Resend did not accept it.
 */
export async function sendScanDigestBatch(
	sendScanDigestBatchOptions: notify.SendScanDigestBatchOptions,
): Promise<void> {
	throwIfNotSent(await notify.sendScanDigestBatch(sendScanDigestBatchOptions))
}

/**
 * Sends a Scan's report to whoever ran the Scan or created the Topic, throwing a failure if Resend did not accept it.
 */
export async function sendScanReport(sendScanReportOptions: notify.SendScanReportOptions): Promise<void> {
	throwIfNotSent(await notify.sendScanReport(sendScanReportOptions))
}

// a scan email that did not go out, with its Scan, Topic, kind, digest batch, and what Resend said
export type UndeliveredScanEmail = {
	scanId: string
	topicId: string
	emailKind: EmailKind
	// null for the report and for the digest's plan, which are not batches
	batchIndex: number | null
	failure: ResendFailure
}

/**
 * Reports a scan email that failed for good or ran out of attempts, naming its Scan and never an address.
 */
export async function reportUndeliveredScanEmail({
	scanId,
	topicId,
	emailKind,
	batchIndex,
	failure,
}: UndeliveredScanEmail): Promise<void> {
	const statusLabel = String(failure.httpStatus ?? "no response")
	console.error(`the ${emailKind} email for scan ${scanId} was not delivered: ${statusLabel} ${failure.resendError}`)
	reportError(new Error("a scan email was not delivered"), "email", {
		scanId,
		topicId,
		emailKind,
		batchIndex: batchIndex === null ? "none" : String(batchIndex),
		status: statusLabel,
		resendError: failure.resendError,
	})
}

// throw a failure for a send that Resend did not accept, retryable after Resend's own wait if another attempt can help
// and final otherwise. the failure includes what Resend said as its details
function throwIfNotSent(scanEmailOutcome: notify.ScanEmailOutcome): void {
	if (scanEmailOutcome.outcome === "accepted" || scanEmailOutcome.outcome === "skipped") {
		return
	}
	const { failure } = scanEmailOutcome
	const retryAfterSeconds = scanEmailOutcome.outcome === "retryable" ? scanEmailOutcome.retryAfterSeconds : null
	throw ApplicationFailure.create({
		message: `resend did not accept the scan email: ${failure.httpStatus ?? "no response"} ${failure.resendError}`,
		type: "ResendFailure",
		nonRetryable: scanEmailOutcome.outcome === "rejected",
		details: [failure],
		nextRetryDelay: retryAfterSeconds === null ? undefined : retryAfterSeconds * 1000,
	})
}
