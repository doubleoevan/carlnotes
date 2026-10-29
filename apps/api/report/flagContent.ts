// a user reporting a Topic, profile, Team, chat room message, note, or note comment. the report is stored, hidden
// from its reporter, mailed to the SUPPORT_EMAIL address, and resolved in the admin console

import { type FlagContentPayload, flagContentPayload } from "@carlnotes/contracts/payloads"
import { DAY_MS } from "@carlnotes/contracts/time"
import { countRateLimitHit, decrementRateLimitWindow } from "@carlnotes/db/redisRateLimits"
import { sendReportEmail } from "@carlnotes/emails/report-email"
import { trackEvent } from "@carlnotes/server/analytics"
import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { blockUser } from "../userBlocks"
import { loadUsername } from "../usernames"
import { type ReportedSubject, toReportedSubject } from "./reportSubjects"
import { saveReport } from "./reports"

// how many reports one user may send in a one-day rate limit window, which starts at the window's first report
const DAILY_REPORT_LIMIT = 10
const REPORT_RATE_LIMIT_WINDOW_MS = DAY_MS

// the result from a report request
export type ReportContentResult = "sent" | "unknownSubject" | "limitReached" | "notConfigured" | "failed"

/**
 * Stores a report and emails it to the support address, or rejects the report if its subject is missing or hidden
 * from the sender. A report the sender already made is accepted again without a second row or email.
 */
export async function flagContent(userId: string, payload: FlagContentPayload): Promise<ReportContentResult> {
	const supportEmail = Bun.env.SUPPORT_EMAIL
	if (!supportEmail) {
		console.error("SUPPORT_EMAIL must be set to receive reports")
		return "notConfigured"
	}

	// count this account's reports before resolving anything, so a flood costs no queries
	if (!(await canReport(userId))) {
		return "limitReached"
	}

	// check what is being reported, rejecting anything the sender could not have been looking at
	const reportedSubject = await toReportedSubject(userId, payload)
	if (!reportedSubject) {
		return "unknownSubject"
	}

	// block the author in the same submission if the sender asked, never the sender themselves
	if (payload.shouldBlockAuthor && reportedSubject.authorUserId && reportedSubject.authorUserId !== userId) {
		await blockUser(userId, reportedSubject.authorUserId)
	}

	// store the report, which hides the subject from the sender from here on. a repeat costs no slot and no email
	const reportId = await saveReport({ reporterUserId: userId, subject: reportedSubject, reason: payload.reason })
	if (!reportId) {
		await refundReport(userId)
		return "sent"
	}

	// mail the report to the support inbox with the console link
	const isAccepted = await sendNewReportEmail({
		supportEmail,
		reportId,
		reportedSubject,
		reporterUserId: userId,
		reason: payload.reason,
	})

	// a report the mailer rejected stays stored for the console, and its spent slot comes back for the retry
	if (!isAccepted) {
		await refundReport(userId)
		return "failed"
	}
	return "sent"
}

// what the report email needs beside the words: the inbox, the stored report, its subject, the sender, and the reason
type SendNewReportEmailOptions = {
	supportEmail: string
	reportId: string
	reportedSubject: ReportedSubject
	reporterUserId: string
	reason: string
}

// mail one report to the support inbox. returns whether the mailer accepted it
async function sendNewReportEmail({
	supportEmail,
	reportId,
	reportedSubject,
	reporterUserId,
	reason,
}: SendNewReportEmailOptions): Promise<boolean> {
	// the sender's and the author's usernames for the admin to act on
	const [reporterUsername, authorUsername] = await Promise.all([
		loadUsername(reporterUserId),
		reportedSubject.authorUserId ? loadUsername(reportedSubject.authorUserId) : null,
	])
	return sendReportEmail({
		to: supportEmail,
		reportId,
		subjectPath: reportedSubject.path,
		subjectKind: reportedSubject.kind,
		subjectLabel: reportedSubject.label,
		subjectText: reportedSubject.text,
		authorUsername,
		reporterUsername: reporterUsername ?? reporterUserId,
		reason,
		isReminder: false,
	})
}

/**
 * Counts one report against the user's daily rate limit window and returns whether the count is within the limit.
 */
export async function canReport(userId: string): Promise<boolean> {
	// count the report in the user's daily rate limit window and return whether the count is within the limit
	return countRateLimitHit({
		key: toReportRateLimitWindowKey(userId),
		rateLimitWindowMs: REPORT_RATE_LIMIT_WINDOW_MS,
		limit: DAILY_REPORT_LIMIT,
	})
}

/**
 * Refunds one report for a send that the mailer rejected, or a repeat of a report already made.
 */
export function refundReport(userId: string): Promise<void> {
	return decrementRateLimitWindow(toReportRateLimitWindowKey(userId))
}

// the Redis key that a user's reports count under
function toReportRateLimitWindowKey(userId: string): string {
	return `flags:${userId}`
}

// the report route. the /flag-content path, its payload, and the content_flagged event keep the flag name the clients send
export const flagContentRoute = new Hono<AppEnv>().post(
	"/flag-content",
	zValidator("json", flagContentPayload),
	async (context) => {
		// only a signed-in user may report content, so a report always names an account that can be held to it
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}

		// store and mail the report, and record what kind of thing was reported
		const flagResult = await flagContent(userId, context.req.valid("json"))
		if (flagResult === "sent") {
			trackEvent("content_flagged", userId, {
				...toAnalyticsProperties(context),
				kind: context.req.valid("json").subjectKind,
			})
			return context.json({ ok: true })
		}
		// each rejection reports in its own terms, so the dialog can show what actually went wrong
		if (flagResult === "limitReached") {
			return context.json({ error: "you have sent enough reports for one day" }, 429)
		}
		if (flagResult === "failed") {
			return context.json({ error: "the report did not send. try again" }, 502)
		}
		// a subject that is missing or hidden from the user is a 404, and an unset SUPPORT_EMAIL is a 503
		return flagResult === "unknownSubject"
			? context.json({ error: "not found" }, 404)
			: context.json({ error: "reports are not configured" }, 503)
	},
)
