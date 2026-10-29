// the Terms acceptance gate: a write that other users read is rejected while the account's accepted version is older
// than the published one, and the acceptance route records the current version
import {
	isTermsVersionCurrent,
	TERMS_OUTDATED_REJECTION,
	TERMS_VERSION,
	type TermsOutdatedResponse,
} from "@carlnotes/contracts/terms"
import { db } from "@carlnotes/db"
import { users } from "@carlnotes/db/schema/users"
import { eq } from "drizzle-orm"
import { type Context, Hono } from "hono"
import { type AppEnv, currentUser } from "./currentUser"
import { refreshSessionUser } from "./sessions"

/**
 * Returns the 403 a stale account's user-content write gets, or null if the session's account accepted the published
 * version. A visitor gets null too. The route's own sign-in check rejects them. A session cached before the column
 * existed has no version, and is gated like an account that never accepted.
 */
export function toTermsOutdatedResponse(context: Context<AppEnv>): Response | null {
	const sessionUser = context.get("user")
	if (!sessionUser || isTermsVersionCurrent(sessionUser.termsAcceptedVersion ?? null)) {
		return null
	}
	return toTermsOutdatedRejection(context)
}

/**
 * Returns the 403 that names the published version.
 */
export function toTermsOutdatedRejection(context: Context<AppEnv>): Response {
	const body: TermsOutdatedResponse = { rejection: TERMS_OUTDATED_REJECTION, termsVersion: TERMS_VERSION }
	return context.json(body, 403)
}

/**
 * Returns whether the account accepted the published version, read from its row, for a write that has no session.
 */
export async function hasAcceptedCurrentTerms(userId: string): Promise<boolean> {
	const [userRow] = await db
		.select({ termsAcceptedVersion: users.termsAcceptedVersion })
		.from(users)
		.where(eq(users.id, userId))
	return isTermsVersionCurrent(userRow?.termsAcceptedVersion ?? null)
}

// the acceptance route: the signed-in user accepts the published version, and their sessions hold it from then on
export const termsAcceptanceRoute = new Hono<AppEnv>().post("/users/me/terms-acceptance", async (context) => {
	// reject a signed-out visitor
	const userId = currentUser(context)
	if (!userId) {
		return context.json({ error: "unauthorized" }, 401)
	}

	// write the version and the time to the row, then to the user's sessions
	const termsAcceptedAt = new Date()
	await db.update(users).set({ termsAcceptedVersion: TERMS_VERSION, termsAcceptedAt }).where(eq(users.id, userId))
	await refreshSessionUser(userId)
	return context.json({ termsVersion: TERMS_VERSION, termsAcceptedAt: termsAcceptedAt.toISOString() })
})
