// a user reporting a Topic, profile, Team, chat room message, note, note comment, Finding, Podcast Episode, or
// comment. the report is stored, mailed to the SUPPORT_EMAIL address, and resolved in the admin console.
// a chat room message, a note, or a note comment is hidden from its reporter too

import type { SocialEventFlagSubject } from "@carlnotes/contracts/analyticsEvents"
import { type FlagContentPayload, flagContentPayload, reportedSubjectQuery } from "@carlnotes/contracts/payloads"
import type { ReportSubjectKind } from "@carlnotes/contracts/reports"
import { isSocialTargetKind, toSocialEventTarget } from "@carlnotes/contracts/social"
import { DAY_MS } from "@carlnotes/contracts/time"
import { countRateLimitHit, decrementRateLimitWindow } from "@carlnotes/db/redisRateLimits"
import { sendReportEmail } from "@carlnotes/emails/reportEmail"
import { trackEvent } from "@carlnotes/server/analytics"
import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { type AnalyticsProperties, type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { toSocialEventProperties } from "../social/reactions"
import { loadSocialTarget } from "../social/socialTargets"
import { saveUserBlock } from "../userBlocks"
import { loadUsername } from "../usernames"
import { type ReportedSubject, toReportedSubject } from "./reportSubjects"
import { hasReportedSubject, removeReport, saveReport } from "./reports"

// how many reports one user may send in a one-day rate limit window, which starts at its first report. the
// limit is flat and far above what a person sends
const DAILY_REPORT_LIMIT = 50
const REPORT_RATE_LIMIT_WINDOW_MS = DAY_MS

// the result from a report request
export type ReportContentResult = "sent" | "unknownSubject" | "limitReached" | "notConfigured" | "failed"

/**
 * Stores a report, emails it to the support address, and records what kind of thing was reported, or rejects the
 * report if its subject is missing or hidden from the sender. A report the sender already made is accepted again
 * without a second row or email.
 */
export async function flagContent({
	userId,
	payload,
	analyticsProperties,
}: {
	userId: string
	payload: FlagContentPayload
	analyticsProperties: AnalyticsProperties
}): Promise<ReportContentResult> {
	// store and mail the report
	const saveAndSendReportResult = await saveAndSendReport(userId, payload)
	if (saveAndSendReportResult !== "sent") {
		return saveAndSendReportResult
	}

	// record what kind of thing was reported
	const { subjectKind, subjectId } = payload
	trackEvent("content_flagged", userId, { ...analyticsProperties, kind: subjectKind })

	// a flag of a social target or a profile also sends the social event, named by the subject and holding its id
	const socialEventFlagSubject = toSocialEventFlagSubject(subjectKind)
	if (socialEventFlagSubject) {
		trackEvent(
			`social_${socialEventFlagSubject}_flag`,
			userId,
			await toFlagEventProperties({ subjectKind, subjectId, userId, analyticsProperties }),
		)
	}
	return saveAndSendReportResult
}

// store a report and email it, or say why it was rejected
async function saveAndSendReport(userId: string, payload: FlagContentPayload): Promise<ReportContentResult> {
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

	// save the user block of the author in the same submission if the sender asked, never the sender themselves
	if (payload.shouldBlockAuthor && reportedSubject.authorUserId && reportedSubject.authorUserId !== userId) {
		await saveUserBlock(userId, reportedSubject.authorUserId)
	}

	// store the report. a repeat of unchanged text costs no slot and no email
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

// how a subject kind reads in its social flag event's name. the other kinds send content_flagged alone
function toSocialEventFlagSubject(subjectKind: ReportSubjectKind): SocialEventFlagSubject | null {
	if (subjectKind === "profile") {
		return "profile"
	}
	return isSocialTargetKind(subjectKind) ? toSocialEventTarget(subjectKind) : null
}

// what a flag event's properties are read from: the report's subject, who sent it, and the request's properties
type ToFlagEventPropertiesOptions = {
	subjectKind: ReportSubjectKind
	subjectId: string
	userId: string
	analyticsProperties: AnalyticsProperties
}

// a flag event's properties: the subject's Topic and whether the user owns it, if the subject has one. a profile has
// none
async function toFlagEventProperties({
	subjectKind,
	subjectId,
	userId,
	analyticsProperties,
}: ToFlagEventPropertiesOptions): Promise<AnalyticsProperties & { objectId: string }> {
	// a report can name a Finding rated thumbs down, which still has its Topic. any other subject has only its id
	const resolvedSocialTarget = isSocialTargetKind(subjectKind)
		? await loadSocialTarget({ kind: subjectKind, id: subjectId }, { isRatedDownIncluded: true })
		: null
	return resolvedSocialTarget
		? toSocialEventProperties({ analyticsProperties, userId, resolvedSocialTarget, objectId: subjectId })
		: { ...analyticsProperties, objectId: subjectId }
}

// the Redis key that a user's reports count under
function toReportRateLimitWindowKey(userId: string): string {
	return `flags:${userId}`
}

// the report routes. the /flag-content path, its payload, and the content_flagged event keep the flag name the clients
// send
export const flagContentRoute = new Hono<AppEnv>()
	.get("/flag-content", zValidator("query", reportedSubjectQuery), async (context) => {
		// a report belongs to the user who sent it, so only that user can ask about it
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		const { subjectKind, subjectId } = context.req.valid("query")
		return context.json({ isReported: await hasReportedSubject(userId, subjectKind, subjectId) })
	})
	.delete("/flag-content", zValidator("query", reportedSubjectQuery), async (context) => {
		// a report belongs to the user who sent it, so only that user can remove it
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}

		// remove it, whether or not it was there
		const { subjectKind, subjectId } = context.req.valid("query")
		await removeReport(userId, subjectKind, subjectId)
		return context.json({ ok: true })
	})
	.post("/flag-content", zValidator("json", flagContentPayload), async (context) => {
		// only a signed-in user may report content, so a report always names an account that can be held to it
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}

		// store and mail the report, and record what kind of thing was reported
		const flagContentResult = await flagContent({
			userId,
			payload: context.req.valid("json"),
			analyticsProperties: toAnalyticsProperties(context),
		})
		if (flagContentResult === "sent") {
			return context.json({ ok: true })
		}
		// each rejection reports in its own terms, so the dialog can show what actually went wrong
		if (flagContentResult === "limitReached") {
			return context.json({ error: "you have sent enough reports for one day" }, 429)
		}
		if (flagContentResult === "failed") {
			return context.json({ error: "the report did not send. try again" }, 502)
		}
		// a subject that is missing or hidden from the user is a 404, and an unset SUPPORT_EMAIL is a 503
		return flagContentResult === "unknownSubject"
			? context.json({ error: "not found" }, 404)
			: context.json({ error: "reports are not configured" }, 503)
	})
