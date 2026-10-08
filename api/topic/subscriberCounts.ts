// the one place topics.subscriber_count is written
import { eq, sql } from "drizzle-orm"
import { type DbHandle, db } from "../../db"
import { subscriptions, topics } from "../../db/schema"

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
	// the owner subscribes to their own Topic for delivery, and has never counted as one of its subscribers
	const subscriberCount = sql<number>`(
		select count(*) from (${activeSubscribers}) as effective_subscribers
		where subscriber_id is distinct from ${topics.ownerId}
	)`
	await handle.update(topics).set({ subscriberCount }).where(eq(topics.id, topicId))
}
