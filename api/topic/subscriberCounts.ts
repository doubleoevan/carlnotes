// the one place topics.subscriber_count is written. every path that changes who effectively follows a Topic
// calls this inside its own transaction, so the stored number cannot drift from the rows it summarizes
import { eq, sql } from "drizzle-orm"
import { db } from "../../db"
import { audienceMembers, subscriptions, topics } from "../../db/schema"

// the transaction a caller is already inside, or the pool when there is none
type DbHandle = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

// everyone who follows a Topic directly, which is the common path
const directSubscribers = sql`
	select ${subscriptions.subscriberUserId} as subscriber_id
		from ${subscriptions}
		where ${subscriptions.topicId} = ${topics.id}
			and ${subscriptions.isActive}
			and ${subscriptions.subscriberUserId} is not null`

// everyone who follows it by belonging to an audience that does. a union folds a person on both paths into one
const audienceSubscribers = sql`
	select ${audienceMembers.userId} as subscriber_id
		from ${subscriptions}
		join ${audienceMembers} on ${audienceMembers.audienceId} = ${subscriptions.subscriberAudienceId}
		where ${subscriptions.topicId} = ${topics.id}
			and ${subscriptions.isActive}`

/**
 * Recount a Topic's effective subscribers and store it. A recount instead of an increment, because a
 * missed increment drifts silently while a recount corrects itself.
 */
export async function recountTopicSubscribers(topicId: string, handle: DbHandle = db): Promise<void> {
	// the owner subscribes to their own Topic for delivery, and has never counted as one of its subscribers
	const subscriberCount = sql<number>`(
		select count(*) from (${directSubscribers} union ${audienceSubscribers}) as effective_subscribers
		where subscriber_id is distinct from ${topics.ownerId}
	)`
	await handle.update(topics).set({ subscriberCount }).where(eq(topics.id, topicId))
}
