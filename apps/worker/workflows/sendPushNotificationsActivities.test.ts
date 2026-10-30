// push activity tests: the failure each send outcome throws, and the report of a push that did not go out
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { PushOutcome } from "@carlnotes/pipeline/pushDelivery"
import * as pushNotify from "@carlnotes/pipeline/pushNotify"
import * as monitoring from "@carlnotes/server/monitoring"
import { ApplicationFailure } from "@temporalio/activity"
import { reportPushFailure, sendChatMentionPush, sendScanPush } from "./sendPushNotificationsActivities"

// put every stubbed send and report back after each test
afterEach(() => {
	mock.restore()
})

// run the Scan push activity with the send stubbed to the given outcome, returning what it threw, if anything
async function toThrownFailure(pushOutcome: PushOutcome): Promise<ApplicationFailure | undefined> {
	spyOn(pushNotify, "sendScanPush").mockResolvedValue(pushOutcome)

	// run the activity and catch the failure it throws
	try {
		await sendScanPush("scan-1")
		return undefined
	} catch (error) {
		return error as ApplicationFailure
	}
}

// a push that went out, or that had no one to reach, is done
test("a sent or skipped push throws nothing", async () => {
	expect(await toThrownFailure({ outcome: "sent", acceptedCount: 2 })).toBeUndefined()
	expect(await toThrownFailure({ outcome: "skipped" })).toBeUndefined()
})

// a retryable push is retried by the policy, and a rejected one is final, each with what the service said
test("a retryable push throws a retryable failure and a rejected one a final failure", async () => {
	const retryableFailure = await toThrownFailure({ outcome: "retryable", pushError: "MessageRateExceeded" })
	expect(retryableFailure).toBeInstanceOf(ApplicationFailure)
	expect(retryableFailure?.nonRetryable).toBe(false)
	expect(retryableFailure?.type).toBe("PushFailure")
	expect(retryableFailure?.details).toEqual(["MessageRateExceeded"])

	// a rejected push is final
	const rejectedFailure = await toThrownFailure({ outcome: "rejected", pushError: "InvalidCredentials" })
	expect(rejectedFailure?.nonRetryable).toBe(true)
})

// the mention push sends for its message
test("the mention push activity sends for its room message", async () => {
	const sendSpy = spyOn(pushNotify, "sendChatMentionPush").mockResolvedValue({ outcome: "skipped" })
	await sendChatMentionPush(44)
	expect(sendSpy.mock.calls[0]?.[0]).toBe(44)
})

// a failed push is reported with its event and stage, and never a token
test("a failed push is reported by its event and stage", async () => {
	// the report, with the worker's log quiet
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	spyOn(console, "error").mockImplementation(() => {})
	await reportPushFailure({
		pushEvent: { kind: "chat-mention", chatMessageId: 44 },
		stage: "receipts",
		pushError: "temporal timeout",
	})

	// the tags name the event, never a phone
	expect(reportErrorSpy).toHaveBeenCalledWith(expect.any(Error), "push", {
		kind: "chat-mention",
		eventId: "44",
		stage: "receipts",
		pushError: "temporal timeout",
	})
})
