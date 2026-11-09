// a topic's position in the Home topics: the admin's write, the release a delete and a visibility change share,
// the list, and its route

import { topicHomeOrderPayload } from "@carlnotes/contracts/topicPayloads"
import { type DbHandle, db } from "@carlnotes/db"
import { releaseHomeOrder as releaseRowHomeOrder, setHomeOrder } from "@carlnotes/db/homeOrder"
import { releaseTopicPodcastEpisodeHomeOrders } from "@carlnotes/db/podcastEpisodeHomeOrder"
import { topics } from "@carlnotes/db/schema/topics"
import { zValidator } from "@hono/zod-validator"
import { asc, eq, isNotNull } from "drizzle-orm"
import { Hono } from "hono"
import { isAllowed } from "../authorization"
import { type AppEnv, currentUser } from "../currentUser"
import { purgeHomeAtEdge } from "../edgeCache"
import { clearSharedTopicFeedCaches } from "./feedCaches"

// whether the home order was applied, and if not, which rule rejected it
export type HomeOrderResult = "ranked" | "missing" | "notPublic"

/**
 * Set a public topic's position in the Home topics. Position 0 clears it. Any other position inserts the topic
 * there and pushes whatever held it, and everything below, down one. A position past the end appends.
 * A topic that is already pinned moves: it leaves its old position, and the gap closes before it is inserted into its new position.
 */
async function setTopicHomeOrder(topicId: string, position: number): Promise<HomeOrderResult> {
	// only a public topic can be pinned to the home page. the Home topics is visible to a signed-out visitor
	const [topic] = await db.select({ visibility: topics.visibility }).from(topics).where(eq(topics.id, topicId))
	if (!topic) {
		return "missing"
	}
	if (topic.visibility !== "public") {
		return "notPublic"
	}

	// the topic's home podcasts leave the home, then the topic moves to its new position
	await db.transaction(async (transaction) => {
		await releaseTopicPodcastEpisodeHomeOrders(topicId, transaction)
		await setHomeOrder({ table: topics, id: topicId, position, transaction })
	})
	await clearHomeCaches()
	return "ranked"
}

/**
 * Deletes the shared topic section ids, the home's card ids, and the visitors' feeds, and purges the home at the edge.
 */
export async function clearHomeCaches(): Promise<void> {
	await clearSharedTopicFeedCaches()
	await purgeHomeAtEdge()
}

/**
 * Clears a topic's home order and closes the gap it leaves by moving everything below it up one, with the feature
 * orders of its podcast episodes. Returns whether the topic or any of its podcast episodes had one.
 */
export async function releaseHomeOrder(topicId: string, handle: DbHandle = db): Promise<boolean> {
	// the topic's home podcasts leave the home with it
	const isPodcastEpisodeOrderReleased = await releaseTopicPodcastEpisodeHomeOrders(topicId, handle)
	const isTopicOrderReleased = await releaseRowHomeOrder({ table: topics, id: topicId, handle })
	return isPodcastEpisodeOrderReleased || isTopicOrderReleased
}

/**
 * The home topics in their home order
 */
export async function loadHomeTopics(): Promise<{ id: string; name: string; homeOrder: number }[]> {
	const homeOrderRows = await db
		.select({ id: topics.id, name: topics.name, homeOrder: topics.homeOrder })
		.from(topics)
		.where(isNotNull(topics.homeOrder))
		.orderBy(asc(topics.homeOrder))

	// the column is nullable, and the filter above is what rules the nulls out
	return homeOrderRows.map((homeOrderRow) => ({
		id: homeOrderRow.id,
		name: homeOrderRow.name,
		homeOrder: homeOrderRow.homeOrder ?? 0,
	}))
}

// the Home topics order route, admin only
export const homeOrderRoute = new Hono<AppEnv>().patch(
	"/topics/:id/home-order",
	zValidator("json", topicHomeOrderPayload),
	async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}

		// updating the Home topics order is admin only
		if (!(await isAllowed(userId, "admin:setHomeOrder"))) {
			return context.json({ error: "forbidden" }, 403)
		}

		// position zero clears the topic's order
		const homeOrderResult = await setTopicHomeOrder(context.req.param("id"), context.req.valid("json").position)
		if (homeOrderResult === "missing") {
			return context.json({ error: "not found" }, 404)
		}

		// the rejection names the rule, so the page shows why
		return homeOrderResult === "ranked"
			? context.json({ ok: true })
			: context.json({ error: "only a public topic can be pinned to the home page" }, 409)
	},
)
