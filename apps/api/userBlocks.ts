// user blocks: writing and clearing one, and listing a user's. the read filter is in @carlnotes/db/contentFilters
import type { BlockedUser } from "@carlnotes/contracts/blocks"
import { db } from "@carlnotes/db"
import { deleteRedisKeys } from "@carlnotes/db/redis"
import { userBlocks } from "@carlnotes/db/schema/userBlocks"
import { users } from "@carlnotes/db/schema/users"
import { and, desc, eq } from "drizzle-orm"
import { Hono } from "hono"
import { toUnseenChatMentionCountKey } from "./chat/mentions"
import { type AppEnv, currentUser } from "./currentUser"
import { loadUsername } from "./usernames"

/**
 * Blocks a user for the blocker and drops the blocker's cached mention count, which the blocked person's mentions
 * no longer count toward. A repeat block writes nothing.
 */
export async function blockUser(blockerUserId: string, blockedUserId: string): Promise<void> {
	await db.insert(userBlocks).values({ blockerUserId, blockedUserId }).onConflictDoNothing()
	await deleteRedisKeys(toUnseenChatMentionCountKey(blockerUserId))
}

/**
 * Removes the blocker's block of a user.
 */
export async function unblockUser(blockerUserId: string, blockedUserId: string): Promise<void> {
	await db
		.delete(userBlocks)
		.where(and(eq(userBlocks.blockerUserId, blockerUserId), eq(userBlocks.blockedUserId, blockedUserId)))
	await deleteRedisKeys(toUnseenChatMentionCountKey(blockerUserId))
}

/**
 * Returns whether the blocker has blocked the user.
 */
export async function isUserBlocked(blockerUserId: string, blockedUserId: string): Promise<boolean> {
	const [blockRow] = await db
		.select({ blockedUserId: userBlocks.blockedUserId })
		.from(userBlocks)
		.where(and(eq(userBlocks.blockerUserId, blockerUserId), eq(userBlocks.blockedUserId, blockedUserId)))
		.limit(1)
	return Boolean(blockRow)
}

/**
 * Loads the users a user has blocked, newest block first.
 */
export async function loadBlockedUsers(blockerUserId: string): Promise<BlockedUser[]> {
	// each block joined to the blocked person's current username
	const blockedUserRows = await db
		.select({ id: users.id, username: users.username, blockedAt: userBlocks.createdAt })
		.from(userBlocks)
		.innerJoin(users, eq(users.id, userBlocks.blockedUserId))
		.where(eq(userBlocks.blockerUserId, blockerUserId))
		.orderBy(desc(userBlocks.createdAt))

	// the block time as the api sends dates
	return blockedUserRows.map((blockedUserRow) => ({
		...blockedUserRow,
		blockedAt: blockedUserRow.blockedAt.toISOString(),
	}))
}

/**
 * Loads the ids of the people a user has blocked, for a read that filters rows after loading them.
 */
export async function loadBlockedUserIds(blockerUserId: string): Promise<Set<string>> {
	const blockedUserRows = await db
		.select({ blockedUserId: userBlocks.blockedUserId })
		.from(userBlocks)
		.where(eq(userBlocks.blockerUserId, blockerUserId))
	return new Set(blockedUserRows.map((blockedUserRow) => blockedUserRow.blockedUserId))
}

// the block routes: block a user, unblock them, and list the blocker's blocked people
export const userBlocksRoute = new Hono<AppEnv>()
	.post("/users/:id/block", async (context) => {
		// reject a signed-out visitor, a self block, and an unknown user
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		const blockedUserId = context.req.param("id")
		if (blockedUserId === userId) {
			return context.json({ error: "you cannot block yourself" }, 400)
		}
		// the user must exist
		if (!(await loadUsername(blockedUserId))) {
			return context.json({ error: "not found" }, 404)
		}

		// write the block
		await blockUser(userId, blockedUserId)
		return context.json({ ok: true })
	})
	.delete("/users/:id/block", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}

		// remove the block
		await unblockUser(userId, context.req.param("id"))
		return context.json({ ok: true })
	})
	.get("/users/me/blocks", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		return context.json({ blockedUsers: await loadBlockedUsers(userId) })
	})
