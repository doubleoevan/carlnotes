// the topic routes: the page, the page read, the poll, the related topics, create, update, delete, removing one Source, and the
// per-topic settings

import { cardsPageQuery } from "@carlnotes/contracts/cardPages"
import { topicPageQuery, topicPageReadQuery } from "@carlnotes/contracts/routeShapes"
import { suggestSourcesPayload, updateTopicPayload } from "@carlnotes/contracts/topicPayloads"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { incrementDaySuggestionCount } from "@carlnotes/db/quotas"
import { cacheJson } from "@carlnotes/db/redis"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { suggestSources } from "@carlnotes/pipeline/suggest"
import { trackEvent } from "@carlnotes/server/analytics"
import { zValidator } from "@hono/zod-validator"
import { type Context, Hono } from "hono"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { renderedPageReadCacheHeaders, setPollCacheHeaders } from "../edgeCache"
import { toObjectionableContentResponse } from "../moderation"
import { socialReadRateLimiter, toolCallerRateLimiter } from "../rateLimit"
import { toTermsOutdatedRejection } from "../termsAcceptance"
import { removeTopicSource } from "../tool/topicSourceTools"
import { loadViewableTopic } from "./accessibleFindings"
import { deleteTopic } from "./deleteTopic"
import { TOPIC_PAGE_KEY_PREFIX } from "./feedCaches"
import { loadTopicGateResponse } from "./helpers"
import { loadRelatedTopics } from "./relatedTopics"
import { toYoutubeSourceRejectionMessage } from "./saveHelpers"
import { createTopic, updateTopic } from "./saveTopic"
import { loadTeamTopicOptions } from "./teamTopicOptions"
import {
	loadTracedTopicPageWithHeadRows,
	readTopicPageRead,
	readVisitorTopicPage,
	toPagedTopicPage,
} from "./topicPageRead"
import { loadTopicScansPage } from "./topicScansPage"

// how long Redis caches a topic page for poll reloads
const TOPIC_PAGE_POLL_TTL_MS = 2000

// the topic routes: create, source suggestions, read, update, and delete. a create, an update, and a suggestion each
// count against the tool callers' limit, because a saved url Source and a suggestion each start a paid fetch or search
export const topicsRoute = new Hono<AppEnv>()
	.post("/topics", toolCallerRateLimiter, zValidator("json", updateTopicPayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// create a topic for the current user within the topic limit and the daily topic limit
		const createTopicResult = await createTopic(userId, context.req.valid("json"), toAnalyticsProperties(context))
		if (createTopicResult.status === "created") {
			return context.json({ id: createTopicResult.id })
		}

		// each rejection is named: a violating name or prompt, a rejecting invitee, a spent invite limit, or a quota
		if (createTopicResult.status === "objectionable") {
			return toObjectionableContentResponse(context, createTopicResult.category)
		}

		// the Terms and the invitee rejections
		if (createTopicResult.status === "termsOutdated") {
			return toTermsOutdatedRejection(context)
		}
		if (createTopicResult.status === "inviteeRejected") {
			return context.json({ error: "invitee-not-accepting", email: createTopicResult.email }, 409)
		}

		if (createTopicResult.status === "inviteLimit") {
			return context.json({ error: "daily invite limit reached" }, 429)
		}
		// a YouTube value that names no YouTube channel or playlist, or one YouTube did not respond to, is rejected in
		// words the editor shows
		if (createTopicResult.status === "youtubeSourceUnresolved") {
			return context.json(
				{ error: toYoutubeSourceRejectionMessage(createTopicResult) },
				createTopicResult.isYoutubeUnavailable ? 503 : 422,
			)
		}
		// a full topic limit and a full daily topic limit both reject, but only the second can name its number
		return createTopicResult.status === "dailyFrequency"
			? context.json({ error: "daily topic limit reached", dailyTopicLimit: createTopicResult.limit }, 429)
			: context.json({ error: "quota exhausted" }, 429)
	})
	.post(
		"/topics/suggest-sources",
		toolCallerRateLimiter,
		zValidator("json", suggestSourcesPayload),
		async (context) => {
			// reject a signed-out visitor
			const userId = currentUser(context)
			if (!userId) {
				return context.json({ error: "unauthorized" }, 401)
			}
			// the suggestion's model call bills to the user's own LiteLLM key, created first if the user has none
			const litellmApiKey = await loadOrProvisionUserLiteLLMKey(userId)

			// suggesting is not scanning, so it draws on its own daily limit instead of the scan quota
			if (!(await incrementDaySuggestionCount(userId))) {
				return context.json({ error: "daily suggestion limit reached" }, 429)
			}
			// propose sources from the topic's own text
			const { name, prompt, attachmentContext, excludeSources, limit } = context.req.valid("json")
			const suggestedSources = await suggestSources({
				userId,
				name,
				prompt,
				attachmentContext,
				excludeSources,
				limit,
				litellmApiKey,
			})
			trackEvent("sources_suggested", userId, {
				...toAnalyticsProperties(context),
				suggestedSourceCount: suggestedSources.length,
			})
			return context.json({ sources: suggestedSources })
		},
	)
	.get("/topics/addable", async (context) => {
		// the topics a signed-in user may bring to a team, in the order the picker shows them
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		return context.json({ topics: await loadTeamTopicOptions(userId, context.req.query("excludeTeam")) })
	})
	.get("/topics/:id", zValidator("query", topicPageQuery), async (context) => {
		// the topic detail payload's traced loader, gated by visibility. a signed-out visitor may only view a public topic
		const userId = currentUser(context)
		const topicId = context.req.param("id")
		const { poll, related, paged, topicPostsPage = 0, scans } = context.req.valid("query")
		const isPoll = poll === "1"
		// a signed-in client that reads the related topics in a read of their own gets the page without them. a visitor's
		// page always holds them. a page that asks for the newest scans alone holds the newest page of them
		const isRelatedTopicsSeparate = related === "separate" && userId !== null
		const isNewestScans = scans === "newest"
		const loadUserTopicPage = async (): Promise<TopicResponse | null> =>
			(await loadTracedTopicPageWithHeadRows({ userId, topicId, isPoll, isRelatedTopicsSeparate, isNewestScans }))
				?.topicPage ?? null

		// read the page, then respond with it if it is visible
		let topicPage: TopicResponse | null
		if (isPoll) {
			// read a poll from a short Redis cache per user, topic, and scan list
			const pollKey = `${TOPIC_PAGE_KEY_PREFIX}:${userId ?? "visitor"}:${topicId}${isNewestScans ? ":newest-scans" : ""}`
			topicPage = await cacheJson({ key: pollKey, ttlMs: TOPIC_PAGE_POLL_TTL_MS, load: loadUserTopicPage })
		} else if (userId) {
			// load a signed-in user's page from the database
			topicPage = await loadUserTopicPage()
		} else {
			// read a visitor's page from the topic's visitor copy
			topicPage = await readVisitorTopicPage(topicId, { isNewestScans })
		}
		// a paged read holds one page of the Topic Posts
		const shownTopicPage = topicPage && paged ? toPagedTopicPage(topicPage, topicPostsPage) : topicPage
		const response = shownTopicPage ? context.json(shownTopicPage) : await toHiddenTopicResponse(context, topicId)

		// a visitor's poll of a public topic is shared at the edge for three seconds
		if (isPoll) {
			setPollCacheHeaders(context.req.raw, response, topicPage?.visibility === "public")
		}
		return response
	})
	// the topic's page read: the head with the page, or with the gate of an invite topic, served to visitors from the
	// topic's copy
	.get("/topics/:id/page", renderedPageReadCacheHeaders, zValidator("query", topicPageReadQuery), async (context) => {
		// a user's read may hold the newest page of scans alone, as a visitor's copy always does, and a paged read holds
		// one page of the Topic Posts
		const { paged, topicPostsPage = 0, scans } = context.req.valid("query")
		const topicPageRead = await readTopicPageRead({
			userId: currentUser(context),
			topicId: context.req.param("id"),
			isNewestScans: scans === "newest",
		})
		if (!topicPageRead) {
			return context.json({ error: "not found" }, 404)
		}
		return context.json(
			paged && topicPageRead.topic
				? { ...topicPageRead, topic: toPagedTopicPage(topicPageRead.topic, topicPostsPage) }
				: topicPageRead,
		)
	})
	// one later page of the topic's scan history, gated by the page's own visibility rule
	.get("/topics/:id/scans", socialReadRateLimiter, zValidator("query", cardsPageQuery), async (context) => {
		// the topic the user may open, and its page of scans, or the page's 403 gate or 404
		const userId = currentUser(context)
		const topicId = context.req.param("id")
		const topic = await loadViewableTopic(userId, topicId)
		return topic
			? context.json(await loadTopicScansPage({ userId, topic, page: context.req.valid("query").page }))
			: toHiddenTopicResponse(context, topicId)
	})
	.get("/topics/:id/related-topics", socialReadRateLimiter, async (context) => {
		// the topic's related topics, gated by the page's own visibility rule, for a client that reads them apart from
		// the page
		const userId = currentUser(context)
		const topicId = context.req.param("id")
		const topic = await loadViewableTopic(userId, topicId)
		return topic
			? context.json({ relatedTopics: await loadRelatedTopics(topic, userId) })
			: toHiddenTopicResponse(context, topicId)
	})
	.patch("/topics/:id", toolCallerRateLimiter, zValidator("json", updateTopicPayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// save the edited topic's fields and reconcile the invitee and source lists. owner or admin only.
		const updateTopicResult = await updateTopic(
			userId,
			context.req.param("id"),
			context.req.valid("json"),
			toAnalyticsProperties(context),
		)
		if (updateTopicResult.status === "saved") {
			return context.json({ ok: true })
		}

		// a violating name or prompt is rejected in Carl's words
		if (updateTopicResult.status === "objectionable") {
			return toObjectionableContentResponse(context, updateTopicResult.category)
		}
		if (updateTopicResult.status === "termsOutdated") {
			return toTermsOutdatedRejection(context)
		}
		// a daily frequency past the plan's limit is a quota rejection
		if (updateTopicResult.status === "dailyFrequency") {
			return context.json({ error: "daily topic limit reached", dailyTopicLimit: updateTopicResult.limit }, 429)
		}
		// a rejected invitee is returned with its email, and a spent invite limit is returned with its error
		if (updateTopicResult.status === "inviteeRejected") {
			return context.json({ error: "invitee-not-accepting", email: updateTopicResult.email }, 409)
		}
		if (updateTopicResult.status === "inviteLimit") {
			return context.json({ error: "daily invite limit reached" }, 429)
		}
		// a YouTube value that names no YouTube channel or playlist, or one YouTube did not respond to, is rejected in
		// words the editor shows
		if (updateTopicResult.status === "youtubeSourceUnresolved") {
			return context.json(
				{ error: toYoutubeSourceRejectionMessage(updateTopicResult) },
				updateTopicResult.isYoutubeUnavailable ? 503 : 422,
			)
		}
		// a topic the user cannot see reads as one that does not exist
		return updateTopicResult.status === "missing"
			? context.json({ error: "not found" }, 404)
			: context.json({ error: "forbidden" }, 403)
	})
	.delete("/topics/:id", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// delete the topic and everything attached to it. owner or admin only.
		const isTopicDeleted = await deleteTopic(userId, context.req.param("id"), toAnalyticsProperties(context))
		return isTopicDeleted ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.delete("/topics/:id/sources/:sourceId", async (context) => {
		// remove one Source through the shared topic tool
		const removeTopicSourceResult = await removeTopicSource({
			userId: currentUser(context),
			topicId: context.req.param("id"),
			sourceId: context.req.param("sourceId"),
			origin: "editor",
			analyticsProperties: toAnalyticsProperties(context),
		})

		// map the result to a status
		switch (removeTopicSourceResult.status) {
			case "saved":
				return context.body(null, 204)
			case "missing":
				return context.json({ error: "not found" }, 404)
			case "forbidden":
				return context.json({ error: "forbidden" }, 403)
			// a rule that keeps the Source is a 409 that names the rule
			default:
				return context.json({ error: removeTopicSourceResult.status }, 409)
		}
	})

// respond 403 with the gate of an invite topic, or 404 for a private or missing topic
async function toHiddenTopicResponse(context: Context<AppEnv>, topicId: string): Promise<Response> {
	const topicGateResponse = await loadTopicGateResponse(topicId)
	return topicGateResponse ? context.json(topicGateResponse, 403) : context.json({ error: "not found" }, 404)
}
