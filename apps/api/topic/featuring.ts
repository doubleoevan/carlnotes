// a topic's position in the Featured section: the admin's write, the release a delete and a visibility change share,
// the list, and its route

import { topicFeatureOrderPayload } from "@carlnotes/contracts/topicPayloads"
import { type DbHandle, db } from "@carlnotes/db"
import { releaseFeatureOrder as releaseRowFeatureOrder, setFeatureOrder } from "@carlnotes/db/featureOrder"
import { releaseTopicPodcastEpisodeFeatureOrders } from "@carlnotes/db/podcastEpisodeFeaturing"
import { topics } from "@carlnotes/db/schema/topics"
import { zValidator } from "@hono/zod-validator"
import { asc, eq, isNotNull } from "drizzle-orm"
import { Hono } from "hono"
import { isAllowed } from "../authorization"
import { type AppEnv, currentUser } from "../currentUser"
import { purgeHomeAtEdge } from "../edgeCache"
import { clearSharedTopicFeedCaches } from "./feedCaches"

// whether the feature order was applied, and if not, which rule rejected it
export type FeatureOrderResult = "ranked" | "missing" | "notPublic"

/**
 * Set a public topic's position in the Featured section. Position 0 clears it. Any other position inserts the topic
 * there and pushes whatever held it, and everything below, down one. A position past the end appends.
 * A topic that is already featured moves: it leaves its old position, and the gap closes before it is inserted into its new position.
 */
async function setTopicFeatureOrder(topicId: string, position: number): Promise<FeatureOrderResult> {
	// only a public topic can be featured. the Featured section is visible to a signed-out visitor
	const [topic] = await db.select({ visibility: topics.visibility }).from(topics).where(eq(topics.id, topicId))
	if (!topic) {
		return "missing"
	}
	if (topic.visibility !== "public") {
		return "notPublic"
	}

	// the topic's featured podcast episodes leave the home, then the topic moves to its new position
	await db.transaction(async (transaction) => {
		await releaseTopicPodcastEpisodeFeatureOrders(topicId, transaction)
		await setFeatureOrder({ table: topics, id: topicId, position, transaction })
	})
	await clearFeaturedCaches()
	return "ranked"
}

/**
 * Deletes the shared topic section ids, the home's card ids, and the visitors' feeds, and purges the home at the edge.
 */
export async function clearFeaturedCaches(): Promise<void> {
	await clearSharedTopicFeedCaches()
	await purgeHomeAtEdge()
}

/**
 * Clears a topic's feature order and closes the gap it leaves by moving everything below it up one, with the feature
 * orders of its podcast episodes. Returns whether the topic or any of its podcast episodes had one.
 */
export async function releaseFeatureOrder(topicId: string, handle: DbHandle = db): Promise<boolean> {
	// the topic's featured podcast episodes leave the home with it
	const isPodcastEpisodeOrderReleased = await releaseTopicPodcastEpisodeFeatureOrders(topicId, handle)
	const isTopicOrderReleased = await releaseRowFeatureOrder({ table: topics, id: topicId, handle })
	return isPodcastEpisodeOrderReleased || isTopicOrderReleased
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
