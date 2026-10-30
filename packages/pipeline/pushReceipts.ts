// read the receipts of an event's accepted pushes once the push service has tried to deliver them. a phone the
// service no longer knows is retired, and any other receipt error is reported by its code, never with its token

import { db } from "@carlnotes/db"
import { pushDevices, pushNotificationSends } from "@carlnotes/db/schema/pushDevices"
import { type ExpoPushReceipt, readPushReceipts } from "@carlnotes/server/expoPush"
import { reportError } from "@carlnotes/server/monitoring"
import { and, inArray, isNull } from "drizzle-orm"
import { DEVICE_NOT_REGISTERED_ERROR_CODE, type PushEvent, toPushEventFilter, toPushEventId } from "./pushDelivery"

// the code recorded for a push whose receipt the service no longer has or never wrote
const RECEIPT_MISSING_ERROR_CODE = "receipt-missing"

// what a receipt check found: receipts that were ok, receipts with an error, and phones retired
export type PushReceiptCheck = { okCount: number; errorCount: number; retiredCount: number }

/**
 * Reads the receipts of the event's accepted pushes that have none yet, records them with one write per outcome,
 * retires each phone that the service says is not registered, and reports any other error code once.
 */
export async function checkPushReceipts(pushEvent: PushEvent): Promise<PushReceiptCheck> {
	// the event's sends that still wait for a receipt
	const pendingSendRows = await db
		.select({
			id: pushNotificationSends.id,
			ticketId: pushNotificationSends.ticketId,
			pushDeviceId: pushNotificationSends.pushDeviceId,
		})
		.from(pushNotificationSends)
		.where(and(toPushEventFilter(pushEvent), isNull(pushNotificationSends.receiptStatus)))
	const pushReceiptCheck: PushReceiptCheck = { okCount: 0, errorCount: 0, retiredCount: 0 }
	if (pendingSendRows.length === 0) {
		return pushReceiptCheck
	}

	// each send's receipt error, null for an ok receipt, with the send ids grouped by it
	const pushReceipts = await readPushReceipts(pendingSendRows.map((pendingSendRow) => pendingSendRow.ticketId))
	const sendIdsByReceiptError = new Map<string | null, string[]>()
	const unregisteredPushDeviceIds: string[] = []
	for (const pendingSendRow of pendingSendRows) {
		// the send joins its outcome's group, and an unregistered phone is set aside to retire
		const receiptError = toReceiptError(pushReceipts.get(pendingSendRow.ticketId))
		sendIdsByReceiptError.set(receiptError, [...(sendIdsByReceiptError.get(receiptError) ?? []), pendingSendRow.id])
		if (receiptError === DEVICE_NOT_REGISTERED_ERROR_CODE && pendingSendRow.pushDeviceId) {
			unregisteredPushDeviceIds.push(pendingSendRow.pushDeviceId)
		}
	}

	// one write per receipt outcome, and one report per error code that is not an unregistered phone
	for (const [receiptError, sendIds] of sendIdsByReceiptError) {
		await db
			.update(pushNotificationSends)
			.set({ receiptStatus: receiptError ? "error" : "ok", receiptError, receiptCheckedAt: new Date() })
			.where(inArray(pushNotificationSends.id, sendIds))

		// count an ok outcome
		if (!receiptError) {
			pushReceiptCheck.okCount += sendIds.length
			continue
		}

		// count an error, and report one that is not an unregistered phone
		pushReceiptCheck.errorCount += sendIds.length
		if (receiptError !== DEVICE_NOT_REGISTERED_ERROR_CODE) {
			reportReceiptError(pushEvent, receiptError)
		}
	}

	// retire every phone the service no longer knows
	if (unregisteredPushDeviceIds.length > 0) {
		await db.delete(pushDevices).where(inArray(pushDevices.id, unregisteredPushDeviceIds))
		pushReceiptCheck.retiredCount = unregisteredPushDeviceIds.length
	}
	return pushReceiptCheck
}

// a receipt's error code, or null for an ok receipt. a missing receipt is an error of its own
function toReceiptError(pushReceipt: ExpoPushReceipt | undefined): string | null {
	if (!pushReceipt) {
		return RECEIPT_MISSING_ERROR_CODE
	}
	return pushReceipt.status === "ok" ? null : (pushReceipt.details?.error ?? "unknown")
}

// report a receipt error with its event and code
function reportReceiptError(pushEvent: PushEvent, receiptError: string): void {
	reportError(new Error("a push receipt reported an error"), "push", {
		kind: pushEvent.kind,
		eventId: toPushEventId(pushEvent),
		receiptError,
	})
}
