// a podcast episode's position among the home's featured episodes: the admin's write, the list, and its route

import type { FeaturedPodcastEpisode } from "@carlnotes/contracts/podcast"
import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import { toPodcastEpisodePath } from "@carlnotes/contracts/seo"
import { topicFeatureOrderPayload } from "@carlnotes/contracts/topicPayloads"
import { db, isPublicAndShown } from "@carlnotes/db"
import { setFeatureOrder } from "@carlnotes/db/featureOrder"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { zValidator } from "@hono/zod-validator"
import { and, asc, eq, isNotNull } from "drizzle-orm"
import { Hono } from "hono"
import { isAllowed } from "../authorization"
import { type AppEnv, currentUser } from "../currentUser"
import { clearFeaturedCaches, type FeatureOrderResult } from "../topic/featuring"

/**
 * Sets a published podcast episode's position among the featured episodes, with the topic rules: position 0 clears it,
 * another position inserts it there and pushes the rest down, and a position past the end appends. Only a published
 * episode of a public shown topic can be featured.
 */
async function setPodcastEpisodeFeatureOrder(podcastEpisodeId: string, position: number): Promise<FeatureOrderResult> {
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
		await setFeatureOrder({ table: podcastEpisodes, id: podcastEpisodeId, position, transaction })
	})
	await clearFeaturedCaches()
	return "ranked"
}

/**
 * Returns the featured podcast episodes in their order, each with its topic's name and its page.
 */
export async function loadFeaturedPodcastEpisodes(): Promise<FeaturedPodcastEpisode[]> {
	// the pinned rows with their topics, in their order
	const featuredRows = await db
		.select({
			id: podcastEpisodes.id,
			title: podcastEpisodes.title,
			season: podcastEpisodes.season,
			episodeNumber: podcastEpisodes.episodeNumber,
			// the topic, which names the episode's page
			topicId: topics.id,
			topicName: topics.name,
			featureOrder: podcastEpisodes.featureOrder,
		})
		.from(podcastEpisodes)
		.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.where(isNotNull(podcastEpisodes.featureOrder))
		.orderBy(asc(podcastEpisodes.featureOrder))

	// the columns are nullable, and a published episode, the only kind featured, has them all
	return featuredRows.map((featuredRow) => ({
		id: featuredRow.id,
		title: featuredRow.title ?? featuredRow.topicName,
		topicName: featuredRow.topicName,
		pagePath: toPodcastEpisodePath(
			{ id: featuredRow.topicId, name: featuredRow.topicName },
			{ season: featuredRow.season ?? 0, episodeNumber: featuredRow.episodeNumber ?? 0 },
		),
		featureOrder: featuredRow.featureOrder ?? 0,
	}))
}

/**
 * Where this podcast episode sits among the featured episodes, and the list itself. Only an admin
 * sees either.
 */
export async function toFeaturedPodcastEpisodes(
	featureOrder: number | null,
	isAdmin: boolean,
): Promise<Pick<PodcastEpisodePageResponse, "featureOrder" | "featuredPodcastEpisodes">> {
	// anyone else sees neither
	if (!isAdmin) {
		return { featureOrder: null, featuredPodcastEpisodes: null }
	}
	return { featureOrder, featuredPodcastEpisodes: await loadFeaturedPodcastEpisodes() }
}

// the featured podcast episodes' order route, admin only
export const podcastEpisodeFeaturingRoute = new Hono<AppEnv>().patch(
	"/podcast-episodes/:id/feature-order",
	zValidator("json", topicFeatureOrderPayload),
	async (context) => {
		// reject a signed-out visitor, and anyone but an admin
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		if (!(await isAllowed(userId, "admin:setFeatureOrder"))) {
			return context.json({ error: "forbidden" }, 403)
		}

		// position zero clears the episode's order, and the rejection names the rule
		const featureOrderResult = await setPodcastEpisodeFeatureOrder(
			context.req.param("id"),
			context.req.valid("json").position,
		)
		if (featureOrderResult === "missing") {
			return context.json({ error: "not found" }, 404)
		}
		return featureOrderResult === "ranked"
			? context.json({ ok: true })
			: context.json({ error: "only a published episode of a public topic can be featured" }, 409)
	},
)
