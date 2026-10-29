// report reminder tests: one email per report open past the delay, recorded so the next sweep sends no second, and
// nothing without a support inbox
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as emails from "@carlnotes/emails/email"
import { remindOpenReports } from "./reportReminders"

// put the spied send and the connection pool back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
	delete Bun.env.SUPPORT_EMAIL
})

// one open report row as the reminder's read selects it
const OPEN_REPORT_ROW = ["report-1", "chatMessage", "you all smell", "/teams/team-1", "rude", "doubleoevan", "vienna"]

// a report past the delay gets one reminder, and its reminded time is written
test("a report left open gets one reminder", async () => {
	Bun.env.SUPPORT_EMAIL = "support@carlnotes.test"
	const sendEmailSpy = spyOn(emails, "sendEmail").mockResolvedValue(true)
	const sentQueries = stubConnectionPool(({ text }) => {
		// the read returns the row, and the claim returns its id
		if (text.includes('from "reports"')) {
			return [OPEN_REPORT_ROW]
		}
		return text.startsWith('update "reports"') ? [["report-1"]] : []
	})
	expect(await remindOpenReports(new Date("2026-10-29T22:00:00.000Z"))).toBe(1)

	// the reminder names the report and the console link, and the row records the send
	const sentEmail = sendEmailSpy.mock.calls[0]?.[0]
	expect(sentEmail?.subject).toContain("Still open")
	expect(sentEmail?.emailContent).toContain("/admin?report=report-1")
	const updateQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('update "reports"'))
	expect(updateQuery?.values).toEqual(expect.arrayContaining(["report-1"]))
})

// the read asks only for reports older than the delay and never reminded, so a resolved or reminded one sends nothing
test("the read names the delay and the unreminded rows", async () => {
	Bun.env.SUPPORT_EMAIL = "support@carlnotes.test"
	const sendEmailSpy = spyOn(emails, "sendEmail").mockResolvedValue(true)
	const sentQueries = stubConnectionPool(() => [])
	expect(await remindOpenReports(new Date("2026-10-29T22:00:00.000Z"))).toBe(0)

	// the read's filters and its cutoff, twelve hours before now
	const readQuery = sentQueries.find((sentQuery) => sentQuery.text.includes('from "reports"'))
	expect(readQuery?.text).toContain('"resolved_at" is null')
	expect(readQuery?.text).toContain('"reminded_at" is null')
	expect(readQuery?.values).toEqual([new Date("2026-10-29T10:00:00.000Z").toISOString()])
	expect(sendEmailSpy).not.toHaveBeenCalled()
})

// without a support inbox the sweep reads nothing
test("no support inbox means no reminder read", async () => {
	const sentQueries = stubConnectionPool(() => [])
	expect(await remindOpenReports()).toBe(0)
	expect(sentQueries).toHaveLength(0)
})
