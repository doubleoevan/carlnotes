// the one place topics.subscriber_count is written

import { type DbHandle, db } from "@carlnotes/db"
import { subscriptions, topics } from "@carlnotes/db/schema/topics"
import { and, eq, sql } from "drizzle-orm"

// whether a subscription counts toward its Topic's subscriber count. it must be active and not the owner's own.
// the statement must join the topics row for the owner id
export const isActiveNonOwnerTopicSubscription = and(
	eq(subscriptions.isActive, true),
	sql`${subscriptions.subscriberUserId} is distinct from ${topics.ownerId}`,
)

/**
 * Recount a Topic's effective subscribers and store it. A recount instead of an increment, because a
 * missed increment drifts silently while a recount corrects itself.
 */
export async function updateTopicSubscriberCount(topicId: string, handle: DbHandle = db): Promise<void> {
	// a row lock outside a transaction ends with its own statement, so the default handle opens one around the recount
	if (handle === db) {
		await db.transaction((transaction) => recountTopicSubscribers(topicId, transaction))
		return
	}
	await recountTopicSubscribers(topicId, handle)
}

// lock the topic row, recount its subscribers, and store the count, all on one transaction's handle
async function recountTopicSubscribers(topicId: string, handle: DbHandle): Promise<void> {
	// lock the topic row before the recount. no key update leaves room for the foreign key share a concurrent
	// subscription insert holds on the row, so two accepts of one Topic serialize here instead of deadlocking, and the
	// recount's own statement takes its snapshot after every blocked write on this Topic has committed
	await handle.select({ id: topics.id }).from(topics).where(eq(topics.id, topicId)).for("no key update")

	// count the Topic's active non-owner subscriptions
	const subscriberCount = sql<number>`(
		select count(*) from ${subscriptions}
		where ${subscriptions.topicId} = ${topics.id} and ${isActiveNonOwnerTopicSubscription}
	)`
	await handle.update(topics).set({ subscriberCount }).where(eq(topics.id, topicId))
}
