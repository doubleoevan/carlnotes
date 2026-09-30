// a user flagging a Topic, profile, or Team. the report is mailed to the SUPPORT_EMAIL address
import { zValidator } from "@hono/zod-validator"
import { appUrl } from "@shared/appUrl"
import { type FlagContentPayload, flagContentPayload } from "@shared/contracts"
import { toTopicPath } from "@shared/seo"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../db"
import { decrementRateLimitWindow, incrementRateLimitWindow, isWithinRateLimit } from "../db/redis"
import { teams, topics, users } from "../db/schema"
import { sendEmail } from "../worker/email"
import { type AppEnv, currentUser } from "./currentUser"
import { toTeamRole } from "./team/members"
import { canSeeTopic } from "./topic/permissions"

// how many flags one user may send in a one-day rate limit window, which starts at the window's first flag
const DAILY_FLAG_LIMIT = 10
const FLAG_RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000

// the result from a flag content request
export type FlagContentResult = "sent" | "unknownSubject" | "limitReached" | "notConfigured" | "failed"

/**
 * Emails a flag to the support address, or rejects the flag if its subject is missing or hidden from the sender.
 */
export async function flagContent(userId: string, payload: FlagContentPayload): Promise<FlagContentResult> {
	const supportEmail = Bun.env.SUPPORT_EMAIL
	if (!supportEmail) {
		console.error("SUPPORT_EMAIL must be set to receive flags")
		return "notConfigured"
	}

	// count this account's flags before resolving anything, so a flood costs no queries
	if (!(await canFlag(userId))) {
		return "limitReached"
	}

	// check what is being flagged, rejecting anything the sender could not have been looking at
	const subject = await toFlaggedSubject(userId, payload)
	if (!subject) {
		return "unknownSubject"
	}

	// look up the sender's username for the moderator to act on
	const [sender] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId))
	const isAccepted = await sendEmail({
		to: supportEmail,
		subject: `Flagged: ${subject.label}`,
		emailContent: toFlagHtml(subject, sender?.username ?? userId, payload.reason),
		emailKind: "flag-content",
	})

	// a report the mailer rejected never reached support, and its spent slot comes back for the retry
	if (!isAccepted) {
		await refundFlag(userId)
		return "failed"
	}
	return "sent"
}

// what is being flagged. null if it doesn't exist or the sender cannot see it.
async function toFlaggedSubject(
	userId: string,
	payload: FlagContentPayload,
): Promise<{ label: string; path: string } | null> {
	if (payload.subjectKind === "topic") {
		// the same visibility rule the Topic page uses, so anyone who can open a Topic can flag it
		const [topic] = await db
			.select({
				id: topics.id,
				name: topics.name,
				ownerId: topics.ownerId,
				visibility: topics.visibility,
				teamId: topics.teamId,
			})
			.from(topics)
			.where(eq(topics.id, payload.subjectId))
		return topic && (await canSeeTopic(userId, topic)) ? { label: topic.name, path: toTopicPath(topic) } : null
	}

	// a team follows its visibility rule: members can always flag, anyone can flag once it is public
	if (payload.subjectKind === "team") {
		const [team] = await db
			.select({ id: teams.id, name: teams.name, isPublic: teams.isPublic })
			.from(teams)
			.where(eq(teams.id, payload.subjectId))
		// a private team a non-member flags returns null because the sender cannot see it
		if (!team || (!team.isPublic && (await toTeamRole(userId, team.id)) === null)) {
			return null
		}
		return { label: team.name, path: `/teams/${team.id}` }
	}

	// a profile is flagged by user id
	const [user] = await db.select({ username: users.username }).from(users).where(eq(users.id, payload.subjectId))
	return user ? { label: user.username, path: `/profiles/${payload.subjectId}` } : null
}

// the message as the moderator reads it. the reason is in the sender's own words, so it is escaped for safety
function toFlagHtml(subject: { label: string; path: string }, sender: string, reason: string): string {
	const subjectUrl = `${appUrl()}${subject.path}`
	return [
		`<p><strong>${Bun.escapeHTML(subject.label)}</strong> was flagged by ${Bun.escapeHTML(sender)}.</p>`,
		`<p><a href="${Bun.escapeHTML(subjectUrl)}">${Bun.escapeHTML(subjectUrl)}</a></p>`,
		`<p>${Bun.escapeHTML(reason)}</p>`,
	].join("\n")
}

/**
 * Counts one flag against the user's daily rate limit window and returns whether the count is within the limit.
 * A flag that Redis could not count is allowed.
 */
export async function canFlag(userId: string): Promise<boolean> {
	// count the flag in the user's daily rate limit window and return whether the count is within the limit
	const rateLimitWindowHit = await incrementRateLimitWindow(toFlagRateLimitWindowKey(userId), FLAG_RATE_LIMIT_WINDOW_MS)
	return isWithinRateLimit(rateLimitWindowHit, DAILY_FLAG_LIMIT)
}

/**
 * Refunds one flag for a report that the mailer rejected.
 */
export function refundFlag(userId: string): Promise<void> {
	return decrementRateLimitWindow(toFlagRateLimitWindowKey(userId))
}

// the Redis key that a user's flags count under
function toFlagRateLimitWindowKey(userId: string): string {
	return `flags:${userId}`
}

// the flag content route
export const flagContentRoute = new Hono<AppEnv>().post(
	"/flag-content",
	zValidator("json", flagContentPayload),
	async (context) => {
		// only a signed-in user may flag content, so a flag always names an account that can be held to it
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}

		// mail the flag to the moderation address
		const flagResult = await flagContent(userId, context.req.valid("json"))
		if (flagResult === "sent") {
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
