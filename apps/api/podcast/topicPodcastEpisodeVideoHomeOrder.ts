// a film's position among the home films: the admin's write, the list, and its route

import type { HomePodcastEpisode } from "@carlnotes/contracts/podcast"
import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import { pinnedOrderPayload } from "@carlnotes/contracts/topicPayloads"
import { db, isPublicAndShown } from "@carlnotes/db"
import { setHomeOrder } from "@carlnotes/db/homeOrder"
import { podcastEpisodes, topicPodcastEpisodeVideos } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { trackEvent } from "@carlnotes/server/analytics"
import { zValidator } from "@hono/zod-validator"
import { and, asc, eq, isNotNull } from "drizzle-orm"
import { Hono } from "hono"
import type { AppEnv } from "../currentUser"
import { clearHomeCaches, type HomeOrderResult, toHomeOrderAdmin } from "../topic/homeOrder"
import { toHomePodcastEpisode, toHomePodcastEpisodeColumns } from "./podcastEpisodeHomeOrder"

// the film's podcast episode and the position an admin chose
type SetTopicPodcastEpisodeVideoHomeOrderOptions = { podcastEpisodeId: string; position: number }

// set a ready film's position among the home films, with the home podcasts' rules: position 0 clears it, another
// position inserts it there and pushes the rest down, and a position past the end appends. only the ready film of a
// published podcast episode of a public shown topic can be pinned to the home page
async function setTopicPodcastEpisodeVideoHomeOrder({
	podcastEpisodeId,
	position,
}: SetTopicPodcastEpisodeVideoHomeOrderOptions): Promise<HomeOrderResult> {
	// the film with its podcast episode's status and its topic, if the topic is public and shown
	const [filmRow] = await db
		.select({
			id: topicPodcastEpisodeVideos.id,
			status: topicPodcastEpisodeVideos.status,
			podcastEpisodeStatus: podcastEpisodes.status,
			publicTopicId: topics.id,
		})
		.from(topicPodcastEpisodeVideos)
		.innerJoin(podcastEpisodes, eq(podcastEpisodes.id, topicPodcastEpisodeVideos.podcastEpisodeId))
		.leftJoin(topics, and(eq(topics.id, podcastEpisodes.topicId), isPublicAndShown))
		.where(eq(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodeId))
	if (!filmRow) {
		return "missing"
	}

	// a film still rendering, a failed one, and a hidden topic's film stay off the home
	if (filmRow.status !== "ready" || filmRow.podcastEpisodeStatus !== "published" || !filmRow.publicTopicId) {
		return "notPublic"
	}

	// the film leaves its old position and takes the new one, then the home reads its cards again
	await db.transaction(async (transaction) => {
		await setHomeOrder({ table: topicPodcastEpisodeVideos, id: filmRow.id, position, transaction })
	})
	await clearHomeCaches()
	return "ranked"
}

// load the home films in their order, each named by its podcast episode, with its topic's name and its page
async function loadHomeTopicPodcastEpisodeVideos(): Promise<HomePodcastEpisode[]> {
	// the pinned films with their podcast episodes and topics, in their order
	const homeOrderRows = await db
		.select(toHomePodcastEpisodeColumns(topicPodcastEpisodeVideos.homeOrder))
		.from(topicPodcastEpisodeVideos)
		.innerJoin(podcastEpisodes, eq(podcastEpisodes.id, topicPodcastEpisodeVideos.podcastEpisodeId))
		.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.where(isNotNull(topicPodcastEpisodeVideos.homeOrder))
		.orderBy(asc(topicPodcastEpisodeVideos.homeOrder))

	// each pinned film as the home shows its podcast episode
	return homeOrderRows.map(toHomePodcastEpisode)
}

/**
 * Returns where this podcast episode's film sits among the home films, and the list itself. Only an admin sees
 * either.
 */
export async function toHomeTopicPodcastEpisodeVideos(
	podcastEpisodeId: string,
	isAdmin: boolean,
): Promise<Pick<PodcastEpisodePageResponse, "topicPodcastEpisodeVideoHomeOrder" | "homeTopicPodcastEpisodeVideos">> {
	// anyone else sees neither
	if (!isAdmin) {
		return { topicPodcastEpisodeVideoHomeOrder: null, homeTopicPodcastEpisodeVideos: null }
	}

	// the list, and this podcast episode's place in it
	const homeTopicPodcastEpisodeVideos = await loadHomeTopicPodcastEpisodeVideos()
	const homeTopicPodcastEpisodeVideo = homeTopicPodcastEpisodeVideos.find(
		(homeItem) => homeItem.id === podcastEpisodeId,
	)
	return {
		topicPodcastEpisodeVideoHomeOrder: homeTopicPodcastEpisodeVideo?.homeOrder ?? null,
		homeTopicPodcastEpisodeVideos,
	}
}

// the home films' order route, admin only. the id is the film's podcast episode
export const topicPodcastEpisodeVideoHomeOrderRoute = new Hono<AppEnv>().patch(
	"/podcast-episodes/:id/video/home-order",
	zValidator("json", pinnedOrderPayload),
	async (context) => {
		// reject a signed-out visitor, and anyone but an admin
		const admin = await toHomeOrderAdmin(context)
		if ("response" in admin) {
			return admin.response
		}

		// position zero clears the film's order, and the rejection names the rule
		const podcastEpisodeId = context.req.param("id")
		const { position } = context.req.valid("json")
		const homeOrderResult = await setTopicPodcastEpisodeVideoHomeOrder({ podcastEpisodeId, position })

		// a missing film and a film that may not be pinned are rejected
		if (homeOrderResult === "missing") {
			return context.json({ error: "not found" }, 404)
		}
		if (homeOrderResult === "notPublic") {
			return context.json({ error: "only a ready film of a public topic can be pinned to the home page" }, 409)
		}

		// report the pin change by ids only
		trackEvent("episode_video_home_order_change", admin.userId, { podcastEpisodeId, position })
		return context.json({ ok: true })
	},
)
