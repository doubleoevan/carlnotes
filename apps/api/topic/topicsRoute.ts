// the topic routes: the page, the poll, create, update, delete, and the per-topic settings

import { suggestSourcesPayload, updateTopicPayload } from "@carlnotes/contracts/topicPayloads"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { incrementDaySuggestionCount } from "@carlnotes/db/quotas"
import { cacheJson } from "@carlnotes/db/redis"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { suggestSources } from "@carlnotes/pipeline/suggest"
import { trackEvent } from "@carlnotes/server/analytics"
import { traceRequestStage } from "@carlnotes/server/monitoring"
import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { z } from "zod"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { toolCallerRateLimiter } from "../rateLimit"
import { deleteTopic } from "./deleteTopic"
import { readVisitorTopicPage, TOPIC_PAGE_KEY_PREFIX } from "./feeds"
import { loadTopicGateResponse } from "./helpers"
import { createTopic, updateTopic } from "./saveTopic"
import { loadTeamTopicOptions } from "./teamTopicOptions"
import { loadTopicPage } from "./topics"

// the query flag that marks a topic page request as a poll reload
const topicPageQuery = z.object({ poll: z.literal("1").optional() })

// how long Redis caches a topic page for poll reloads
const TOPIC_PAGE_POLL_TTL_MS = 2000

// the topic routes: create, source suggestions, read, update, and delete
export const topicsRoute = new Hono<AppEnv>()
	.post("/topics", zValidator("json", updateTopicPayload), async (context) => {
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

		// each rejection is named: a rejecting invitee, a spent invite limit, or a topic quota
		if (createTopicResult.status === "inviteeRejected") {
			return context.json({ error: "invitee-not-accepting", email: createTopicResult.email }, 409)
		}
		if (createTopicResult.status === "inviteLimit") {
			return context.json({ error: "daily invite limit reached" }, 429)
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
		const isPoll = context.req.valid("query").poll === "1"
		const loadTracedTopicPage = (): Promise<TopicResponse | null> =>
			traceRequestStage("topic_page.load", () => loadTopicPage(userId, topicId, { isPoll }))

		// read the page, then respond with it if it is visible
		let topicPage: TopicResponse | null
		if (isPoll) {
			// read a poll from a short Redis cache per user and topic
			const pollKey = `${TOPIC_PAGE_KEY_PREFIX}:${userId ?? "visitor"}:${topicId}`
			topicPage = await cacheJson({ key: pollKey, ttlMs: TOPIC_PAGE_POLL_TTL_MS, load: loadTracedTopicPage })
		} else if (userId) {
			// load a signed-in user's page from the database
			topicPage = await loadTracedTopicPage()
		} else {
			// read a visitor's page from the visitors' cached page
			topicPage = await readVisitorTopicPage(topicId, loadTracedTopicPage)
		}
		if (topicPage) {
			return context.json(topicPage)
		}
		// respond 403 with the gate of an invite or private topic, or 404 for a missing topic
		const topicGateResponse = await loadTopicGateResponse(topicId)
		return topicGateResponse ? context.json(topicGateResponse, 403) : context.json({ error: "not found" }, 404)
	})
	.patch("/topics/:id", zValidator("json", updateTopicPayload), async (context) => {
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
