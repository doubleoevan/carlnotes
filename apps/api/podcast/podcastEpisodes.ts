// the podcast episode routes for a season's episodes, an episode page, the next unplayed episode, one episode,
// its files and preview card, a listener's progress, a chapter's rating, the owner's podcast switch,
// and removing an episode

import {
	PODCAST_EPISODE_CHAPTER_POSITION_MAX,
	podcastEpisodeListenPayload,
	ratingPayload,
} from "@carlnotes/contracts/payloads"
import { topicPodcastPayload } from "@carlnotes/contracts/topicPayloads"
import { db } from "@carlnotes/db"
import { deletePodcastFeedCache } from "@carlnotes/db/podcastFeedCache"
import { podcastEpisodeChapters, podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { removePodcastEpisode } from "@carlnotes/pipeline/podcast/removePodcastEpisode"
import { zValidator } from "@hono/zod-validator"
import { and, eq } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import { isAllowed } from "../authorization"
import { countPodcastEpisodeListen, countWithinRateLimit, toRequestSender } from "../counts/viewerCounts"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { PRIVATE_NO_STORE_CACHE_CONTROL } from "../edgeCache"
import { toPodcastEpisodePreview } from "../share/podcastEpisodeImage"
import { toCachedPodcastEpisodePreviewPng, toPreviewPngResponse } from "../share/preview"
import { updateTopicFields } from "../tool/topicTools"
import { canRateTopic } from "../topic/findingPermissions"
import { toTopicGateResponse } from "../topic/helpers"
import { loadPodcastEpisodePage, loadSeasonPodcastEpisodes } from "./helpers"
import { readPlayToken } from "./playTokens"
import {
	toPodcastEpisodeAudioResponse,
	toPodcastEpisodeChaptersResponse,
	toPodcastEpisodeTranscriptResponse,
} from "./podcastEpisodeFiles"
import { loadNextUnplayedPodcastEpisode, savePodcastEpisodeListen } from "./podcastEpisodeListens"
import {
	loadAccessiblePodcastEpisode,
	loadPublishedPodcastEpisode,
	loadPublishedPodcastEpisodeById,
} from "./podcastEpisodeRows"
import { loadPodcastEpisode } from "./podcastEpisodeShapes"

// which season's podcast episodes to list
const podcastEpisodeNumberParam = z.coerce.number().pipe(z.int32().positive())
const seasonPodcastEpisodesQuery = z.object({ season: podcastEpisodeNumberParam })

// a podcast episode page's topic id, season, and episode number, from its url
const podcastEpisodePageParam = z.object({
	id: z.string(),
	season: podcastEpisodeNumberParam,
	episodeNumber: podcastEpisodeNumberParam,
})

// a chapter's podcast episode id and position, from its url
const podcastEpisodeChapterParam = z.object({
	id: z.string(),
	position: z.coerce.number().int().min(0).max(PODCAST_EPISODE_CHAPTER_POSITION_MAX),
})

// the topic that the listener is on. the next unplayed podcast episode comes from another topic
const nextUnplayedPodcastEpisodeQuery = z.object({ topicId: z.string().optional() })

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

		// respond 403 with the gate of an invite topic to a user or visitor who may not see it, and 404 for a private
		// topic, which does not exist for them, or a missing podcast episode
		const publishedPodcastEpisode = await loadPublishedPodcastEpisode({ topicId, season, episodeNumber })
		const podcastEpisodeTopic = publishedPodcastEpisode?.topic
		const isTopicHidden =
			podcastEpisodeTopic !== undefined && !(await isAllowed(userId, "topic:view", podcastEpisodeTopic))

		// the gate of a hidden invite topic, which names the topic
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
			analyticsProperties: toAnalyticsProperties(context),
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
	// the stable audio url. hono runs this route for a HEAD too and drops the body. an mcp card's audio element sends no
	// session, so its play token names the caller instead, and a token that names none reads as missing
	.get("/episodes/:id/audio.mp3", async (context) => {
		// keep denied and successful sources out of shared caches
		context.header("Cache-Control", PRIVATE_NO_STORE_CACHE_CONTROL)
		context.header("Vary", "Accept")
		const podcastEpisodeId = context.req.param("id")
		const playToken = context.req.query("play")
		const playTokenCaller = playToken ? readPlayToken({ playToken, podcastEpisodeId }) : null
		if (playToken && !playTokenCaller) {
			return context.json({ error: "not found" }, 404)
		}

		// the listener is the token's caller, else the session's user, and the podcast episode is read under that listener's access
		const listenerUserId = playTokenCaller ? playTokenCaller.userId : currentUser(context)
		const accessiblePodcastEpisode = await loadAccessiblePodcastEpisode({ userId: listenerUserId, podcastEpisodeId })
		if (!accessiblePodcastEpisode) {
			return context.json({ error: "not found" }, 404)
		}

		// count the listener of a web play or a podcast app's download within the listen rate limit, without the redirect
		// waiting on the count
		if (context.req.method === "GET" && accessiblePodcastEpisode.podcastEpisodeRow.audioKey) {
			const requestSender = toRequestSender(context, listenerUserId ?? undefined)
			void countWithinRateLimit({
				requestSender,
				rateLimitName: "podcast-listen",
				count: () => countPodcastEpisodeListen(requestSender, podcastEpisodeId),
			})
		}
		return toPodcastEpisodeAudioResponse(context, accessiblePodcastEpisode.podcastEpisodeRow)
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
		await savePodcastEpisodeListen({
			userId,
			podcastEpisodeId: accessiblePodcastEpisode.podcastEpisodeRow.id,
			topic: accessiblePodcastEpisode.topic,
			analyticsProperties: toAnalyticsProperties(context),
			...context.req.valid("json"),
		})
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
