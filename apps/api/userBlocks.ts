// user blocks: writing and clearing one, and listing a user's. the read filter is in @carlnotes/db/contentFilters
import { toAvatarVersion } from "@carlnotes/contracts/avatars"
import type { UserBlock } from "@carlnotes/contracts/userBlocks"
import { db } from "@carlnotes/db"
import { deleteRedisKeys } from "@carlnotes/db/redis"
import { userBlocks } from "@carlnotes/db/schema/userBlocks"
import { users } from "@carlnotes/db/schema/users"
import { clearUnseenCommentMentions } from "@carlnotes/db/unseenCommentMentions"
import { and, desc, eq } from "drizzle-orm"
import { Hono } from "hono"
import { toUnseenChatMentionCountKey } from "./chat/mentions"
import { type AppEnv, currentUser } from "./currentUser"
import { loadUsername } from "./usernames"

/**
 * Saves the blocker's user block of a user and drops the blocker's cached mention count, which the blocked user's mentions
 * no longer count toward. A repeat user block writes nothing.
 */
export async function saveUserBlock(blockerUserId: string, blockedUserId: string): Promise<void> {
	await db.insert(userBlocks).values({ blockerUserId, blockedUserId }).onConflictDoNothing()
	await deleteRedisKeys(toUnseenChatMentionCountKey(blockerUserId))
	// a user block hides each one's comments from the other, so both read their comment mentions again
	await clearUnseenCommentMentions([blockerUserId, blockedUserId])
}

/**
 * Removes the blocker's user block of a user.
 */
export async function deleteUserBlock(blockerUserId: string, blockedUserId: string): Promise<void> {
	await db
		.delete(userBlocks)
		.where(and(eq(userBlocks.blockerUserId, blockerUserId), eq(userBlocks.blockedUserId, blockedUserId)))
	await deleteRedisKeys(toUnseenChatMentionCountKey(blockerUserId))
	await clearUnseenCommentMentions([blockerUserId, blockedUserId])
}

/**
 * Returns whether the blocker has blocked the user.
 */
export async function hasUserBlock(blockerUserId: string, blockedUserId: string): Promise<boolean> {
	const [userBlockRow] = await db
		.select({ blockedUserId: userBlocks.blockedUserId })
		.from(userBlocks)
		.where(and(eq(userBlocks.blockerUserId, blockerUserId), eq(userBlocks.blockedUserId, blockedUserId)))
		.limit(1)
	return Boolean(userBlockRow)
}

/**
 * Loads the users a user has blocked, newest user block first.
 */
export async function loadUserBlocks(blockerUserId: string): Promise<UserBlock[]> {
	// each user block joined to the blocked user's current username and avatar
	const userBlockRows = await db
		.select({
			id: users.id,
			username: users.username,
			avatarSource: users.avatarSource,
			avatarKey: users.avatarKey,
			blockedAt: userBlocks.createdAt,
		})
		.from(userBlocks)
		.innerJoin(users, eq(users.id, userBlocks.blockedUserId))
		.where(eq(userBlocks.blockerUserId, blockerUserId))
		.orderBy(desc(userBlocks.createdAt))

	// the avatar and the user block time as the api sends them
	return userBlockRows.map((userBlockRow) => ({
		id: userBlockRow.id,
		username: userBlockRow.username,
		avatarSource: userBlockRow.avatarSource,
		avatarVersion: toAvatarVersion(userBlockRow),
		blockedAt: userBlockRow.blockedAt.toISOString(),
	}))
}

/**
 * Loads the ids of the people a user has blocked, for a read that filters rows after loading them.
 */
export async function loadUserBlockedIds(blockerUserId: string): Promise<Set<string>> {
	const userBlockRows = await db
		.select({ blockedUserId: userBlocks.blockedUserId })
		.from(userBlocks)
		.where(eq(userBlocks.blockerUserId, blockerUserId))
	return new Set(userBlockRows.map((userBlockRow) => userBlockRow.blockedUserId))
}

// the user block routes: block a user, unblock them, and list the blocker's blocked users
export const userBlocksRoute = new Hono<AppEnv>()
	.post("/users/:id/block", async (context) => {
		// reject a signed-out visitor, a self user block, and an unknown user
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

		// write the user block
		await saveUserBlock(userId, blockedUserId)
		return context.json({ ok: true })
	})
	.delete("/users/:id/block", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}

		// remove the user block
		await deleteUserBlock(userId, context.req.param("id"))
		return context.json({ ok: true })
	})
	.get("/users/me/blocks", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		return context.json({ blockedUsers: await loadUserBlocks(userId) })
	})
