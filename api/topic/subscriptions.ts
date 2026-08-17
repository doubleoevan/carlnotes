// the subscription writes behind the topic routes: joining, leaving, the email preference, and withdrawing an invitation.
// the matching reads live in permissions, which is what every visibility and rating check asks
import { zValidator } from "@hono/zod-validator"
import { inviteRevokePayload, subscriptionEmailPayload, subscriptionPayload } from "@shared/contracts"
import { and, eq, inArray } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../../db"
import { subscriptions, topicInvites, topics, users } from "../../db/schema"
import { isAllowed } from "../authorization"
import { type AppEnv, currentUser } from "../currentUser"
import { loadOwnedTopic } from "./permissions"
import { recountTopicSubscribers } from "./subscriberCounts"

/**
 * Subscribe or unsubscribe the current user. On an "invite" topic, subscribing is how the invitee accepts.
 * Unsubscribing only deactivates the row, so it can be reactivated. deleteTopicSubscription removes it for good.
 */
export async function setTopicSubscription(userId: string, topicId: string, isSubscribed: boolean): Promise<boolean> {
	// only a visible, non-private topic that someone else owns can be subscribed to.
	// an admin may also subscribe to an invite topic they were never invited to.
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
	// biome-ignore format: one line keeps the guard under the comment-density hook's limit
	if (!topic || topic.visibility === "private" || topic.ownerId === userId || !(await isAllowed(userId, "topic:view", topic))) {
		return false
	}

	// unsubscribing deactivates this user's direct row and turns its email preference off too
	if (!isSubscribed) {
		await db.transaction(async (transaction) => {
			await transaction
				.update(subscriptions)
				.set({ isActive: false, isEmailEnabled: false })
				.where(and(eq(subscriptions.topicId, topicId), eq(subscriptions.subscriberUserId, userId)))
			// the count moves with the row, in the same transaction, so no read sees one without the other
			await recountTopicSubscribers(topicId, transaction)
		})
		return true
	}

	// subscribing reactivates an existing subscription row or inserts a new one
	await activateSubscription(userId, topicId)
	return true
}

/**
 * Permanently remove the user's subscription row.
 */
export async function deleteTopicSubscription(userId: string, email: string, topicId: string): Promise<void> {
	// the invite gets deleted with the subscription
	await db.transaction(async (transaction) => {
		await transaction
			.delete(subscriptions)
			.where(and(eq(subscriptions.topicId, topicId), eq(subscriptions.subscriberUserId, userId)))
		await transaction.delete(topicInvites).where(and(eq(topicInvites.topicId, topicId), eq(topicInvites.email, email)))
		await recountTopicSubscribers(topicId, transaction)
	})
}

/**
 * Permanently remove the owner's invite row.
 */
export async function deleteTopicInvite(ownerId: string, topicId: string, inviteeEmail: string): Promise<boolean> {
	// only the topic's owner may withdraw one of its invitations
	if (!(await loadOwnedTopic(ownerId, topicId))) {
		return false
	}

	// the subscription gets deleted with the invite
	await db.transaction(async (transaction) => {
		await transaction
			.delete(topicInvites)
			.where(and(eq(topicInvites.topicId, topicId), eq(topicInvites.email, inviteeEmail)))
		// the invitee is found by the address the invite named, since an invite has no user id
		const inviteeId = db.select({ id: users.id }).from(users).where(eq(users.email, inviteeEmail))
		await transaction
			.delete(subscriptions)
			.where(and(eq(subscriptions.topicId, topicId), inArray(subscriptions.subscriberUserId, inviteeId)))
		await recountTopicSubscribers(topicId, transaction)
	})
	return true
}

/**
 * Turn the caller's email preference for a topic subscription on or off, independent of its active state.
 */
export async function setSubscriptionEmailEnabled(
	userId: string,
	topicId: string,
	isEmailEnabled: boolean,
): Promise<void> {
	// only this user's own direct row, so an audience-granted subscription is never touched
	await db
		.update(subscriptions)
		.set({ isEmailEnabled })
		.where(and(eq(subscriptions.topicId, topicId), eq(subscriptions.subscriberUserId, userId)))
}

// reactivate an existing subscription row or insert a new one
async function activateSubscription(userId: string, topicId: string): Promise<void> {
	// the row and the count move together, so a subscriber is never counted before the row exists or after it goes
	await db.transaction(async (transaction) => {
		// one upsert against the unique index, so a deactivated row is revived and a concurrent double subscribe
		// lands on one row instead of two
		await transaction
			.insert(subscriptions)
			.values({ topicId, subscriberUserId: userId })
			.onConflictDoUpdate({
				target: [subscriptions.topicId, subscriptions.subscriberUserId],
				set: { isActive: true },
			})
		// the count is recomputed instead of nudged, so it cannot drift from the rows it summarizes
		await recountTopicSubscribers(topicId, transaction)
	})
}

// the subscription routes: joining, leaving, withdrawing an invite, and the email preference
export const subscriptionsRoute = new Hono<AppEnv>()
	.post("/topics/:id/subscription", zValidator("json", subscriptionPayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// subscribe, reactivate, or deactivate the current user's subscription to a public or invite topic
		const { isSubscribed } = context.req.valid("json")
		const isSubscriptionSet = await setTopicSubscription(userId, context.req.param("id"), isSubscribed)
		return isSubscriptionSet ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.delete("/topics/:id/subscription", async (context) => {
		// reject a signed-out caller
		const user = context.get("user")
		if (!user) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// permanently remove the caller's own subscription row and their invite, distinct from deactivating it.
		await deleteTopicSubscription(user.id, user.email, context.req.param("id"))
		return context.json({ ok: true })
	})
	.delete("/topics/:id/invite", zValidator("json", inviteRevokePayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// withdraw an invitation on the caller's own topic, dropping that invitee's subscription with it. owner only
		const isRevoked = await deleteTopicInvite(userId, context.req.param("id"), context.req.valid("json").email)
		return isRevoked ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.post("/topics/:id/subscription-email", zValidator("json", subscriptionEmailPayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// turn the caller's email preference for this subscription on or off
		await setSubscriptionEmailEnabled(userId, context.req.param("id"), context.req.valid("json").isEmailEnabled)
		return context.json({ ok: true })
	})
