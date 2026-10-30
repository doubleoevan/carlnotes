// push receipt tests: each receipt is recorded on its send, an unregistered phone is retired, and any other error and
// a missing receipt are reported by their code with no token
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as expoPush from "@carlnotes/server/expoPush"
import * as monitoring from "@carlnotes/server/monitoring"
import { checkPushReceipts } from "./pushReceipts"

// put the pool and the spies back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// four sends that wait for a receipt: ok, unregistered, bad credentials, and one the service never answered for
const PENDING_SEND_ROWS = [
	["send-1", "ticket-1", "device-1"],
	["send-2", "ticket-2", "device-2"],
	["send-3", "ticket-3", "device-3"],
	["send-4", "ticket-4", "device-4"],
]

test("receipts are recorded, an unregistered phone is retired, and other errors are reported by code", async () => {
	// the pending sends, and the service's receipts for three of them
	const sentQueries = stubConnectionPool(({ text }) =>
		text.startsWith('select "id", "ticket_id", "push_device_id" from "push_notification_sends"')
			? PENDING_SEND_ROWS
			: [],
	)
	spyOn(expoPush, "readPushReceipts").mockResolvedValue(
		new Map([
			["ticket-1", { status: "ok" }],
			["ticket-2", { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }],
			[
				"ticket-3",
				{
					status: "error",
					message: "bad credentials for ExponentPushToken[private]",
					details: { error: "InvalidCredentials" },
				},
			],
		]),
	)
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})

	// one ok, three errors, and the one unregistered phone retired
	expect(await checkPushReceipts({ kind: "topic-scan", scanId: "scan-1" })).toEqual({
		okCount: 1,
		errorCount: 3,
		retiredCount: 1,
	})

	// each send's receipt is written, the unregistered phone is deleted, and the pending read names the Scan
	const receiptUpdates = sentQueries.filter((sentQuery) =>
		sentQuery.text.startsWith('update "push_notification_sends"'),
	)
	expect(receiptUpdates.map((receiptUpdate) => receiptUpdate.values.slice(0, 2))).toEqual([
		["ok", null],
		["error", "DeviceNotRegistered"],
		["error", "InvalidCredentials"],
		["error", "receipt-missing"],
	])
	const deleteQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('delete from "push_devices"'))
	expect(deleteQuery?.values).toEqual(["device-2"])

	// the credentials error and the missing receipt are reported by code with the Scan, and never with a token
	expect(reportErrorSpy.mock.calls.map((reportErrorCall) => reportErrorCall[2])).toEqual([
		{ kind: "topic-scan", eventId: "scan-1", receiptError: "InvalidCredentials" },
		{ kind: "topic-scan", eventId: "scan-1", receiptError: "receipt-missing" },
	])
	expect(JSON.stringify(reportErrorSpy.mock.calls)).not.toContain("ExponentPushToken")
})

// an event whose sends all have receipts reads nothing from the service
test("an event with no pending sends reads no receipts", async () => {
	stubConnectionPool(() => [])
	const readSpy = spyOn(expoPush, "readPushReceipts").mockResolvedValue(new Map())
	expect(await checkPushReceipts({ kind: "chat-mention", chatMessageId: 44 })).toEqual({
		okCount: 0,
		errorCount: 0,
		retiredCount: 0,
	})
	expect(readSpy).not.toHaveBeenCalled()
})
