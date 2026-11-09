// the home route: the home topics and podcast episodes as cards for everyone, and a user's own and followed
// topics as cards

import {
	HOME_CARDS_PAGE_SIZE,
	type HomeResponse,
	type YourTopicsPage,
	yourTopicsQuery,
} from "@carlnotes/contracts/home"
import { db } from "@carlnotes/db"
import { loadUserAccess } from "@carlnotes/db/quotas"
import { topics } from "@carlnotes/db/schema/topics"
import { traceRequestStage } from "@carlnotes/server/monitoring"
import { zValidator } from "@hono/zod-validator"
import { and, count, desc, eq, inArray, ne, or, sql } from "drizzle-orm"
import { Hono } from "hono"
import { type AppEnv, currentUser } from "../currentUser"
import { renderedCacheHeaders } from "../edgeCache"
import { activeSubscriptionTopicIdQuery } from "../topic/feeds"
import { loadHomeCardIds } from "./homeCardIds"
import { loadPodcastEpisodeCards, loadTopicCards, toTopicCards } from "./topicCards"

// the home route
export const homeRoute = new Hono<AppEnv>()
	// public: a visitor's payload is one shared read the edge caches, and a user's adds their topics
	.get("/home", renderedCacheHeaders, async (context) => {
		const userId = currentUser(context)
		const homeResponse = await traceRequestStage("home.build", () => loadHome(userId))
		return context.json(homeResponse)
	})
	// signed-in: one page of the user's own and followed topics, after the first page the home payload holds
	.get("/home/your-topics", zValidator("query", yourTopicsQuery), async (context) => {
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		return context.json(await loadYourTopicsPage(userId, context.req.valid("query").page))
	})

/**
 * Builds the home payload: the home topics and podcast episodes and the newest podcast episodes as cards, and the
 * first page of the user's own and followed topics as cards.
 */
async function loadHome(userId: string | null): Promise<HomeResponse> {
	// the ids from the shared cache, then their cards and the user's topics together
	const homeCardIds = await loadHomeCardIds()
	const [homeTopics, homePodcastEpisodes, newestPodcastEpisodes, yourTopics] = await Promise.all([
		loadTopicCards(homeCardIds.homeTopicIds, userId),
		loadPodcastEpisodeCards(homeCardIds.homePodcastEpisodeIds),
		loadPodcastEpisodeCards(homeCardIds.newestPodcastEpisodeIds),
		userId ? loadYourTopicsPage(userId, 0) : null,
	])
	return { homeTopics, homePodcastEpisodes, newestPodcastEpisodes, yourTopics }
}

// one page of the user's own topics newest first, then the ones they follow newest first, as cards, with how many
// there are in all. a followed topic that went private is one the user may not open, so it leaves their cards,
// unless an admin reads
async function loadYourTopicsPage(userId: string, page: number): Promise<YourTopicsPage> {
	const { isAdmin } = await loadUserAccess(userId)
	const isOwned = eq(topics.ownerId, userId)
	const yourTopicsFilter = or(
		isOwned,
		and(
			inArray(topics.id, activeSubscriptionTopicIdQuery(userId)),
			isAdmin ? undefined : ne(topics.visibility, "private"),
		),
	)

	// the page's rows, owned first and then newest first with the id breaking ties, beside the count of every row
	const [topicRows, [countRow]] = await Promise.all([
		db
			.select()
			.from(topics)
			.where(yourTopicsFilter)
			.orderBy(desc(sql`${isOwned}`), desc(topics.createdAt), desc(topics.id))
			.limit(HOME_CARDS_PAGE_SIZE)
			.offset(page * HOME_CARDS_PAGE_SIZE),
		db.select({ totalCount: count() }).from(topics).where(yourTopicsFilter),
	])
	return { topics: await toTopicCards(topicRows, userId), totalCount: countRow?.totalCount ?? 0 }
}
