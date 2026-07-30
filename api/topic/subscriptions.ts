// the subscription writes behind the topic routes: joining, leaving, the email preference, and withdrawing an invitation.
// the matching reads live in permissions, which is what every visibility and rating check asks
import { and, eq, inArray } from "drizzle-orm"
import { db } from "../../db"
import { subscriptions, topicInvites, topics, users } from "../../db/schema"
import { canSeeTopic, loadDirectSubscription, loadOwnedTopic } from "./permissions"

/**
 * Subscribe or unsubscribe the current user. On an "invite" topic, subscribing is how the invitee accepts.
 * Unsubscribing only deactivates the row, so it can be reactivated. deleteTopicSubscription removes it for good.
 */
export async function setTopicSubscription(userId: string, topicId: string, isSubscribed: boolean): Promise<boolean> {
	// only a visible, non-private topic that someone else owns can be subscribed to
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
	if (!topic || topic.visibility === "private" || topic.ownerId === userId || !(await canSeeTopic(userId, topic))) {
		return false
	}

	// unsubscribing deactivates this user's direct row and turns its email preference off too
	if (!isSubscribed) {
		await db
			.update(subscriptions)
			.set({ isActive: false, isEmailEnabled: false })
			.where(and(eq(subscriptions.topicId, topicId), eq(subscriptions.subscriberUserId, userId)))
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
	await db
		.delete(subscriptions)
		.where(and(eq(subscriptions.topicId, topicId), eq(subscriptions.subscriberUserId, userId)))
	await db.delete(topicInvites).where(and(eq(topicInvites.topicId, topicId), eq(topicInvites.email, email)))
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
	await db.delete(topicInvites).where(and(eq(topicInvites.topicId, topicId), eq(topicInvites.email, inviteeEmail)))
	const inviteeId = db.select({ id: users.id }).from(users).where(eq(users.email, inviteeEmail))
	await db
		.delete(subscriptions)
		.where(and(eq(subscriptions.topicId, topicId), inArray(subscriptions.subscriberUserId, inviteeId)))
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
	const existingSubscription = await loadDirectSubscription(userId, topicId)
	if (existingSubscription) {
		await db.update(subscriptions).set({ isActive: true }).where(eq(subscriptions.id, existingSubscription.id))
		return
	}
	await db.insert(subscriptions).values({ topicId, subscriberUserId: userId })
}
