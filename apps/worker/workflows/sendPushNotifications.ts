// the workflows that push to phones: a scheduled Scan's new Findings, and a room message's chat mentions. each sends
// once with retries, waits for the push service to try delivery, then reads the receipts of what it accepted

import { toActivityApplicationFailure } from "@carlnotes/contracts/scanFailure"
import type { PushEvent } from "@carlnotes/pipeline/pushDelivery"
import { ActivityFailure, proxyActivities, sleep } from "@temporalio/workflow"
import { SEND_RETRY_POLICY, SEND_TIMEOUT_MS } from "./deliveryRetryPolicy"
import type * as pushActivities from "./sendPushNotificationsActivities"

// how long a workflow waits before it reads its receipts, which the push service usually has within 15 minutes
export const PUSH_RECEIPT_WAIT_MS = 15 * 60 * 1000

// how long one send may run in all, and how long it may go between chunks before Temporal cancels it. a chunk is one
// request of 100 phones
const PUSH_SEND_TIMEOUT_MS = 10 * 60 * 1000
const PUSH_SEND_HEARTBEAT_TIMEOUT_MS = 30 * 1000

// each send uses the shared delivery retry policy. an activity marks a failure final if waiting cannot fix it
const { sendScanPush, sendChatMentionPush } = proxyActivities<typeof pushActivities>({
	startToCloseTimeout: PUSH_SEND_TIMEOUT_MS,
	heartbeatTimeout: PUSH_SEND_HEARTBEAT_TIMEOUT_MS,
	retry: SEND_RETRY_POLICY,
})

// the receipt check and the failure report retry up to 3 times
const { checkPushReceipts, reportPushFailure } = proxyActivities<typeof pushActivities>({
	startToCloseTimeout: SEND_TIMEOUT_MS,
	retry: { maximumAttempts: 3 },
})

/**
 * Pushes a scheduled Scan's new Findings to its digest recipients, then reads the receipts.
 */
export async function sendScanPushWorkflow({ scanId }: { scanId: string }): Promise<void> {
	await sendThenCheckReceipts({ kind: "topic-scan", scanId }, () => sendScanPush(scanId))
}

/**
 * Pushes a room message's chat mentions to the members it named, then reads the receipts.
 */
export async function sendChatMentionPushWorkflow({ chatMessageId }: { chatMessageId: number }): Promise<void> {
	await sendThenCheckReceipts({ kind: "chat-mention", chatMessageId }, () => sendChatMentionPush(chatMessageId))
}

// send, reporting a send that failed for good or ran out of attempts, then read the receipts of whatever the push
// service accepted, even from a send that failed partway
async function sendThenCheckReceipts(pushEvent: PushEvent, send: () => Promise<void>): Promise<void> {
	// a failed send is reported, and the accepted part of it still has receipts to read
	try {
		await send()
	} catch (error) {
		await reportPushFailure({ pushEvent, stage: "send", pushError: toPushError(error) })
	}

	// wait for the service to try delivery, then read the receipts, reporting a check that never succeeds
	await sleep(PUSH_RECEIPT_WAIT_MS)
	try {
		await checkPushReceipts(pushEvent)
	} catch (error) {
		await reportPushFailure({ pushEvent, stage: "receipts", pushError: toPushError(error) })
	}
}

// what the push service or the activity said about a failure, read from the activity's failure
function toPushError(error: unknown): string {
	// a push failure includes what the service said as its details
	const applicationFailure = toActivityApplicationFailure(error)
	const [pushError] = (applicationFailure?.type === "PushFailure" ? applicationFailure.details : []) as string[]
	if (pushError) {
		return pushError
	}

	// any other failure is described by the message of what the activity threw, which its activity failure wraps
	const failureCause = error instanceof ActivityFailure ? error.cause : error
	return failureCause instanceof Error ? failureCause.message : String(failureCause)
}
