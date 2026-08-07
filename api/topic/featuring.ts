// the Featured section's ordering is whole numbers from 1 to the number of featured topics.
// every change is the same two steps, take the topic out of the ordering and then put it back at a new position,
// so the numbers stay contiguous whether the caller is ranking, deleting, or making a topic private
import { and, asc, count, eq, gt, gte, isNotNull, sql } from "drizzle-orm"
import { db } from "../../db"
import { topics } from "../../db/schema"

// the database, or a transaction on it, so a caller can release a feature order inside the transaction
// that is deleting the topic or changing its visibility
type DbHandle = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

// whether the feature order was applied, and if not, which rule rejected it
export type FeatureOrderResult = "ranked" | "missing" | "notPublic"

/**
 * Set a public topic's position in the Featured section. Position 0 clears it. Any other position inserts the topic
 * there and pushes whatever held it, and everything below, down one. A position past the end appends.
 * A topic that is already featured moves: it leaves its old position, and the gap closes before it is inserted into its new position.
 */
export async function setTopicFeatureOrder(topicId: string, position: number): Promise<FeatureOrderResult> {
	// only a public topic can be featured, since the Featured section can be viewed by a signed-out visitor
	const [topic] = await db.select({ visibility: topics.visibility }).from(topics).where(eq(topics.id, topicId))
	if (!topic) {
		return "missing"
	}
	if (topic.visibility !== "public") {
		return "notPublic"
	}

	await db.transaction(async (transaction) => {
		// delete a feature by setting its order to zero
		await releaseFeatureOrder(topicId, transaction)
		if (position <= 0) {
			return
		}

		// select the feature's new target position
		const [featuredRow] = await transaction
			.select({ count: count() })
			.from(topics)
			.where(isNotNull(topics.featureOrder))
		const targetPosition = toTargetPosition(position, featuredRow?.count ?? 0)

		// push everything from the target position down and set the topic's new feature order in the same transaction
		await transaction
			.update(topics)
			.set({ featureOrder: sql`${topics.featureOrder} + 1` })
			.where(and(isNotNull(topics.featureOrder), gte(topics.featureOrder, targetPosition)))
		await transaction.update(topics).set({ featureOrder: targetPosition }).where(eq(topics.id, topicId))
	})
	return "ranked"
}

/**
 * The position a featured topic will take as an insert or an append
 */
export function toTargetPosition(position: number, featuredCount: number): number {
	return Math.min(position, featuredCount + 1)
}

/**
 * Clear a topic's feature order and close the gap it by moving everything below it up one.
 */
export async function releaseFeatureOrder(topicId: string, handle: DbHandle = db): Promise<void> {
	// a topic with no order has nothing to release and nothing below it to move
	const [topic] = await handle.select({ featureOrder: topics.featureOrder }).from(topics).where(eq(topics.id, topicId))
	if (topic?.featureOrder == null) {
		return
	}

	// clear the topic's feature order, then pull everything that was below it up one
	await handle.update(topics).set({ featureOrder: null }).where(eq(topics.id, topicId))
	await handle
		.update(topics)
		.set({ featureOrder: sql`${topics.featureOrder} - 1` })
		.where(and(isNotNull(topics.featureOrder), gt(topics.featureOrder, topic.featureOrder)))
}

/**
 * The featured topics in their feature order
 */
export async function loadFeaturedTopics(): Promise<{ id: string; name: string; featureOrder: number }[]> {
	const featuredRows = await db
		.select({ id: topics.id, name: topics.name, featureOrder: topics.featureOrder })
		.from(topics)
		.where(isNotNull(topics.featureOrder))
		.orderBy(asc(topics.featureOrder))

	// the column is nullable, and the filter above is what rules the nulls out
	return featuredRows.map((row) => ({ id: row.id, name: row.name, featureOrder: row.featureOrder ?? 0 }))
}
