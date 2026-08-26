import { zValidator } from "@hono/zod-validator"
import { topicFeatureOrderPayload } from "@shared/contracts"
// the Featured section's ordering is whole numbers from 1 to the number of featured topics
import { and, asc, count, eq, gt, gte, isNotNull, sql } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../../db"
import { topics } from "../../db/schema"
import { isAllowed } from "../authorization"
import { type AppEnv, currentUser } from "../currentUser"

// the database, or a transaction on it
type DbHandle = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

// whether the feature order was applied, and if not, which rule rejected it
export type FeatureOrderResult = "ranked" | "missing" | "notPublic"

/**
 * Set a public topic's position in the Featured section. Position 0 clears it. Any other position inserts the topic
 * there and pushes whatever held it, and everything below, down one. A position past the end appends.
 * A topic that is already featured moves: it leaves its old position, and the gap closes before it is inserted into its new position.
 */
export async function setTopicFeatureOrder(topicId: string, position: number): Promise<FeatureOrderResult> {
	// only a public topic can be featured. the Featured section is visible to a signed-out visitor
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
 * Clear a topic's feature order and close the gap it leaves by moving everything below it up one.
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
	return featuredRows.map((featuredRow) => ({
		id: featuredRow.id,
		name: featuredRow.name,
		featureOrder: featuredRow.featureOrder ?? 0,
	}))
}

// the Featured section's order route, admin only
export const featuringRoute = new Hono<AppEnv>().patch(
	"/topics/:id/feature-order",
	zValidator("json", topicFeatureOrderPayload),
	async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}

		// updating the Featured section is admin only
		if (!(await isAllowed(userId, "admin:setFeatureOrder"))) {
			return context.json({ error: "forbidden" }, 403)
		}

		// position zero clears the topic's order
		const featureOrderResult = await setTopicFeatureOrder(context.req.param("id"), context.req.valid("json").position)
		if (featureOrderResult === "missing") {
			return context.json({ error: "not found" }, 404)
		}

		// the rejection names the rule, so the page shows why
		return featureOrderResult === "ranked"
			? context.json({ ok: true })
			: context.json({ error: "only a public topic can be featured" }, 409)
	},
)
