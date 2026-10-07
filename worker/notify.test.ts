// scan email tests: which subscribers a digest plans for, what one batch rechecks, sends, and records, and a report that
// is sent once per Scan
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import * as monitoring from "@shared/monitoring"
import { restoreConnectionPool, stubConnectionPool } from "../db/connectionPoolStub"
import * as redis from "../db/redis"
import { planScanDigest, sendScanDigestBatch, sendScanReport } from "./notify"

// the rows each query gets, picked by a pattern in its SQL. a query that matches nothing gets no rows
type QueryRows = { sqlPattern: RegExp; rows: unknown[][] }

// one insert that the stubbed connection pool saw, with its SQL and its values
type RecordedInsert = { sql: string; values: unknown[] }

// the rows the email's own queries return, in the column order each select names
const SUCCEEDED_SCAN_TOPIC_ROW = ["scan-1", "succeeded", null, null, "topic-1", "Coffee gear"]
const FAILED_SCAN_TOPIC_ROW = ["scan-1", "failed", null, "every source failed", "topic-1", "Coffee gear"]

// the real fetch and env, to put back after each test
const realFetch = globalThis.fetch
const realEnv = {
	RESEND_API_KEY: Bun.env.RESEND_API_KEY,
	RESEND_FROM_EMAIL: Bun.env.RESEND_FROM_EMAIL,
	BETTER_AUTH_URL: Bun.env.BETTER_AUTH_URL,
}

// configure Resend, give every call the rate limit slot without Redis, and leave out the app url so that no
// unsubscribe token is signed
beforeEach(() => {
	Bun.env.RESEND_API_KEY = "test-key"
	Bun.env.RESEND_FROM_EMAIL = "carl@example.com"
	delete Bun.env.BETTER_AUTH_URL
	spyOn(redis, "takeRateLimitSlot").mockResolvedValue(0)
})

// put the query, fetch, and report back after each test
afterEach(() => {
	restoreConnectionPool()
	globalThis.fetch = realFetch
	mock.restore()

	// put the env back, removing a value that was unset instead of storing the text "undefined"
	for (const [name, value] of Object.entries(realEnv)) {
		if (value === undefined) {
			delete Bun.env[name]
		} else {
			Bun.env[name] = value
		}
	}
})

// stub the connection pool to return the rows whose pattern each query's SQL matches, recording every insert
function stubDatabase(queryRows: QueryRows[]): RecordedInsert[] {
	const recordedInserts: RecordedInsert[] = []
	stubConnectionPool(({ text: sql, values }) => {
		// an insert is recorded and returns nothing
		if (sql.startsWith("insert")) {
			recordedInserts.push({ sql, values })
			return []
		}

		// a select returns the first matching rows
		return queryRows.find((queryRow) => queryRow.sqlPattern.test(sql))?.rows ?? []
	})
	return recordedInserts
}

// stub Resend to respond to every call with the given status, recording the addresses that each call was posted
function stubResend(status: number): string[][] {
	const postedAddressLists: string[][] = []
	globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
		// a single email posts one body and a batch posts a list of them
		const postedBody = JSON.parse(String(init?.body)) as { to: string } | { to: string }[]
		const postedBodies = Array.isArray(postedBody) ? postedBody : [postedBody]
		postedAddressLists.push(postedBodies.map((resendEmailBody) => resendEmailBody.to))
		return new Response(status === 200 ? "{}" : JSON.stringify({ name: "validation_error" }), { status })
	}) as typeof fetch
	return postedAddressLists
}

// subscriber rows for user-1 through user-N, each at a sendable address
function toSubscriberRows(count: number): unknown[][] {
	return Array.from({ length: count }, (_, index) => [`user-${index + 1}`, `user${index + 1}@example.com`])
}

// the plan leaves out whoever the Scan's email already reached and any address Resend would reject
test("a digest plan leaves out recorded recipients and unsendable addresses, and reports the drop", async () => {
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	stubDatabase([
		{ sqlPattern: /from "scans"/, rows: [SUCCEEDED_SCAN_TOPIC_ROW] },
		{ sqlPattern: /from "subscriptions"/, rows: [...toSubscriberRows(3), ["user-4", "not-an-address"]] },
		{ sqlPattern: /from "topic_email_sends"/, rows: [["user-2"]] },
	])

	// one batch of the two who remain, and a report that one address was dropped
	expect(await planScanDigest("scan-1")).toEqual([["user-1", "user-3"]])
	expect(reportErrorSpy).toHaveBeenCalledWith(expect.any(Error), "email", {
		emailKind: "topic-scan",
		droppedCount: "1",
	})
})

// a large Topic's subscribers are split within Resend's per-call limit
test("a digest plan batches 205 subscribers into 100, 100, and 5", async () => {
	stubDatabase([
		{ sqlPattern: /from "scans"/, rows: [SUCCEEDED_SCAN_TOPIC_ROW] },
		{ sqlPattern: /from "subscriptions"/, rows: toSubscriberRows(205) },
	])
	const recipientUserIdBatches = await planScanDigest("scan-1")
	expect(recipientUserIdBatches.map((recipientUserIdBatch) => recipientUserIdBatch.length)).toEqual([100, 100, 5])
})

// only a succeeded Scan sends a digest
test("a digest plan for a failed Scan has no batches", async () => {
	stubDatabase([{ sqlPattern: /from "scans"/, rows: [FAILED_SCAN_TOPIC_ROW] }])
	expect(await planScanDigest("scan-1")).toEqual([])
})

// a batch sends only to the planned recipients who are still subscribed and not yet recorded, then records them
test("a digest batch rechecks its recipients, sends one call, and records the accepted sends with the Scan", async () => {
	// user-2 unsubscribed since the plan, so the subscription query no longer returns them, and user-3 was already sent to
	const recordedInserts = stubDatabase([
		{ sqlPattern: /from "scans"/, rows: [SUCCEEDED_SCAN_TOPIC_ROW] },
		{
			sqlPattern: /from "subscriptions"/,
			rows: [
				["user-1", "user1@example.com"],
				["user-3", "user3@example.com"],
			],
		},
		{ sqlPattern: /from "topic_email_sends"/, rows: [["user-3"]] },
	])
	const postedAddressLists = stubResend(200)

	// one call to user-1 alone, recorded once with the Scan's id and deduped on the Scan and the recipient
	const scanEmailOutcome = await sendScanDigestBatch({
		scanId: "scan-1",
		recipientUserIds: ["user-1", "user-2", "user-3"],
	})
	expect(scanEmailOutcome).toEqual({ outcome: "accepted" })
	expect(postedAddressLists).toEqual([["user1@example.com"]])
	expect(recordedInserts).toHaveLength(1)
	expect(recordedInserts[0]?.values).toEqual(expect.arrayContaining(["topic-1", "user-1", "topic-scan", "scan-1"]))
	expect(recordedInserts[0]?.sql).toContain(`on conflict ("scan_id","recipient_user_id") do nothing`)
})

// a rejected batch records nothing, so the send log keeps only accepted sends
test("a rejected digest batch writes no rows", async () => {
	const recordedInserts = stubDatabase([
		{ sqlPattern: /from "scans"/, rows: [SUCCEEDED_SCAN_TOPIC_ROW] },
		{ sqlPattern: /from "subscriptions"/, rows: toSubscriberRows(2) },
	])
	stubResend(400)

	const scanEmailOutcome = await sendScanDigestBatch({ scanId: "scan-1", recipientUserIds: ["user-1", "user-2"] })
	expect(scanEmailOutcome.outcome).toBe("rejected")
	expect(recordedInserts).toEqual([])
})

// a report that already reached its recipient for this Scan is not sent again
test("a Scan's report is skipped once it has reached its recipient", async () => {
	stubDatabase([
		{ sqlPattern: /from "scans"/, rows: [FAILED_SCAN_TOPIC_ROW] },
		{ sqlPattern: /from "topic_email_sends"/, rows: [["owner-1"]] },
		{ sqlPattern: /from "users"/, rows: [["owner@example.com"]] },
	])
	const postedAddressLists = stubResend(200)

	expect(await sendScanReport({ scanId: "scan-1", recipientUserId: "owner-1" })).toEqual({ outcome: "skipped" })
	expect(postedAddressLists).toEqual([])
})

// a report that has not reached its recipient is sent once and recorded with its Scan
test("a Scan's report is sent to whoever ran it and recorded with the Scan", async () => {
	const recordedInserts = stubDatabase([
		{ sqlPattern: /from "scans"/, rows: [FAILED_SCAN_TOPIC_ROW] },
		{ sqlPattern: /from "users"/, rows: [["owner@example.com"]] },
	])
	const postedAddressLists = stubResend(200)

	expect(await sendScanReport({ scanId: "scan-1", recipientUserId: "owner-1" })).toEqual({ outcome: "accepted" })
	expect(postedAddressLists).toEqual([["owner@example.com"]])
	expect(recordedInserts[0]?.values).toEqual(expect.arrayContaining(["topic-1", "owner-1", "manual-scan", "scan-1"]))
})
