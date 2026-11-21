// a user's subscriptions to topics: which topics they subscribe to, and when each subscription became active

import { and, eq, inArray, sql } from "drizzle-orm"
import { db } from "./index"
import { subscriptions } from "./schema/topics"

/**
 * Returns the ids of the topics the user subscribes to among the given ones. The owner's own subscription exists from
 * creation.
 */
export async function loadSubscribedTopicIds(userId: string, topicIds: string[]): Promise<Set<string>> {
	// an empty selection needs no database query
	if (topicIds.length === 0) {
		return new Set()
	}

	// load active subscriptions within the selection
	const subscriptionRows = await db
		.select({ topicId: subscriptions.topicId })
		.from(subscriptions)
		.where(
			and(
				eq(subscriptions.subscriberUserId, userId),
				eq(subscriptions.isActive, true),
				inArray(subscriptions.topicId, topicIds),
			),
		)
	return new Set(subscriptionRows.map((subscriptionRow) => subscriptionRow.topicId))
}

// an active subscription on the topic is the grant. deactivating one ends it without losing the row
export async function hasSubscription(userId: string, topicId: string): Promise<boolean> {
	const [subscription] = await db
		.select({ id: subscriptions.id })
		.from(subscriptions)
		.where(
			and(
				eq(subscriptions.topicId, topicId),
				eq(subscriptions.subscriberUserId, userId),
				eq(subscriptions.isActive, true),
			),
		)
		.limit(1)
	return subscription !== undefined
}

/**
 * When the user's subscription to the topic became active, or null with no active subscription.
 */
export async function subscriptionActivatedAt(userId: string, topicId: string): Promise<Date | null> {
	const activatedAtByTopicId = await subscriptionActivatedAtByTopicId(userId, [topicId])
	return activatedAtByTopicId.get(topicId) ?? null
}

/**
 * When the user's subscription to each of the topics became active, by topic id. A topic with no active subscription
 * has no entry.
 */
export async function subscriptionActivatedAtByTopicId(userId: string, topicIds: string[]): Promise<Map<string, Date>> {
	// an empty id list matches nothing, so skip the query
	if (topicIds.length === 0) {
		return new Map()
	}

	// the earliest activation of each topic wins
	const activationRows = await db
		.select({
			topicId: subscriptions.topicId,
			activatedAt: sql<Date | string>`min(${subscriptions.createdAt})`,
		})
		.from(subscriptions)
		.where(
			and(
				inArray(subscriptions.topicId, topicIds),
				eq(subscriptions.subscriberUserId, userId),
				eq(subscriptions.isActive, true),
			),
		)
		.groupBy(subscriptions.topicId)
	return new Map(activationRows.map((activationRow) => [activationRow.topicId, new Date(activationRow.activatedAt)]))
}

/**
 * A topic is only visible after the first scan after its activation.
 */
export function isVisibleAfterActivation(scanStartedAt: Date, activatedAt: Date | null): boolean {
	return activatedAt !== null && scanStartedAt > activatedAt
}

/**
 * Returns whether a time passes the user's subscription activation gate. No gate passes every time, no active
 * subscription passes none, and an activation passes only a later time.
 */
export function isAfterSubscriberActivation(
	time: Date | null,
	subscriberActivatedAt: Date | null | undefined,
): boolean {
	if (subscriberActivatedAt === undefined) {
		return true
	}
	return subscriberActivatedAt !== null && time !== null && time > subscriberActivatedAt
}

/**
 * The user's direct subscription row on a topic, ignoring team member paths.
 */
export async function loadDirectSubscription(
	userId: string,
	topicId: string,
): Promise<{ id: string; isActive: boolean } | undefined> {
	// the topic and this user's id together identify at most one row
	const [subscription] = await db
		.select({ id: subscriptions.id, isActive: subscriptions.isActive })
		.from(subscriptions)
		.where(and(eq(subscriptions.topicId, topicId), eq(subscriptions.subscriberUserId, userId)))
		.limit(1)
	return subscription
}
