// the subscription writes for the topic routes
import { zValidator } from "@hono/zod-validator"
import { inviteDeletePayload, subscriptionEmailPayload, subscriptionPayload } from "@shared/contracts"
import { and, eq, inArray, or } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../../db"
import { invites, subscriptions, topics, users } from "../../db/schema"
import { isAllowed } from "../authorization"
import { type AppEnv, currentUser } from "../currentUser"
import { loadOwnedTopic, verifiedEmailQuery } from "./permissions"
import { updateTopicSubscriberCount } from "./subscriberCounts"

/**
 * Subscribe or unsubscribe the current user. On an "invite" topic, subscribing is how the invitee accepts.
 * Unsubscribing only deactivates the row, so it can be reactivated. deleteTopicSubscription removes it for good.
 */
export async function setTopicSubscription(userId: string, topicId: string, isSubscribed: boolean): Promise<boolean> {
	// only a visible topic can be subscribed to
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
	if (!topic || !(await isAllowed(userId, "topic:view", topic))) {
		return false
	}

	// the owner's subscription exists from creation, so the subscribe direction only ever restores it.
	const isTopicOwner = topic.ownerId === userId
	if (isTopicOwner && !isSubscribed) {
		return false
	}
	if (!isTopicOwner && topic.visibility === "private") {
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
			await updateTopicSubscriberCount(topicId, transaction)
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
export async function deleteTopicSubscription(userId: string, topicId: string): Promise<void> {
	// the invite gets deleted with the subscription
	await db.transaction(async (transaction) => {
		await transaction
			.delete(subscriptions)
			.where(and(eq(subscriptions.topicId, topicId), eq(subscriptions.subscriberUserId, userId)))
		// the invite matches by resolved account or by a verified address, and the count updates after deletion
		await transaction
			.delete(invites)
			.where(
				and(
					eq(invites.topicId, topicId),
					or(inArray(invites.email, verifiedEmailQuery(userId)), eq(invites.invitedUserId, userId)),
				),
			)
		await updateTopicSubscriberCount(topicId, transaction)
	})
}

/**
 * Permanently remove the owner's invite row, whether it names an email or a username.
 */
export async function deleteTopicInvite(ownerId: string, topicId: string, inviteId: string): Promise<boolean> {
	// only the topic's owner may delete one of its invitations
	if (!(await loadOwnedTopic(ownerId, topicId))) {
		return false
	}

	// the row scoped to this topic, read first so the invitee's subscription is deleted with it
	const [invite] = await db
		.select({ id: invites.id, email: invites.email, invitedUserId: invites.invitedUserId })
		.from(invites)
		.where(and(eq(invites.id, inviteId), eq(invites.topicId, topicId)))
	if (!invite) {
		return false
	}

	// the subscription gets deleted with the invite
	await db.transaction(async (transaction) => {
		await transaction.delete(invites).where(eq(invites.id, invite.id))
		// the invitee is the resolved account, or whoever holds the invited address
		const inviteeId = invite.invitedUserId
			? db.select({ id: users.id }).from(users).where(eq(users.id, invite.invitedUserId))
			: db
					.select({ id: users.id })
					.from(users)
					.where(eq(users.email, invite.email ?? ""))
		// their subscription rows are deleted with it, and the count updates after
		await transaction
			.delete(subscriptions)
			.where(and(eq(subscriptions.topicId, topicId), inArray(subscriptions.subscriberUserId, inviteeId)))
		await updateTopicSubscriberCount(topicId, transaction)
	})
	return true
}

/**
 * Turn the user's email preference for a topic subscription on or off, independent of its active state.
 */
export async function setSubscriptionEmailEnabled(
	userId: string,
	topicId: string,
	isEmailEnabled: boolean,
): Promise<void> {
	// only this user's own row on this topic
	await db
		.update(subscriptions)
		.set({ isEmailEnabled })
		.where(and(eq(subscriptions.topicId, topicId), eq(subscriptions.subscriberUserId, userId)))
}

/**
 * Reactivate an existing subscription row or insert a new one. Accepting an invite token joins through here too.
 */
export async function activateSubscription(userId: string, topicId: string): Promise<void> {
	// the subscription delivers at the topic's own frequency
	const [topic] = await db.select({ frequency: topics.frequency }).from(topics).where(eq(topics.id, topicId))
	const frequency = topic ? { frequency: topic.frequency } : {}

	// the row and the count move together, so a subscriber is never counted before the row exists or after it is deleted
	await db.transaction(async (transaction) => {
		// one upsert against the unique index. a re-subscribe re-syncs the frequency and keeps the email choice
		await transaction
			.insert(subscriptions)
			.values({ topicId, subscriberUserId: userId, ...frequency })
			.onConflictDoUpdate({
				target: [subscriptions.topicId, subscriptions.subscriberUserId],
				set: { isActive: true, ...frequency },
			})
		// the count is recomputed instead of nudged, so it cannot drift from the rows it summarizes
		await updateTopicSubscriberCount(topicId, transaction)
	})
}

// the subscription routes: joining, leaving, deleting an invite, and the email preference
export const subscriptionsRoute = new Hono<AppEnv>()
	.post("/topics/:id/subscription", zValidator("json", subscriptionPayload), async (context) => {
		// reject a signed-out visitor
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
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// permanently remove the user's own subscription row and their invite, distinct from deactivating it
		await deleteTopicSubscription(userId, context.req.param("id"))
		return context.json({ ok: true })
	})
	.delete("/topics/:id/invite", zValidator("json", inviteDeletePayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// delete an invitation on the user's own topic, dropping that invitee's subscription with it. owner only
		const isDeleted = await deleteTopicInvite(userId, context.req.param("id"), context.req.valid("json").inviteId)
		return isDeleted ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.post("/topics/:id/subscription-email", zValidator("json", subscriptionEmailPayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// an admin switches anybody's, so a support request never needs a database console
		const { isEmailEnabled, subscriberUserId } = context.req.valid("json")
		const isActingForAnother = subscriberUserId !== undefined && subscriberUserId !== userId
		if (isActingForAnother && !(await isAllowed(userId, "admin:console"))) {
			return context.json({ error: "forbidden" }, 403)
		}
		await setSubscriptionEmailEnabled(subscriberUserId ?? userId, context.req.param("id"), isEmailEnabled)
		return context.json({ ok: true })
	})
