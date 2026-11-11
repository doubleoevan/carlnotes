// the admin block, which stops one user from reactions and comments everywhere, and its two routes
import { db } from "@carlnotes/db"
import { users } from "@carlnotes/db/schema/users"
import { clearUnseenCommentMentions, loadAuthorMentionedUserIds } from "@carlnotes/db/unseenCommentMentions"
import { eq } from "drizzle-orm"
import { type Context, Hono } from "hono"
import { isAllowed } from "./authorization"
import { type AppEnv, currentUser } from "./currentUser"

/**
 * Sets or clears the admin block on a user, and clears the cached unseen Comment Mentions of each user their Comments
 * mention. Returns whether the user exists.
 */
export async function setAdminBlock(userId: string, blockingAdminUserId: string | null): Promise<boolean> {
	// an admin block records when it was set and by which admin, and clearing it clears both
	const adminBlockedRows = await db
		.update(users)
		.set({ adminBlockedAt: blockingAdminUserId ? new Date() : null, adminBlockedByUserId: blockingAdminUserId })
		.where(eq(users.id, userId))
		.returning({ id: users.id })
	if (adminBlockedRows.length === 0) {
		return false
	}

	// the block hides the user's Comments and clearing it shows them, so each user they mention reads again
	await clearUnseenCommentMentions(await loadAuthorMentionedUserIds(userId))
	return true
}

// sets or clears the admin block on a user as the signed-in admin. clearing it restores what it hid
async function toAdminBlockResponse(
	context: Context<AppEnv>,
	userId: string,
	isAdminBlocked: boolean,
): Promise<Response> {
	const adminUserId = currentUser(context)
	if (!adminUserId) {
		return context.json({ error: "unauthorized" }, 401)
	}

	// only an admin blocks a user everywhere
	if (!(await isAllowed(adminUserId, "admin:setAdminBlock"))) {
		return context.json({ error: "forbidden" }, 403)
	}
	const isUserFound = await setAdminBlock(userId, isAdminBlocked ? adminUserId : null)
	return isUserFound ? context.json({ ok: true }) : context.json({ error: "not found" }, 404)
}

// the admin block routes, each behind the admin:setAdminBlock capability
export const adminBlocksRoute = new Hono<AppEnv>()
	.post("/admin/users/:id/block", (context) => toAdminBlockResponse(context, context.req.param("id"), true))
	.delete("/admin/users/:id/block", (context) => toAdminBlockResponse(context, context.req.param("id"), false))
