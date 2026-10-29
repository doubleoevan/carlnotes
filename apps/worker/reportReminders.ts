// the sweep's reminder for a report left open: one email per report still open twelve hours after it was made, never
// a second
import { db } from "@carlnotes/db"
import { reports } from "@carlnotes/db/schema/reports"
import { users } from "@carlnotes/db/schema/users"
import { sendReportEmail } from "@carlnotes/emails/report-email"
import { and, asc, eq, isNull, lt } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

// the reporter and the author, each joined to the report from the users table
const reporters = alias(users, "reporters")
const authors = alias(users, "authors")

// how long a report may stay open before the sweep mails one reminder
const REPORT_REMINDER_AFTER_MS = 12 * 60 * 60 * 1000

/**
 * Mails one reminder for each report still open past the reminder delay, and records the send so it never repeats.
 * Returns how many reminders were sent.
 */
export async function remindOpenReports(now = new Date()): Promise<number> {
	// without a support inbox there is nowhere to remind
	const supportEmail = Bun.env.SUPPORT_EMAIL
	if (!supportEmail) {
		return 0
	}

	// the open reports past the delay that were never reminded, oldest first
	const reminderCutoff = new Date(now.getTime() - REPORT_REMINDER_AFTER_MS)
	const reportRows = await db
		.select({
			id: reports.id,
			subjectKind: reports.subjectKind,
			subjectText: reports.subjectText,
			subjectPath: reports.subjectPath,
			reason: reports.reason,
			reporterUsername: reporters.username,
			authorUsername: authors.username,
		})
		.from(reports)
		.innerJoin(reporters, eq(reporters.id, reports.reporterUserId))
		.leftJoin(authors, eq(authors.id, reports.subjectAuthorUserId))
		.where(and(isNull(reports.resolvedAt), isNull(reports.remindedAt), lt(reports.createdAt, reminderCutoff)))
		.orderBy(asc(reports.createdAt))

	// claim each one, then mail it. a rejected send gives the claim back for the next sweep, and one failure stops
	// nothing else
	let sentCount = 0
	for (const reportRow of reportRows) {
		// claim the row, and skip one another sweep claimed first
		const [claimedReport] = await db
			.update(reports)
			.set({ remindedAt: now })
			.where(and(eq(reports.id, reportRow.id), isNull(reports.remindedAt)))
			.returning({ id: reports.id })
		if (!claimedReport) {
			continue
		}

		// the reminder itself
		const isAccepted = await sendReportEmail({
			to: supportEmail,
			reportId: reportRow.id,
			subjectPath: reportRow.subjectPath,
			subjectKind: reportRow.subjectKind,
			subjectLabel: reportRow.subjectText.split("\n")[0] ?? reportRow.subjectKind,
			subjectText: reportRow.subjectText,
			authorUsername: reportRow.authorUsername,
			reporterUsername: reportRow.reporterUsername,
			reason: reportRow.reason,
			isReminder: true,
		})

		// count the send, or give the claim back
		if (isAccepted) {
			sentCount += 1
		} else {
			await db.update(reports).set({ remindedAt: null }).where(eq(reports.id, reportRow.id))
		}
	}
	return sentCount
}
