// the podcast episode routes for a season's episodes, an episode page, the next unplayed episode, one episode,
// its files and preview card, a listener's progress, a chapter's rating, the owner's podcast switch,
// and removing an episode
import { zValidator } from "@hono/zod-validator"
import {
	type PodcastEpisodeListenPayload,
	podcastEpisodeListenPayload,
	ratingPayload,
	topicPodcastPayload,
} from "@shared/contracts"
import { and, desc, eq, inArray, or, sql } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import { db } from "../../db"
import { deletePodcastFeedCache } from "../../db/podcastFeedCache"
import { podcastEpisodeChapters, podcastEpisodeListens, podcastEpisodes, subscriptions, topics } from "../../db/schema"
import { removePodcastEpisode } from "../../worker"
import { isAllowed } from "../authorization"
import { type AppEnv, currentUser } from "../currentUser"
import { toPodcastEpisodePreview } from "../share/podcastEpisodeImage"
import { toCachedPodcastEpisodePreviewPng, toPreviewPngResponse } from "../share/preview"
import { updateTopicFields } from "../tool/topicTools"
import { toTopicGateResponse } from "../topic/helpers"
import { canRateTopic } from "../topic/permissions"
import {
	type AccessiblePodcastEpisode,
	loadAccessiblePodcastEpisode,
	loadPodcastEpisode,
	loadPodcastEpisodePage,
	loadPublishedPodcastEpisode,
	loadPublishedPodcastEpisodeById,
	loadSeasonPodcastEpisodes,
} from "./helpers"
import {
	toPodcastEpisodeAudioResponse,
	toPodcastEpisodeChaptersResponse,
	toPodcastEpisodeTranscriptResponse,
} from "./podcastEpisodeFiles"

// which season's podcast episodes to list
const seasonPodcastEpisodesQuery = z.object({ season: z.coerce.number().int() })

// a podcast episode page's topic id, season, and episode number, from its url
const podcastEpisodePageParam = z.object({
	id: z.string(),
	season: z.coerce.number().int(),
	episodeNumber: z.coerce.number().int(),
})

// a chapter's podcast episode id and position, from its url
const podcastEpisodeChapterParam = z.object({ id: z.string(), position: z.coerce.number().int() })

// the topic that the listener is on. the next unplayed podcast episode comes from another topic
const nextUnplayedPodcastEpisodeQuery = z.object({ topicId: z.string().optional() })

// what a listener's player reported, with the listener and the podcast episode
type SavePodcastEpisodeListenOptions = PodcastEpisodeListenPayload & { userId: string; podcastEpisodeId: string }

// the user, and the topic that the user is on
type LoadNextUnplayedPodcastEpisodeOptions = { userId: string; currentTopicId?: string }

/**
 * Saves a listener's progress through a podcast episode, a play if playback started, and whether the listener finished.
 */
async function savePodcastEpisodeListen({
	userId,
	podcastEpisodeId,
	progressSeconds,
	isPlaybackStart,
	isCompleted,
}: SavePodcastEpisodeListenOptions): Promise<void> {
	// count one play if playback started, and set the completion time only if the listener finished
	const startedPlayCount = isPlaybackStart ? 1 : 0
	const completedFields = isCompleted ? { completedAt: new Date() } : {}

	// insert the listener's row for the podcast episode, or update that row
	await db
		.insert(podcastEpisodeListens)
		.values({ podcastEpisodeId, userId, progressSeconds, playCount: startedPlayCount, ...completedFields })
		.onConflictDoUpdate({
			target: [podcastEpisodeListens.podcastEpisodeId, podcastEpisodeListens.userId],
			set: {
				progressSeconds,
				playCount: sql`${podcastEpisodeListens.playCount} + ${startedPlayCount}`,
				...completedFields,
			},
		})
}

/**
 * Loads the newest unplayed podcast episode among the latest episodes of the user's other topics, with its topic,
 * or null.
 */
async function loadNextUnplayedPodcastEpisode({
	userId,
	currentTopicId,
}: LoadNextUnplayedPodcastEpisodeOptions): Promise<AccessiblePodcastEpisode | null> {
	// the topics that the user owns or subscribes to
	const userTopicRows = await db
		.selectDistinct({ id: topics.id })
		.from(topics)
		.leftJoin(subscriptions, and(eq(subscriptions.topicId, topics.id), eq(subscriptions.isActive, true)))
		.where(or(eq(topics.ownerId, userId), eq(subscriptions.subscriberUserId, userId)))

	// leave out the topic that the user is on, and stop if no other topic is left
	const otherTopicIds = userTopicRows.flatMap((userTopicRow) =>
		userTopicRow.id === currentTopicId ? [] : userTopicRow.id,
	)
	if (otherTopicIds.length === 0) {
		return null
	}

	// load each other topic's latest published podcast episode, and sort the episodes newest first
	const latestPodcastEpisodeRows = await db
		.selectDistinctOn([podcastEpisodes.topicId], { id: podcastEpisodes.id, publishedAt: podcastEpisodes.publishedAt })
		.from(podcastEpisodes)
		.where(and(inArray(podcastEpisodes.topicId, otherTopicIds), eq(podcastEpisodes.status, "published")))
		.orderBy(podcastEpisodes.topicId, desc(podcastEpisodes.publishedAt))
	const newestFirstPodcastEpisodeRows = latestPodcastEpisodeRows.toSorted(
		(first, second) => (second.publishedAt?.getTime() ?? 0) - (first.publishedAt?.getTime() ?? 0),
	)

	// the latest podcast episodes that the user already played
	const podcastEpisodeListenRows = await db
		.select({ podcastEpisodeId: podcastEpisodeListens.podcastEpisodeId })
		.from(podcastEpisodeListens)
		.where(
			and(
				eq(podcastEpisodeListens.userId, userId),
				inArray(
					podcastEpisodeListens.podcastEpisodeId,
					latestPodcastEpisodeRows.map(({ id }) => id),
				),
			),
		)
	const playedPodcastEpisodeIds = new Set(
		podcastEpisodeListenRows.map((podcastEpisodeListenRow) => podcastEpisodeListenRow.podcastEpisodeId),
	)

	// return the first podcast episode that the user has not played and may listen to
	for (const { id } of newestFirstPodcastEpisodeRows) {
		const accessiblePodcastEpisode = playedPodcastEpisodeIds.has(id)
			? null
			: await loadAccessiblePodcastEpisode({ userId, podcastEpisodeId: id })
		if (accessiblePodcastEpisode) {
			return accessiblePodcastEpisode
		}
	}

	// return null if the user has no unplayed podcast episode to listen to
	return null
}

// the podcast episode routes
export const podcastEpisodesRoute = new Hono<AppEnv>()
	.get("/topics/:id/episodes", zValidator("query", seasonPodcastEpisodesQuery), async (context) => {
		// load the topic behind the visibility gate. a hidden topic looks identical to a missing one
		const userId = currentUser(context)
		const [topic] = await db
			.select()
			.from(topics)
			.where(eq(topics.id, context.req.param("id")))
		if (!topic || !(await isAllowed(userId, "topic:view", topic))) {
			return context.json({ error: "not found" }, 404)
		}

		// the podcast episodes of the season that the query names
		return context.json(await loadSeasonPodcastEpisodes({ topic, userId, ...context.req.valid("query") }))
	})
	// a podcast episode page with the episode, its topic, and its transcript, for anyone who may listen to the episode
	.get("/topics/:id/episodes/:season/:episodeNumber", zValidator("param", podcastEpisodePageParam), async (context) => {
		// return the podcast episode page that the url names if the user may listen to the episode
		const userId = currentUser(context)
		const { id: topicId, season, episodeNumber } = context.req.valid("param")
		const podcastEpisodePage = await loadPodcastEpisodePage({ topicId, season, episodeNumber }, userId)
		if (podcastEpisodePage) {
			return context.json(podcastEpisodePage)
		}

		// respond 403 with the topic's gate to a user or visitor who may not see an invite or private topic, or 404.
		// only an invite topic's gate names the topic
		const publishedPodcastEpisode = await loadPublishedPodcastEpisode({ topicId, season, episodeNumber })
		const podcastEpisodeTopic = publishedPodcastEpisode?.topic
		const isTopicHidden =
			podcastEpisodeTopic !== undefined && !(await isAllowed(userId, "topic:view", podcastEpisodeTopic))
		const topicGateResponse = isTopicHidden && podcastEpisodeTopic ? toTopicGateResponse(podcastEpisodeTopic) : null
		return topicGateResponse ? context.json(topicGateResponse, 403) : context.json({ error: "not found" }, 404)
	})
	.put("/topics/:id/podcast", zValidator("json", topicPodcastPayload), async (context) => {
		// save the podcast switch through updateTopicFields
		const updateTopicFieldsResult = await updateTopicFields({
			userId: currentUser(context),
			topicId: context.req.param("id"),
			topicFields: context.req.valid("json"),
			promptVersionOrigin: "editor",
		})
		if (updateTopicFieldsResult.status === "saved") {
			return context.json({ ok: true })
		}

		// respond with a 404 or 403 for the gate's rejections
		return updateTopicFieldsResult.status === "missing"
			? context.json({ error: "not found" }, 404)
			: context.json({ error: "forbidden" }, 403)
	})
	.get("/episodes/next-unplayed", zValidator("query", nextUnplayedPodcastEpisodeQuery), async (context) => {
		// load the user's next unplayed podcast episode. a visitor has none
		const userId = currentUser(context)
		const { topicId: currentTopicId } = context.req.valid("query")
		const nextUnplayedPodcastEpisode = userId ? await loadNextUnplayedPodcastEpisode({ userId, currentTopicId }) : null
		return context.json({
			podcastEpisode: nextUnplayedPodcastEpisode
				? await loadPodcastEpisode({ ...nextUnplayedPodcastEpisode, userId })
				: null,
		})
	})
	.get("/episodes/:id", async (context) => {
		// a podcast episode that the user may not listen to looks identical to a missing one
		const userId = currentUser(context)
		const accessiblePodcastEpisode = await loadAccessiblePodcastEpisode({
			userId,
			podcastEpisodeId: context.req.param("id"),
		})
		if (!accessiblePodcastEpisode) {
			return context.json({ error: "not found" }, 404)
		}
		return context.json(await loadPodcastEpisode({ ...accessiblePodcastEpisode, userId }))
	})
	// the stable audio url. hono runs this route for a HEAD too and drops the body
	.get("/episodes/:id/audio.mp3", async (context) => {
		const accessiblePodcastEpisode = await loadAccessiblePodcastEpisode({
			userId: currentUser(context),
			podcastEpisodeId: context.req.param("id"),
		})
		return accessiblePodcastEpisode
			? toPodcastEpisodeAudioResponse(context, accessiblePodcastEpisode.podcastEpisodeRow)
			: context.json({ error: "not found" }, 404)
	})
	// the chapters file that a public feed's items name
	.get("/episodes/:id/chapters.json", async (context) => {
		const accessiblePodcastEpisode = await loadAccessiblePodcastEpisode({
			userId: currentUser(context),
			podcastEpisodeId: context.req.param("id"),
		})
		return accessiblePodcastEpisode
			? toPodcastEpisodeChaptersResponse(context, accessiblePodcastEpisode.podcastEpisodeRow.id)
			: context.json({ error: "not found" }, 404)
	})
	// the transcript that a public feed's items name, built from the stored script
	.get("/episodes/:id/transcript.html", async (context) => {
		const accessiblePodcastEpisode = await loadAccessiblePodcastEpisode({
			userId: currentUser(context),
			podcastEpisodeId: context.req.param("id"),
		})
		return accessiblePodcastEpisode
			? toPodcastEpisodeTranscriptResponse(context, accessiblePodcastEpisode.podcastEpisodeRow)
			: context.json({ error: "not found" }, 404)
	})
	// the link-preview card that a social platform fetches for a published podcast episode of any topic
	.get("/episodes/:id/preview.png", async (context) => {
		// respond 404 unless the podcast episode has published
		const publishedPodcastEpisode = await loadPublishedPodcastEpisodeById(context.req.param("id"))
		if (!publishedPodcastEpisode) {
			return context.json({ error: "not found" }, 404)
		}

		// draw the preview card on its first request, and read the card from storage after
		const podcastEpisodePreview = toPodcastEpisodePreview(
			publishedPodcastEpisode.podcastEpisodeRow,
			publishedPodcastEpisode.topic.name,
		)
		return toPreviewPngResponse(context, await toCachedPodcastEpisodePreviewPng(podcastEpisodePreview))
	})
	.post("/episodes/:id/listen", zValidator("json", podcastEpisodeListenPayload), async (context) => {
		// reject a visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}

		// a podcast episode that the user may not listen to looks identical to a missing one
		const accessiblePodcastEpisode = await loadAccessiblePodcastEpisode({
			userId,
			podcastEpisodeId: context.req.param("id"),
		})
		if (!accessiblePodcastEpisode) {
			return context.json({ error: "not found" }, 404)
		}

		// save what the player reported
		const podcastEpisodeId = accessiblePodcastEpisode.podcastEpisodeRow.id
		await savePodcastEpisodeListen({ userId, podcastEpisodeId, ...context.req.valid("json") })
		return context.json({ ok: true })
	})
	.post(
		"/episodes/:id/chapters/:position/rating",
		zValidator("param", podcastEpisodeChapterParam),
		zValidator("json", ratingPayload),
		async (context) => {
			// reject a visitor
			const userId = currentUser(context)
			if (!userId) {
				return context.json({ error: "unauthorized" }, 401)
			}

			// load the podcast episode's topic
			const { id: podcastEpisodeId, position } = context.req.valid("param")
			const [podcastEpisodeTopicRow] = await db
				.select({ topic: topics })
				.from(podcastEpisodes)
				.innerJoin(topics, eq(podcastEpisodes.topicId, topics.id))
				.where(eq(podcastEpisodes.id, podcastEpisodeId))

			// respond 404 to anyone who may not rate the topic's findings
			if (!podcastEpisodeTopicRow || !(await canRateTopic(userId, podcastEpisodeTopicRow.topic))) {
				return context.json({ error: "not found" }, 404)
			}

			// rate the chapter up or down, or clear its rating
			const ratedPodcastEpisodeChapterRows = await db
				.update(podcastEpisodeChapters)
				.set({ rating: context.req.valid("json").rating })
				.where(
					and(
						eq(podcastEpisodeChapters.podcastEpisodeId, podcastEpisodeId),
						eq(podcastEpisodeChapters.position, position),
					),
				)
				.returning({ id: podcastEpisodeChapters.id })
			return ratedPodcastEpisodeChapterRows.length > 0
				? context.json({ ok: true })
				: context.json({ error: "not found" }, 404)
		},
	)
	.delete("/episodes/:id", async (context) => {
		// load the podcast episode's topic
		const userId = currentUser(context)
		const [podcastEpisodeTopicRow] = await db
			.select({ topic: topics })
			.from(podcastEpisodes)
			.innerJoin(topics, eq(podcastEpisodes.topicId, topics.id))
			.where(eq(podcastEpisodes.id, context.req.param("id")))

		// respond 404 to anyone but the topic's owner and an admin
		if (!podcastEpisodeTopicRow || !(await isAllowed(userId, "podcastEpisode:remove", podcastEpisodeTopicRow.topic))) {
			return context.json({ error: "not found" }, 404)
		}

		// remove the podcast episode with its audio, then delete the topic's cached feeds
		if (!(await removePodcastEpisode(context.req.param("id")))) {
			return context.json({ error: "not found" }, 404)
		}
		await deletePodcastFeedCache(podcastEpisodeTopicRow.topic.id)
		return context.json({ ok: true })
	})
