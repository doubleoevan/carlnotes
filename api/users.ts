// closing a user account, whether an admin does it from the console or the user does it from their own account page.
// the users row cascades to every table that references it. this handles only what a cascade cannot reach:
// the Stripe subscription, the stored objects in R2, and the LiteLLM key
import { trackEvent } from "@shared/analytics"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../db"
import { topics, users } from "../db/schema"
import { deleteAttachment } from "../worker"
import { isAllowed } from "./authorization"
import { cancelUserSubscription } from "./billing"
import { deleteStoredChatAttachments } from "./chat/attachments"
import { type AnalyticsProperties, type AppEnv, currentUser, toAnalyticsProperties } from "./currentUser"
import { deleteLiteLLMKey } from "./litellm"
import { deleteTopic } from "./topic/topics"

/**
 * Close an account and everything it owns. False when there is no such user.
 *
 * Whatever can still spend money is retired first, so a user cannot get charged with no row to explain it.
 */
export async function deleteUser(
	actingUserId: string,
	targetUserId: string,
	analyticsProperties: AnalyticsProperties,
): Promise<boolean> {
	const [user] = await db
		.select({ id: users.id, avatarKey: users.avatarKey, litellmVirtualKey: users.litellmVirtualKey })
		.from(users)
		.where(eq(users.id, targetUserId))
	if (!user) {
		return false
	}

	// the two things that can still spend money go first, while the account is whole. a thrown error in either
	// aborts the delete, which is recoverable. retiring them after the row would leave a key nothing can name
	await cancelUserSubscription(targetUserId)
	if (user.litellmVirtualKey) {
		await deleteLiteLLMKey(user.litellmVirtualKey)
	}

	// each owned topic goes through the topic delete, which clears its attachments out of storage and
	// releases its featured position. the rows would cascade, but the stored objects behind them would not
	const ownedTopics = await db.select({ id: topics.id }).from(topics).where(eq(topics.ownerId, targetUserId))
	for (const topic of ownedTopics) {
		await deleteTopic(actingUserId, topic.id, analyticsProperties)
	}

	// delete everything kept in chat, including on other people's topics, which the deletes above never reached
	await deleteStoredChatAttachments(targetUserId)

	// delete the avatar object if they uploaded one
	if (user.avatarKey) {
		await deleteAttachment(user.avatarKey).catch((error) => console.error("avatar delete failed", error))
	}

	// delete the user row which cascades to sessions, accounts, subscriptions, bookmarks, and the rest
	await db.delete(users).where(eq(users.id, targetUserId))

	// the row is gone, so this analytics event is the only record of who closed it
	trackEvent("account_deleted", actingUserId, {
		...analyticsProperties,
		targetUserId,
		isSelf: actingUserId === targetUserId,
	})
	return true
}

// closing an account: an admin closing someone else's, and a user closing their own
export const usersRoute = new Hono<AppEnv>()
	.delete("/admin/users/:id", async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// closing someone else's account is admin only
		if (!(await isAllowed(userId, "admin:deleteUser"))) {
			return context.json({ error: "forbidden" }, 403)
		}
		// an admin closes their own account from their account page. the admin console never deletes the current user
		if (context.req.param("id") === userId) {
			return context.json({ error: "close your own account from the account page" }, 409)
		}
		const isDeleted = await deleteUser(userId, context.req.param("id"), toAnalyticsProperties(context))
		return isDeleted ? context.json({ ok: true }) : context.json({ error: "not found" }, 404)
	})
	.delete("/users/me", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// a user closes their own account which gets tracked as an analytics event
		await deleteUser(userId, userId, toAnalyticsProperties(context))
		return context.json({ ok: true })
	})
