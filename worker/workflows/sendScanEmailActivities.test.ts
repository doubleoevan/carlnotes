// scan email activity tests: the failure each send outcome throws, and the report of an email that did not go out
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as monitoring from "@shared/monitoring"
import { ApplicationFailure } from "@temporalio/activity"
import * as notify from "../notify"
import { reportUndeliveredScanEmail, sendScanDigestBatch } from "./sendScanEmailActivities"

// put every stubbed send and report back after each test
afterEach(() => {
	mock.restore()
})

// run the batch activity with the send stubbed to the given outcome, returning what it threw, if anything
async function toThrownFailure(scanEmailOutcome: notify.ScanEmailOutcome): Promise<ApplicationFailure | undefined> {
	spyOn(notify, "sendScanDigestBatch").mockResolvedValue(scanEmailOutcome)

	// run the activity and catch the failure it throws
	try {
		await sendScanDigestBatch({ scanId: "scan-1", recipientUserIds: ["user-1"] })
		return undefined
	} catch (error) {
		return error as ApplicationFailure
	}
}

// a batch that went out, or that had no one left to send to, is done
test("an accepted or skipped batch throws nothing", async () => {
	expect(await toThrownFailure({ outcome: "accepted" })).toBeUndefined()
	expect(await toThrownFailure({ outcome: "skipped" })).toBeUndefined()
})

// a rate limit is retried once Resend's own wait has passed
test("a rate-limited batch throws a retryable failure that waits for the retry-after", async () => {
	const thrownFailure = await toThrownFailure({
		outcome: "retryable",
		failure: { httpStatus: 429, resendError: "rate_limit_exceeded" },
		retryAfterSeconds: 3,
	})
	expect(thrownFailure).toBeInstanceOf(ApplicationFailure)
	expect(thrownFailure?.nonRetryable).toBe(false)
	expect(thrownFailure?.nextRetryDelay).toBe(3000)
})

// a 5xx has no wait of its own, so the retry policy's backoff decides
test("a 5xx throws a retryable failure on the policy's backoff", async () => {
	const thrownFailure = await toThrownFailure({
		outcome: "retryable",
		failure: { httpStatus: 503, resendError: "service_unavailable" },
		retryAfterSeconds: null,
	})
	expect(thrownFailure?.nonRetryable).toBe(false)
	expect(thrownFailure?.nextRetryDelay).toBeUndefined()
})

// a rejection no retry can fix ends the batch at once, with what Resend said for the report
test("a rejected batch throws a final failure that includes what Resend said", async () => {
	const thrownFailure = await toThrownFailure({
		outcome: "rejected",
		failure: { httpStatus: 400, resendError: "validation_error" },
	})
	expect(thrownFailure?.nonRetryable).toBe(true)
	expect(thrownFailure?.details).toEqual([{ httpStatus: 400, resendError: "validation_error" }])
})

// the report names the Scan, the Topic, the kind, the batch, and what Resend said, and never an address
test("an undelivered email is reported with its Scan and batch", async () => {
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	await reportUndeliveredScanEmail({
		scanId: "scan-1",
		topicId: "topic-1",
		emailKind: "topic-scan",
		batchIndex: 2,
		failure: { httpStatus: 503, resendError: "service_unavailable" },
	})
	expect(reportErrorSpy).toHaveBeenCalledWith(expect.any(Error), "email", {
		scanId: "scan-1",
		topicId: "topic-1",
		emailKind: "topic-scan",
		batchIndex: "2",
		status: "503",
		resendError: "service_unavailable",
	})
})
