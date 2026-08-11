// a user flagging a Topic or profile. the report is mailed to the SUPPORT_EMAIL address
import { zValidator } from "@hono/zod-validator"
import { type FlagContentPayload, flagContentPayload } from "@shared/contracts"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../db"
import { topics, users } from "../db/schema"
import { sendEmail } from "../worker/email"
import { type AppEnv, currentUser } from "./currentUser"
import { canSeeTopic } from "./topic/permissions"

// how many flags one user may send in a day
const DAILY_FLAG_LIMIT = 10

// how many flags each account has sent, and when its day started.
const flagCounts = new Map<string, { count: number; windowStartedAt: number }>()
const FLAG_WINDOW_MS = 24 * 60 * 60 * 1000

// what came of a flag, so the route can answer each outcome differently
export type FlagContentResult = "sent" | "unknownSubject" | "limitReached" | "notConfigured"

/**
 * Mail a flag to the support address. The subject is resolved first, so a flag naming something that does not exist,
 * or a Topic the sender cannot see, is rejected instead of mailed.
 */
export async function flagContent(userId: string, payload: FlagContentPayload): Promise<FlagContentResult> {
	const supportEmail = Bun.env.SUPPORT_EMAIL
	if (!supportEmail) {
		console.error("SUPPORT_EMAIL must be set to receive flags")
		return "notConfigured"
	}

	// count this account's flags before resolving anything, so a flood costs no queries
	if (!canFlag(userId)) {
		return "limitReached"
	}

	// check what is being flagged, refusing anything the sender could not have been looking at
	const subject = await toFlaggedSubject(userId, payload)
	if (!subject) {
		return "unknownSubject"
	}

	// send the user's their username for the moderator to act on
	const [sender] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId))
	await sendEmail({
		to: supportEmail,
		subject: `Flagged: ${subject.label}`,
		emailContent: toFlagHtml(subject, sender?.username ?? userId, payload.reason),
		emailKind: "flag-content",
	})
	return "sent"
}

// what is being flagged. null when it doesn't exist or the sender cannot see it.
async function toFlaggedSubject(
	userId: string,
	payload: FlagContentPayload,
): Promise<{ label: string; path: string } | null> {
	if (payload.subjectKind === "topic") {
		// the same visibility rule the Topic page uses, so anyone who can open a Topic can flag it
		const [topic] = await db
			.select({ id: topics.id, name: topics.name, ownerId: topics.ownerId, visibility: topics.visibility })
			.from(topics)
			.where(eq(topics.id, payload.subjectId))
		return topic && (await canSeeTopic(userId, topic)) ? { label: topic.name, path: `/topics/${topic.id}` } : null
	}

	// a profile is flagged by user id
	const [user] = await db.select({ username: users.username }).from(users).where(eq(users.id, payload.subjectId))
	return user ? { label: user.username, path: `/profiles/${payload.subjectId}` } : null
}

// the message as the moderator reads it. the reason is in the sender's own words, so it is escaped for safety
function toFlagHtml(subject: { label: string; path: string }, sender: string, reason: string): string {
	const appUrl = Bun.env.BETTER_AUTH_URL ?? ""
	return [
		`<p><strong>${Bun.escapeHTML(subject.label)}</strong> was flagged by ${Bun.escapeHTML(sender)}.</p>`,
		`<p><a href="${Bun.escapeHTML(appUrl + subject.path)}">${Bun.escapeHTML(appUrl + subject.path)}</a></p>`,
		`<p>${Bun.escapeHTML(reason)}</p>`,
	].join("\n")
}

// whether this user can still flag content. limited to avoid getting spammed.
function canFlag(userId: string): boolean {
	const now = Date.now()
	const spent = flagCounts.get(userId)
	// the first flag, or one after the day has run out resets the counter
	if (!spent || now - spent.windowStartedAt > FLAG_WINDOW_MS) {
		flagCounts.set(userId, { count: 1, windowStartedAt: now })
		return true
	}

	// check if the user has hit the limit or increment the count and return true
	if (spent.count >= DAILY_FLAG_LIMIT) {
		return false
	}
	spent.count += 1
	return true
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
		// each rejection answers in its own terms, so the dialog can say what actually went wrong
		if (flagResult === "limitReached") {
			return context.json({ error: "you have sent enough reports for one day" }, 429)
		}
		return flagResult === "unknownSubject"
			? context.json({ error: "not found" }, 404)
			: context.json({ error: "reports are not configured" }, 503)
	},
)
