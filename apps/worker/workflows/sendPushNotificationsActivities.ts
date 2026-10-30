// the activities that push to phones: sending a Scan's or a room message's pushes, reading their receipts, and
// reporting a push that did not go out. a send that the push service did not take throws a failure that says whether
// to retry

import type { PushEvent, PushOutcome, PushProgress } from "@carlnotes/pipeline/pushDelivery"
import { toPushEventId } from "@carlnotes/pipeline/pushDelivery"
import * as pushNotify from "@carlnotes/pipeline/pushNotify"
import { reportError } from "@carlnotes/server/monitoring"
import { ApplicationFailure, Context } from "@temporalio/activity"

// the receipt check, run as an activity
export { checkPushReceipts } from "@carlnotes/pipeline/pushReceipts"

/**
 * Pushes a Scan's new Findings, throwing a failure if the push service did not take every push.
 */
export async function sendScanPush(scanId: string): Promise<void> {
	throwIfNotPushed(await pushNotify.sendScanPush(scanId, toActivityPushProgress()))
}

/**
 * Pushes a room message's chat mentions, throwing a failure if the push service did not take every push.
 */
export async function sendChatMentionPush(chatMessageId: number): Promise<void> {
	throwIfNotPushed(await pushNotify.sendChatMentionPush(chatMessageId, toActivityPushProgress()))
}

// a send's progress as the activity reports it: a heartbeat after each chunk, and a stop once Temporal cancels the
// attempt. a call outside an activity, as in a test, is unwatched
function toActivityPushProgress(): PushProgress | undefined {
	try {
		const activityContext = Context.current()
		return {
			onChunkSent: () => activityContext.heartbeat(),
			isCancelled: () => activityContext.cancellationSignal.aborted,
		}
	} catch {
		return undefined
	}
}

// a push that did not go out or whose receipts could not be read, with its event, the stage, and what was said
export type PushFailureReport = { pushEvent: PushEvent; stage: "send" | "receipts"; pushError: string }

/**
 * Reports a push that failed for good or ran out of attempts, naming its event and never a token.
 */
export async function reportPushFailure({ pushEvent, stage, pushError }: PushFailureReport): Promise<void> {
	const eventId = toPushEventId(pushEvent)
	console.error(`the ${pushEvent.kind} push ${stage} for ${eventId} failed: ${pushError}`)
	reportError(new Error("a push was not delivered"), "push", { kind: pushEvent.kind, eventId, stage, pushError })
}

// throw a failure for a push the service did not take, final if waiting cannot fix it. the failure includes what the
// service said as its details
function throwIfNotPushed(pushOutcome: PushOutcome): void {
	if (pushOutcome.outcome === "sent" || pushOutcome.outcome === "skipped") {
		return
	}
	throw ApplicationFailure.create({
		message: `the push service did not take every push: ${pushOutcome.pushError}`,
		type: "PushFailure",
		nonRetryable: pushOutcome.outcome === "rejected",
		details: [pushOutcome.pushError],
	})
}
