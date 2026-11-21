// the home route: the home topics, films, podcast episodes, and Topic Posts as cards for everyone, and a user's own
// and followed topics as cards

import { CARDS_PAGE_SIZE, cardsPageQuery } from "@carlnotes/contracts/cardPages"
import { type HomeResponse, homeQuery, type YourTopicsPage } from "@carlnotes/contracts/home"
import type { TopicPostCard } from "@carlnotes/contracts/topicPosts"
import { db } from "@carlnotes/db"
import { loadUserAccess } from "@carlnotes/db/quotas"
import { topics } from "@carlnotes/db/schema/topics"
import { readVisitorPage, toVisitorHomePageKey } from "@carlnotes/db/visitorPageCaches"
import { traceRequestStage } from "@carlnotes/server/monitoringTracing"
import { zValidator } from "@hono/zod-validator"
import { and, count, desc, eq, inArray, ne, or, sql } from "drizzle-orm"
import { Hono } from "hono"
import { toPodcastEpisodeCardsPage, toTopicPostCardsPage } from "../cardPages"
import { type AppEnv, currentUser } from "../currentUser"
import { renderedCacheHeaders } from "../edgeCache"
import { readPageReadNews } from "../pageReadNews"
import { activeSubscriptionTopicIdQuery } from "../topic/feeds"
import { loadHomeCardIds } from "./homeCardIds"
import { toPagedHome } from "./homeNewestPages"
import { loadHomeCards, toPodcastEpisodeCardList, toTopicCards } from "./topicCards"

// the home route
export const homeRoute = new Hono<AppEnv>()
	// public: a visitor's payload is one shared read from the home's copy that the edge caches too, and a user's adds
	// their topics and, if the query names a window, the first page of their news in it. a query that asks for pages
	// takes one page of each of the week's new sections
	.get("/home", renderedCacheHeaders, zValidator("query", homeQuery), async (context) => {
		const userId = currentUser(context)
		const { newsWindow, ...pageQuery } = context.req.valid("query")
		if (!userId) {
			return context.json(toPagedHome(await readVisitorHome(), pageQuery))
		}

		// a user's home built for them, with their news beside it if the query names a window
		const [homeResponse, news] = await Promise.all([
			traceRequestStage("home.build", () => loadHome(userId)),
			newsWindow ? readPageReadNews({ profileUserId: userId, userId, window: newsWindow }) : undefined,
		])
		const pagedHomeResponse = toPagedHome(homeResponse, pageQuery)
		return context.json(news === undefined ? pagedHomeResponse : { ...pagedHomeResponse, news })
	})
	// public: one later page of each of the week's new sections, from the home's copy, because those lists are the same
	// for every reader. first the week's new films
	.get("/home/newest-films", zValidator("query", cardsPageQuery), async (context) => {
		const { newestTopicPodcastEpisodeVideos = [] } = await readVisitorHome()
		return context.json(toPodcastEpisodeCardsPage(newestTopicPodcastEpisodeVideos, context.req.valid("query").page))
	})
	// the week's new podcast episodes
	.get("/home/newest-podcast-episodes", zValidator("query", cardsPageQuery), async (context) => {
		const { newestPodcastEpisodes } = await readVisitorHome()
		return context.json(toPodcastEpisodeCardsPage(newestPodcastEpisodes, context.req.valid("query").page))
	})
	// the week's new Topic Posts
	.get("/home/newest-topic-posts", zValidator("query", cardsPageQuery), async (context) => {
		const { newestTopicPosts = [] } = await readVisitorHome()
		return context.json(toTopicPostCardsPage(newestTopicPosts, context.req.valid("query").page))
	})
	// signed-in: one page of the user's own and followed topics, after the first page the home payload holds
	.get("/home/your-topics", zValidator("query", cardsPageQuery), async (context) => {
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		return context.json(await loadYourTopicsPage(userId, context.req.valid("query").page))
	})

// the home every visitor shares, from the home's copy, built once a minute across every replica
function readVisitorHome(): Promise<HomeResponse> {
	return readVisitorPage({
		key: toVisitorHomePageKey(),
		pageKind: "home",
		load: () => traceRequestStage("home.build", () => loadHome(null)),
		isShared: () => true,
	})
}

/**
 * Builds the home payload: the home topics, the home and newest films, the home and newest podcast episodes, and the
 * home and newest Topic Posts as cards, and the first page of the user's own and followed topics as cards.
 */
async function loadHome(userId: string | null): Promise<HomeResponse> {
	// the ids from the shared cache, and the first page of the user's topics. ids cached before the films or the newest
	// Topic Posts were read have none
	const [homeCardIds, yourTopicRowsPage] = await Promise.all([
		loadHomeCardIds(),
		userId ? loadYourTopicRowsPage(userId, 0) : null,
	])
	const { homeTopicPostIds = [], newestTopicPostIds = [] } = homeCardIds
	const { homePodcastEpisodeIds, newestPodcastEpisodeIds } = homeCardIds
	const { homeFilmPodcastEpisodeIds = [], newestFilmPodcastEpisodeIds = [] } = homeCardIds

	// every card together. the four film and podcast episode lists name each podcast episode once, and both Topic Post
	// lists each post once
	const podcastEpisodeIdLists = [
		homeFilmPodcastEpisodeIds,
		newestFilmPodcastEpisodeIds,
		homePodcastEpisodeIds,
		newestPodcastEpisodeIds,
	]
	const { homeTopics, yourTopicCards, podcastEpisodeCards, topicPostCards } = await loadHomeCards({
		homeTopicIds: homeCardIds.homeTopicIds,
		yourTopicRows: yourTopicRowsPage?.topicRows ?? [],
		podcastEpisodeIds: [...new Set(podcastEpisodeIdLists.flat())],
		topicPostIds: [...new Set([...homeTopicPostIds, ...newestTopicPostIds])],
		userId,
	})
	const yourTopics = yourTopicRowsPage && { topics: yourTopicCards, totalCount: yourTopicRowsPage.totalCount }

	// each Topic Post list's cards in its ids' order. a post deleted since the ids were cached has no card
	const topicPostCardById = new Map(topicPostCards.map((topicPostCard) => [topicPostCard.id, topicPostCard]))
	const toTopicPostCardList = (topicPostIds: string[]): TopicPostCard[] =>
		topicPostIds.flatMap((topicPostId) => topicPostCardById.get(topicPostId) ?? [])
	return {
		homeTopics,
		// each film and podcast episode list's cards in its ids' order. a podcast episode gone since the ids were cached
		// has no card
		homeTopicPodcastEpisodeVideos: toPodcastEpisodeCardList(podcastEpisodeCards, homeFilmPodcastEpisodeIds),
		newestTopicPodcastEpisodeVideos: toPodcastEpisodeCardList(podcastEpisodeCards, newestFilmPodcastEpisodeIds),
		homePodcastEpisodes: toPodcastEpisodeCardList(podcastEpisodeCards, homePodcastEpisodeIds),
		newestPodcastEpisodes: toPodcastEpisodeCardList(podcastEpisodeCards, newestPodcastEpisodeIds),
		homeTopicPosts: toTopicPostCardList(homeTopicPostIds),
		newestTopicPosts: toTopicPostCardList(newestTopicPostIds),
		yourTopics,
	}
}

// one page of the user's own topics newest first, then the ones they follow newest first, as cards, with how many
// there are in all
async function loadYourTopicsPage(userId: string, page: number): Promise<YourTopicsPage> {
	const { topicRows, totalCount } = await loadYourTopicRowsPage(userId, page)
	return { topics: await toTopicCards(topicRows, userId), totalCount }
}

// one page of the user's own topic rows newest first, then the ones they follow newest first, with how many there are
// in all. a followed topic that went private is one the user may not open, so it leaves their cards, unless an admin
// reads
async function loadYourTopicRowsPage(
	userId: string,
	page: number,
): Promise<{ topicRows: (typeof topics.$inferSelect)[]; totalCount: number }> {
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
			.limit(CARDS_PAGE_SIZE)
			.offset(page * CARDS_PAGE_SIZE),
		db.select({ totalCount: count() }).from(topics).where(yourTopicsFilter),
	])
	return { topicRows, totalCount: countRow?.totalCount ?? 0 }
}
