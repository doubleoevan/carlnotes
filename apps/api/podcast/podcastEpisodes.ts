// the podcast episode routes for a season's episodes, an episode page, the next unplayed episode, one episode,
// its files and preview card, a listener's progress, a chapter's rating, the owner's podcast switch, an editor's
// change to a podcast episode's title and description, and removing a podcast episode

import { podcastEpisodeListenPayload, ratingPayload } from "@carlnotes/contracts/payloads"
import { updatePodcastEpisodePayload } from "@carlnotes/contracts/podcast"
import {
	nextUnplayedPodcastEpisodeQuery,
	podcastEpisodeChapterParam,
	podcastEpisodePageParam,
	seasonPodcastEpisodesQuery,
} from "@carlnotes/contracts/routeShapes"
import { topicPodcastPayload } from "@carlnotes/contracts/topicPayloads"
import { db } from "@carlnotes/db"
import { deletePodcastFeedCache } from "@carlnotes/db/podcastFeedCache"
import { podcastEpisodeChapters, podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { clearVisitorPagesOfTopic } from "@carlnotes/db/visitorPageCaches"
import { removePodcastEpisode } from "@carlnotes/pipeline/podcast/removePodcastEpisode"
import { zValidator } from "@hono/zod-validator"
import { and, eq } from "drizzle-orm"
import { Hono } from "hono"
import { isAllowed } from "../authorization"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { clearProfilePage, PRIVATE_NO_STORE_CACHE_CONTROL, renderedPageReadCacheHeaders } from "../edgeCache"
import { toObjectionableCategory, toObjectionableContentResponse } from "../moderation"
import { readRequestPlace } from "../requestPlace"
import { toCardResponse } from "../share/cardResponse"
import { toPodcastEpisodePreview } from "../share/podcastEpisodeImage"
import { toPodcastEpisodePreviewCard } from "../share/preview"
import { updateTopicFields } from "../tool/topicTools"
import { canRateTopic } from "../topic/findingPermissions"
import { clearHomeCaches } from "../topic/homeOrder"
import { overlayUncheckedPodcastEpisodeImages } from "../uncheckedImageOverlays"
import { loadSeasonPodcastEpisodes } from "./helpers"
import { loadPodcastEpisodeEditor } from "./podcastEpisodeEditor"
import {
	countPodcastEpisodePlayRequest,
	loadPodcastEpisodePlayRequest,
	toPodcastEpisodeAudioResponse,
	toPodcastEpisodeChaptersResponse,
	toPodcastEpisodeTranscriptResponse,
} from "./podcastEpisodeFiles"
import { loadNextUnplayedPodcastEpisode, savePodcastEpisodeListen } from "./podcastEpisodeListens"
import { loadPodcastEpisodePageOrGate, readPodcastEpisodePageRead } from "./podcastEpisodePageRead"
import { loadAccessiblePodcastEpisode, loadPublishedPodcastEpisodeById } from "./podcastEpisodeRows"
import { loadPodcastEpisode } from "./podcastEpisodeShapes"

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
		// respond 403 with the gate of an invite topic to a user or visitor who may not see it, and 404 for a private
		// topic, which does not exist for them, or a missing podcast episode
		const { id: topicId, season, episodeNumber } = context.req.valid("param")
		const { podcastEpisodePage, topicGate } = await loadPodcastEpisodePageOrGate({
			userId: currentUser(context),
			podcastEpisodePageAddress: { topicId, season, episodeNumber },
		})
		if (podcastEpisodePage) {
			return context.json(podcastEpisodePage)
		}
		return topicGate ? context.json(topicGate, 403) : context.json({ error: "not found" }, 404)
	})
	// the podcast episode's page read: the head with the page, or with its invite topic's gate
	.get(
		"/topics/:id/episodes/:season/:episodeNumber/page",
		renderedPageReadCacheHeaders,
		zValidator("param", podcastEpisodePageParam),
		async (context) => {
			const { id: topicId, season, episodeNumber } = context.req.valid("param")
			const podcastEpisodePageRead = await readPodcastEpisodePageRead({
				userId: currentUser(context),
				podcastEpisodePageAddress: { topicId, season, episodeNumber },
			})
			return podcastEpisodePageRead ? context.json(podcastEpisodePageRead) : context.json({ error: "not found" }, 404)
		},
	)
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

		// the podcast episode, which anyone but a signed-in editor of its topic reads as published
		const podcastEpisode = await loadPodcastEpisode({ ...accessiblePodcastEpisode, userId })
		if (!userId || !(await isAllowed(userId, "topic:edit", accessiblePodcastEpisode.topic))) {
			return context.json(podcastEpisode)
		}

		// an editor reads their unchecked uploads in place of the podcast episode's image and its film's poster
		const uncheckedPodcastEpisodeImages = await overlayUncheckedPodcastEpisodeImages(podcastEpisode, userId)
		return context.json(uncheckedPodcastEpisodeImages.podcastEpisode)
	})
	// the stable audio url. hono runs this route for a HEAD too and drops the body
	.get("/episodes/:id/audio.mp3", async (context) => {
		// keep denied and successful sources out of shared caches, and read the listener and the podcast episode
		context.header("Cache-Control", PRIVATE_NO_STORE_CACHE_CONTROL)
		context.header("Vary", "Accept")
		const podcastEpisodePlayRequest = await loadPodcastEpisodePlayRequest(context)
		if (!podcastEpisodePlayRequest) {
			return context.json({ error: "not found" }, 404)
		}

		// count a GET of audio that exists
		const { podcastEpisodeRow } = podcastEpisodePlayRequest.accessiblePodcastEpisode
		if (context.req.method === "GET" && podcastEpisodeRow.audioKey) {
			countPodcastEpisodePlayRequest(context, podcastEpisodePlayRequest, "audio")
		}
		return toPodcastEpisodeAudioResponse(context, podcastEpisodeRow)
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
		// respond 404 unless the podcast episode has published, and draw the card on its first request
		const podcastEpisodeId = context.req.param("id")
		const podcastEpisodeCardResponse = await toCardResponse({
			context,
			cardKey: `podcast-episode:${podcastEpisodeId}`,
			loadPreview: async () => {
				const publishedPodcastEpisode = await loadPublishedPodcastEpisodeById(podcastEpisodeId)
				return publishedPodcastEpisode
					? toPodcastEpisodePreview(publishedPodcastEpisode.podcastEpisodeRow, publishedPodcastEpisode.topic)
					: null
			},
			toPreviewCard: toPodcastEpisodePreviewCard,
		})
		return podcastEpisodeCardResponse?.response ?? context.json({ error: "not found" }, 404)
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
			place: readRequestPlace(context.req.raw),
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
		// a home podcast episode left the home, and the podcast episode left its topic owner's profile page
		await clearHomeCaches()
		await clearProfilePage(podcastEpisodeTopicRow.topic.ownerId)
		return context.json({ ok: true })
	})
	// an editor's change to a podcast episode's title and description, after the text moderation
	.patch("/episodes/:id", zValidator("json", updatePodcastEpisodePayload), async (context) => {
		// an editor of the podcast episode's topic
		const editor = await loadPodcastEpisodeEditor(context)
		if ("response" in editor) {
			return editor.response
		}

		// the title and the description pass the moderation together
		const { title, description } = context.req.valid("json")
		const objectionableCategory = await toObjectionableCategory({
			text: `${title}\n${description}`,
			textKind: "a podcast episode's title and description",
			subjectKind: "podcastEpisode",
			subjectId: editor.podcastEpisodeId,
		})
		if (objectionableCategory) {
			return toObjectionableContentResponse(context, objectionableCategory)
		}

		// the new words, then the caches that show them: the feeds, the topic's visitor page, and the home
		await db
			.update(podcastEpisodes)
			.set({ title, description: description || null })
			.where(eq(podcastEpisodes.id, editor.podcastEpisodeId))
		await Promise.all([
			deletePodcastFeedCache(editor.topicId),
			clearVisitorPagesOfTopic(editor.topicId),
			clearHomeCaches(),
		])
		return context.json({ ok: true })
	})
