// a podcast episode's position among the home podcast episodes: the admin's write, the list, and its route

import type { HomePodcastEpisode } from "@carlnotes/contracts/podcast"
import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import { toPodcastEpisodePath } from "@carlnotes/contracts/seo"
import { pinnedOrderPayload } from "@carlnotes/contracts/topicPayloads"
import { db, isPublicAndShown } from "@carlnotes/db"
import { setHomeOrder } from "@carlnotes/db/homeOrder"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { zValidator } from "@hono/zod-validator"
import { and, asc, eq, isNotNull } from "drizzle-orm"
import type { AnyPgColumn } from "drizzle-orm/pg-core"
import { Hono } from "hono"
import type { AppEnv } from "../currentUser"
import { clearHomeCaches, type HomeOrderResult, toHomeOrderAdmin } from "../topic/homeOrder"

/**
 * Sets a published podcast episode's position among the home podcast episodes, with the topic rules: position 0 clears it,
 * another position inserts it there and pushes the rest down, and a position past the end appends. Only a published
 * episode of a public shown topic can be pinned to the home page.
 */
async function setPodcastEpisodeHomeOrder(podcastEpisodeId: string, position: number): Promise<HomeOrderResult> {
	// the podcast episode must be published, on a public shown topic
	const [podcastEpisode] = await db
		.select({ status: podcastEpisodes.status, topicId: podcastEpisodes.topicId })
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.id, podcastEpisodeId))
	if (!podcastEpisode) {
		return "missing"
	}
	// the topic, if it is public and shown
	const [publicTopic] = podcastEpisode.topicId
		? await db
				.select({ id: topics.id })
				.from(topics)
				.where(and(eq(topics.id, podcastEpisode.topicId), isPublicAndShown))
		: []
	// a draft, a removed episode, and a hidden topic's episode stay off the home
	if (podcastEpisode.status !== "published" || !publicTopic) {
		return "notPublic"
	}

	// the episode leaves its old position and takes the new one, then the home reads its cards again
	await db.transaction(async (transaction) => {
		await setHomeOrder({ table: podcastEpisodes, id: podcastEpisodeId, position, transaction })
	})
	await clearHomeCaches()
	return "ranked"
}

// load the home podcast episodes in their order, each with its topic's name and its page
async function loadHomePodcastEpisodes(): Promise<HomePodcastEpisode[]> {
	// the pinned rows with their topics, in their order
	const homeOrderRows = await db
		.select(toHomePodcastEpisodeColumns(podcastEpisodes.homeOrder))
		.from(podcastEpisodes)
		.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.where(isNotNull(podcastEpisodes.homeOrder))
		.orderBy(asc(podcastEpisodes.homeOrder))
	return homeOrderRows.map(toHomePodcastEpisode)
}

/**
 * Returns the columns a home podcast episode or a home film reads, ordered by the column that holds its pin.
 */
// biome-ignore lint/nursery/useExplicitReturnType: drizzle's column types are generated, and naming them here would break on an upgrade
export function toHomePodcastEpisodeColumns(homeOrderColumn: AnyPgColumn) {
	return {
		id: podcastEpisodes.id,
		title: podcastEpisodes.title,
		season: podcastEpisodes.season,
		episodeNumber: podcastEpisodes.episodeNumber,
		// the topic, which names the episode's page
		topicId: topics.id,
		topicName: topics.name,
		homeOrder: homeOrderColumn,
	}
}

// a pinned row as the home shows it. the columns are nullable, and a published episode, the only kind pinned, has them
// all
export type HomePodcastEpisodeRow = {
	id: string
	title: string | null
	season: number | null
	episodeNumber: number | null
	// the topic, which names the episode's page, and the position the pin holds
	topicId: string
	topicName: string
	homeOrder: number | null
}

/**
 * Returns a pinned row as the home shows it, with the path that opens its podcast episode's page.
 */
export function toHomePodcastEpisode(homeOrderRow: HomePodcastEpisodeRow): HomePodcastEpisode {
	return {
		id: homeOrderRow.id,
		title: homeOrderRow.title ?? homeOrderRow.topicName,
		topicName: homeOrderRow.topicName,
		pagePath: toPodcastEpisodePath(
			{ id: homeOrderRow.topicId, name: homeOrderRow.topicName },
			{ season: homeOrderRow.season ?? 0, episodeNumber: homeOrderRow.episodeNumber ?? 0 },
		),
		homeOrder: homeOrderRow.homeOrder ?? 0,
	}
}

/**
 * Where this podcast episode sits among the home podcast episodes, and the list itself. Only an admin
 * sees either.
 */
export async function toHomePodcastEpisodes(
	homeOrder: number | null,
	isAdmin: boolean,
): Promise<Pick<PodcastEpisodePageResponse, "homeOrder" | "homePodcastEpisodes">> {
	// anyone else sees neither
	if (!isAdmin) {
		return { homeOrder: null, homePodcastEpisodes: null }
	}
	return { homeOrder, homePodcastEpisodes: await loadHomePodcastEpisodes() }
}

// the home podcasts' order route, admin only
export const podcastEpisodeHomeOrderRoute = new Hono<AppEnv>().patch(
	"/podcast-episodes/:id/home-order",
	zValidator("json", pinnedOrderPayload),
	async (context) => {
		// reject a signed-out visitor, and anyone but an admin
		const admin = await toHomeOrderAdmin(context)
		if ("response" in admin) {
			return admin.response
		}

		// position zero clears the episode's order, and the rejection names the rule
		const homeOrderResult = await setPodcastEpisodeHomeOrder(
			context.req.param("id"),
			context.req.valid("json").position,
		)
		if (homeOrderResult === "missing") {
			return context.json({ error: "not found" }, 404)
		}
		return homeOrderResult === "ranked"
			? context.json({ ok: true })
			: context.json({ error: "only a published episode of a public topic can be pinned to the home page" }, 409)
	},
)
