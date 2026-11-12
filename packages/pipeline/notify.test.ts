// scan email tests: which subscribers a topic scan email plans for, what one batch rechecks, sends, and records, and
// a report that is sent once per Scan
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { toUtcMonth } from "@carlnotes/contracts/time"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as redisRateLimits from "@carlnotes/db/redisRateLimits"
import * as unsubscribe from "@carlnotes/emails/unsubscribe"
import * as monitoring from "@carlnotes/server/monitoring"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { planTopicScanEmail, sendScanReport, sendTopicScanEmailBatch } from "./notify"

// the rows each query gets, picked by a pattern in its SQL. a query that matches nothing gets no rows
type QueryRows = { sqlPattern: RegExp; rows: unknown[][] }

// one insert or update that the stubbed connection pool saw, with its SQL and its values
type RecordedWrite = { sql: string; values: unknown[] }

// one email body that the stubbed Resend was posted, and what the stub recorded of every call
type PostedEmailBody = { to: string; html: string }
type PostedResendEmails = { postedAddressLists: string[][]; postedHtmlByAddress: Map<string, string> }

// the rows the email's own queries return, in the column order each select names
const SUCCEEDED_SCAN_TOPIC_ROW = ["scan-1", "succeeded", null, null, "topic-1", "Coffee gear"]
const FAILED_SCAN_TOPIC_ROW = ["scan-1", "failed", null, "every source failed", "topic-1", "Coffee gear"]

// the real fetch and env, to put back after each test
const realFetch = globalThis.fetch
const restoreEnvSettings = saveEnvSettings(["RESEND_API_KEY", "RESEND_FROM_EMAIL", "BETTER_AUTH_URL"])

// configure Resend, give every call the rate limit slot without Redis, and leave out the app url so that no
// unsubscribe token is signed
beforeEach(() => {
	Bun.env.RESEND_API_KEY = "test-key"
	Bun.env.RESEND_FROM_EMAIL = "carl@example.com"
	delete Bun.env.BETTER_AUTH_URL
	spyOn(redisRateLimits, "takeRateLimitSlot").mockResolvedValue(0)
})

// put the query, fetch, report, and env back after each test
afterEach(() => {
	restoreConnectionPool()
	globalThis.fetch = realFetch
	mock.restore()
	restoreEnvSettings()
})

// stub the connection pool to return the rows whose pattern each query's SQL matches, recording every insert and update
function stubDatabase(queryRows: QueryRows[]): RecordedWrite[] {
	const recordedWrites: RecordedWrite[] = []
	stubConnectionPool(({ text: sql, values }) => {
		// an insert or an update is recorded and returns nothing
		if (sql.startsWith("insert") || sql.startsWith("update")) {
			recordedWrites.push({ sql, values })
			return []
		}

		// a select returns the first matching rows
		return queryRows.find((queryRow) => queryRow.sqlPattern.test(sql))?.rows ?? []
	})
	return recordedWrites
}

// stub Resend to respond to every call with the given status, recording the addresses that each call was posted and
// each posted email's html by its address
function stubResend(status: number): PostedResendEmails {
	const postedResendEmails: PostedResendEmails = { postedAddressLists: [], postedHtmlByAddress: new Map() }
	globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
		// a single email posts one body and a batch posts a list of them
		const postedBody = JSON.parse(String(init?.body)) as PostedEmailBody | PostedEmailBody[]
		const postedBodies = Array.isArray(postedBody) ? postedBody : [postedBody]

		// record the call's addresses and each email's html by its address, then respond with the status
		postedResendEmails.postedAddressLists.push(postedBodies.map((postedEmailBody) => postedEmailBody.to))
		for (const { to, html } of postedBodies) {
			postedResendEmails.postedHtmlByAddress.set(to, html)
		}
		return new Response(status === 200 ? "{}" : JSON.stringify({ name: "validation_error" }), { status })
	}) as typeof fetch
	return postedResendEmails
}

// subscriber rows for user-1 through user-N, each at a sendable address
function toSubscriberRows(count: number): unknown[][] {
	return Array.from({ length: count }, (_, index) => [`user-${index + 1}`, `user${index + 1}@example.com`])
}

// the plan leaves out whoever the Scan's email already reached and any address Resend would reject
test("a plan leaves out recorded recipients and unsendable addresses, and reports the drop", async () => {
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	stubDatabase([
		{ sqlPattern: /from "scans"/, rows: [SUCCEEDED_SCAN_TOPIC_ROW] },
		{ sqlPattern: /from "subscriptions"/, rows: [...toSubscriberRows(3), ["user-4", "not-an-address"]] },
		{ sqlPattern: /from "topic_email_sends"/, rows: [["user-2"]] },
	])

	// one batch of the two who remain, and a report that one address was dropped
	expect(await planTopicScanEmail("scan-1")).toEqual([["user-1", "user-3"]])
	expect(reportErrorSpy).toHaveBeenCalledWith(expect.any(Error), "email", {
		emailKind: "topic-scan",
		droppedCount: "1",
	})
})

// the subscribers read are those with an active subscription and email on who can still read the Topic. on a private
// Topic, only its owner and the active members of a team that owns or holds it can read it
test("a topic scan email reads only subscribers who can still read the Topic", async () => {
	// record every query the plan sends
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('from "scans"') ? [SUCCEEDED_SCAN_TOPIC_ROW] : [],
	)
	await planTopicScanEmail("scan-1")

	// the subscriber read joins the Topic and checks its visibility and the subscriber's role
	const subscribersQuery = sentQueries.find((sentQuery) => /from "subscriptions"/.test(sentQuery.text))
	expect(subscribersQuery?.text).toContain('inner join "topics"')
	expect(subscribersQuery?.text).toContain('"topics"."visibility" <> $')
	expect(subscribersQuery?.text).toContain('"topics"."owner_id" = "subscriptions"."subscriber_user_id"')
	expect(subscribersQuery?.text).toContain('from "team_members"')
	expect(subscribersQuery?.values).toContain("private")
})

// a large Topic's subscribers are split within Resend's per-call limit
test("a topic scan email plan batches 205 subscribers into 100, 100, and 5", async () => {
	stubDatabase([
		{ sqlPattern: /from "scans"/, rows: [SUCCEEDED_SCAN_TOPIC_ROW] },
		{ sqlPattern: /from "subscriptions"/, rows: toSubscriberRows(205) },
	])
	const recipientUserIdBatches = await planTopicScanEmail("scan-1")
	expect(recipientUserIdBatches.map((recipientUserIdBatch) => recipientUserIdBatch.length)).toEqual([100, 100, 5])
})

// only a succeeded Scan sends a topic scan email
test("a topic scan email plan for a failed Scan has no batches", async () => {
	stubDatabase([{ sqlPattern: /from "scans"/, rows: [FAILED_SCAN_TOPIC_ROW] }])
	expect(await planTopicScanEmail("scan-1")).toEqual([])
})

// a batch sends only to the planned recipients who are still subscribed and not yet recorded, then records them
test("a batch rechecks its recipients, sends one call, and records the accepted sends with the Scan", async () => {
	// user-2 unsubscribed since the plan, so the subscription query no longer returns them, and user-3 was already sent to
	const recordedWrites = stubDatabase([
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
	const { postedAddressLists } = stubResend(200)

	// one call to user-1 alone, recorded once with the Scan's id and deduped on the Scan and the recipient
	const scanEmailOutcome = await sendTopicScanEmailBatch({
		scanId: "scan-1",
		recipientUserIds: ["user-1", "user-2", "user-3"],
	})
	expect(scanEmailOutcome).toEqual({ outcome: "accepted" })
	expect(postedAddressLists).toEqual([["user1@example.com"]])
	expect(recordedWrites).toHaveLength(1)
	expect(recordedWrites[0]?.values).toEqual(expect.arrayContaining(["topic-1", "user-1", "topic-scan", "scan-1"]))
	expect(recordedWrites[0]?.sql).toContain(`on conflict ("scan_id","recipient_user_id") do nothing`)
})

// a rejected batch records nothing, so the send log keeps only accepted sends
test("a rejected topic scan email batch writes no rows", async () => {
	const recordedWrites = stubDatabase([
		{ sqlPattern: /from "scans"/, rows: [SUCCEEDED_SCAN_TOPIC_ROW] },
		{ sqlPattern: /from "subscriptions"/, rows: toSubscriberRows(2) },
	])
	stubResend(400)

	const scanEmailOutcome = await sendTopicScanEmailBatch({ scanId: "scan-1", recipientUserIds: ["user-1", "user-2"] })
	expect(scanEmailOutcome.outcome).toBe("rejected")
	expect(recordedWrites).toEqual([])
})

// a report that already reached its recipient for this Scan is not sent again
test("a Scan's report is skipped once it has reached its recipient", async () => {
	stubDatabase([
		{ sqlPattern: /from "scans"/, rows: [FAILED_SCAN_TOPIC_ROW] },
		{ sqlPattern: /from "topic_email_sends"/, rows: [["owner-1"]] },
		{ sqlPattern: /from "users"/, rows: [["owner@example.com"]] },
	])
	const { postedAddressLists } = stubResend(200)

	expect(await sendScanReport({ scanId: "scan-1", recipientUserId: "owner-1" })).toEqual({ outcome: "skipped" })
	expect(postedAddressLists).toEqual([])
})

// a report that has not reached its recipient is sent once and recorded with its Scan
test("a Scan's report is sent to whoever ran it and recorded with the Scan", async () => {
	const recordedWrites = stubDatabase([
		{ sqlPattern: /from "scans"/, rows: [FAILED_SCAN_TOPIC_ROW] },
		{ sqlPattern: /from "users"/, rows: [["owner@example.com"]] },
	])
	const { postedAddressLists } = stubResend(200)

	expect(await sendScanReport({ scanId: "scan-1", recipientUserId: "owner-1" })).toEqual({ outcome: "accepted" })
	expect(postedAddressLists).toEqual([["owner@example.com"]])
	expect(recordedWrites[0]?.values).toEqual(expect.arrayContaining(["topic-1", "owner-1", "manual-scan", "scan-1"]))
})

// the month's first topic scan email links the recipient's Topic Dashboard and stamps the month, and a recipient the
// month's line already reached gets no line and no stamp
test("a batch links the Topic Dashboard once a month and stamps the month on whoever got the line", async () => {
	Bun.env.BETTER_AUTH_URL = "https://carlnotes.example.com"
	spyOn(unsubscribe, "toUnsubscribeUrl").mockResolvedValue("https://carlnotes.example.com/api/unsubscribe?token=t")
	const dashboardLinkMonth = toUtcMonth(new Date())
	const recordedWrites = stubDatabase([
		{ sqlPattern: /from "scans"/, rows: [SUCCEEDED_SCAN_TOPIC_ROW] },
		{
			sqlPattern: /from "subscriptions"/,
			rows: [
				["user-1", "user1@example.com", "2020-01"],
				["user-2", "user2@example.com", dashboardLinkMonth],
			],
		},
	])
	const { postedHtmlByAddress } = stubResend(200)

	await sendTopicScanEmailBatch({ scanId: "scan-1", recipientUserIds: ["user-1", "user-2"] })

	// user-1's email links their Topic Dashboard and user-2's second email of the month has no line
	expect(postedHtmlByAddress.get("user1@example.com")).toContain("/profiles/user-1/specials/topics")
	expect(postedHtmlByAddress.get("user2@example.com")).not.toContain("Topic Specials")

	// the month is stamped on user-1 alone
	const dashboardLinkUpdate = recordedWrites.find((recordedWrite) => recordedWrite.sql.startsWith("update"))
	expect(dashboardLinkUpdate?.sql).toContain(`"dashboard_link_month"`)
	expect(dashboardLinkUpdate?.values).toEqual(expect.arrayContaining([dashboardLinkMonth, "user-1"]))
	expect(dashboardLinkUpdate?.values).not.toContain("user-2")
})
