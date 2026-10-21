// the one place topics.subscriber_count is written

import { type DbHandle, db } from "@carlnotes/db"
import { subscriptions, topics } from "@carlnotes/db/schema/topics"
import { eq, sql } from "drizzle-orm"

// everyone subscribed to a Topic, one row per active subscriber
const activeSubscribers = sql`
	select ${subscriptions.subscriberUserId} as subscriber_id
		from ${subscriptions}
		where ${subscriptions.topicId} = ${topics.id}
			and ${subscriptions.isActive}`

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

	// the owner subscribes to their own Topic for delivery, and has never counted as one of its subscribers
	const subscriberCount = sql<number>`(
		select count(*) from (${activeSubscribers}) as effective_subscribers
		where subscriber_id is distinct from ${topics.ownerId}
	)`
	await handle.update(topics).set({ subscriberCount }).where(eq(topics.id, topicId))
}
