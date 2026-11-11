// a Topic Post's position among the home Topic Posts: the admin's write, the lists the admin's rank dialog shows, and
// their routes

import { pinnedOrderPayload } from "@carlnotes/contracts/topicPayloads"
import type { HomeTopicPostsResponse } from "@carlnotes/contracts/topicPosts"
import { db, isPublicAndShown } from "@carlnotes/db"
import { setHomeOrder } from "@carlnotes/db/homeOrder"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import { zValidator } from "@hono/zod-validator"
import { and, asc, desc, eq, isNotNull } from "drizzle-orm"
import { Hono } from "hono"
import type { AppEnv } from "../currentUser"
import { clearHomeCaches, type HomeOrderResult, toHomeOrderAdmin } from "../topic/homeOrder"

// how many of the newest published Topic Posts the admin's rank dialog offers to pin
// ponytail: limits the picker to the newest posts. search the posts on the server past it
const CANDIDATE_TOPIC_POST_LIMIT = 100

/**
 * Sets a published Topic Post's position among the home Topic Posts, with the topic rules: position 0 clears it,
 * another position inserts it there and pushes the rest down, and a position past the end appends. Only a published
 * post of a public shown topic can be pinned to the home page.
 */
async function setTopicPostHomeOrder(topicPostId: string, position: number): Promise<HomeOrderResult> {
	// the Topic Post, with whether it is published
	const [topicPost] = await db
		.select({ publishedAt: topicPosts.publishedAt, topicId: topicPosts.topicId })
		.from(topicPosts)
		.where(eq(topicPosts.id, topicPostId))
	if (!topicPost) {
		return "missing"
	}

	// the topic, if it is public and shown. a draft and a hidden topic's post stay off the home, while position zero
	// clears the order of any post, so a post whose topic stopped being shown can still be unpinned
	const [publicTopic] = await db
		.select({ id: topics.id })
		.from(topics)
		.where(and(eq(topics.id, topicPost.topicId), isPublicAndShown))
	if (position !== 0 && (!topicPost.publishedAt || !publicTopic)) {
		return "notPublic"
	}

	// the post leaves its old position and takes the new one, then the home reads its cards again
	await db.transaction(async (transaction) => {
		await setHomeOrder({ table: topicPosts, id: topicPostId, position, transaction })
	})
	await clearHomeCaches()
	return "ranked"
}

// the columns of a Topic Post as a row of the admin's rank dialog
const homeTopicPostColumns = { id: topicPosts.id, title: topicPosts.title, topicName: topics.name }

// load the Topic Posts the admin's rank dialog shows: the pinned ones in their order, and the newest published ones
// of public shown topics, which a pin may name
async function loadHomeTopicPosts(): Promise<HomeTopicPostsResponse> {
	const [pinnedTopicPosts, candidateTopicPosts] = await Promise.all([
		db
			.select(homeTopicPostColumns)
			.from(topicPosts)
			.innerJoin(topics, eq(topics.id, topicPosts.topicId))
			.where(isNotNull(topicPosts.homeOrder))
			.orderBy(asc(topicPosts.homeOrder)),
		db
			.select(homeTopicPostColumns)
			.from(topicPosts)
			.innerJoin(topics, eq(topics.id, topicPosts.topicId))
			.where(and(isNotNull(topicPosts.publishedAt), isPublicAndShown))
			.orderBy(desc(topicPosts.publishedAt))
			.limit(CANDIDATE_TOPIC_POST_LIMIT),
	])
	return { pinnedTopicPosts, candidateTopicPosts }
}

// the home Topic Posts' routes, admin only
export const topicPostHomeOrderRoute = new Hono<AppEnv>()
	.get("/home/topic-posts", async (context) => {
		// the pinned Topic Posts and the ones a pin may name, for an admin alone
		const admin = await toHomeOrderAdmin(context)
		if ("response" in admin) {
			return admin.response
		}
		return context.json(await loadHomeTopicPosts())
	})
	.patch("/topic-posts/:id/home-order", zValidator("json", pinnedOrderPayload), async (context) => {
		// reject a signed-out visitor, and anyone but an admin
		const admin = await toHomeOrderAdmin(context)
		if ("response" in admin) {
			return admin.response
		}

		// position zero clears the post's order, and the rejection names the rule
		const homeOrderResult = await setTopicPostHomeOrder(context.req.param("id"), context.req.valid("json").position)
		if (homeOrderResult === "missing") {
			return context.json({ error: "not found" }, 404)
		}
		return homeOrderResult === "ranked"
			? context.json({ ok: true })
			: context.json({ error: "only a published post of a public topic can be pinned to the home page" }, 409)
	})
