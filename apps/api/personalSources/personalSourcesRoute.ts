// additive personal sources routes use session authority and never accept send-only credentials

import { addPersonalSourcesAiAgentPayload } from "@carlnotes/contracts/personalSourcesAccounts"
import {
	personalSourcesNumberedPageQuery,
	personalSourcesPageQuery,
} from "@carlnotes/contracts/personalSourcesPayloads"
import { loadFindingPersonalAnnotation } from "@carlnotes/db/findingPersonalAnnotations"
import { loadPersonalSourcesEntries } from "@carlnotes/db/personalSourceEntries"
import { loadSenderPersonalSourcesContext, loadTopicPersonalSources } from "@carlnotes/db/personalSources"
import { loadPersonalSourcesAiAgentRecommendations } from "@carlnotes/db/personalSourcesAiAgentRecommendations"
import { addPersonalSourcesAiAgent } from "@carlnotes/db/personalSourcesAiAgentSetup"
import { deletePersonalSource, deletePersonalSourceEntry } from "@carlnotes/db/personalSourcesLifecycle"
import { notifyPersonalSourcesChanged } from "@carlnotes/pipeline/personalSources/work"
import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { type AppEnv, currentUser } from "../currentUser"

// no authenticated private response may be retained by a browser or intermediary cache
export const personalSourcesRoute = new Hono<AppEnv>()
	.use("/topics/:id/personal-sources/*", async (context, next) => {
		context.header("Cache-Control", "no-store")
		await next()
	})
	.get("/topics/:id/personal-sources/findings/:findingId/annotation", async (context) => {
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		const annotation = await loadFindingPersonalAnnotation({
			userId,
			topicId: context.req.param("id"),
			findingId: context.req.param("findingId"),
		})
		return context.json(annotation)
	})
	.get("/topics/:id/personal-sources", async (context) => {
		context.header("Cache-Control", "no-store")
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		const personalSources = await loadTopicPersonalSources({ userId, topicId: context.req.param("id") })
		return personalSources ? context.json(personalSources) : context.json({ error: "not found" }, 404)
	})
	.get("/topics/:id/personal-sources/context", async (context) => {
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		const summary = await loadSenderPersonalSourcesContext({ userId, topicId: context.req.param("id") })
		return summary ? context.json(summary) : context.json({ error: "not found" }, 404)
	})
	.get("/topics/:id/personal-sources/ai-agents/recommendations", async (context) => {
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		const aiAgentIds = await loadPersonalSourcesAiAgentRecommendations({ userId, topicId: context.req.param("id") })
		return aiAgentIds ? context.json({ aiAgentIds }) : context.json({ error: "not found" }, 404)
	})
	.post(
		"/topics/:id/personal-sources/ai-agents",
		zValidator("json", addPersonalSourcesAiAgentPayload),
		async (context) => {
			const userId = currentUser(context)
			if (!userId) {
				return context.json({ error: "unauthorized" }, 401)
			}
			const outcome = await addPersonalSourcesAiAgent({
				userId,
				topicId: context.req.param("id"),
				clientId: context.req.valid("json").clientId,
			})
			if (outcome === "added") {
				return context.json({ ok: true as const })
			}
			if (outcome === "not_found") {
				return context.json({ error: "not found" }, 404)
			}
			return context.json({ error: outcome }, 403)
		},
	)
	.get(
		"/topics/:id/personal-sources/entries",
		zValidator("query", personalSourcesNumberedPageQuery),
		async (context) => {
			const userId = currentUser(context)
			if (!userId) {
				return context.json({ error: "unauthorized" }, 401)
			}
			const entries = await loadPersonalSourcesEntries({
				userId,
				topicId: context.req.param("id"),
				cursor: context.req.valid("query").cursor,
				pageNumber: context.req.valid("query").page,
			})
			if (entries === "invalid_cursor") {
				return context.json({ error: "invalid cursor" }, 400)
			}
			return entries ? context.json(entries) : context.json({ error: "not found" }, 404)
		},
	)
	.get(
		"/topics/:id/personal-sources/sources/:sourceId/titles",
		zValidator("query", personalSourcesPageQuery),
		async (context) => {
			const userId = currentUser(context)
			if (!userId) {
				return context.json({ error: "unauthorized" }, 401)
			}
			const page = await loadPersonalSourcesEntries({
				isTitlePage: true,
				userId,
				topicId: context.req.param("id"),
				sourceId: context.req.param("sourceId"),
				cursor: context.req.valid("query").cursor,
			})
			if (page === "invalid_cursor") {
				return context.json({ error: "invalid cursor" }, 400)
			}
			return page
				? context.json({
						nextCursor: page.nextCursor,
						entries: page.entries.map(({ id, title, receivedAt, expiresAt }) => ({ id, title, receivedAt, expiresAt })),
					})
				: context.json({ error: "not found" }, 404)
		},
	)
	.get(
		"/topics/:id/personal-sources/sources/:sourceId/entries",
		zValidator("query", personalSourcesPageQuery),
		async (context) => {
			const userId = currentUser(context)
			if (!userId) {
				return context.json({ error: "unauthorized" }, 401)
			}
			const entries = await loadPersonalSourcesEntries({
				userId,
				topicId: context.req.param("id"),
				sourceId: context.req.param("sourceId"),
				cursor: context.req.valid("query").cursor,
			})
			if (entries === "invalid_cursor") {
				return context.json({ error: "invalid cursor" }, 400)
			}
			return entries ? context.json(entries) : context.json({ error: "not found" }, 404)
		},
	)
	.delete("/topics/:id/personal-sources/entries/:entryId", async (context) => {
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		const deleted = await deletePersonalSourceEntry({
			userId,
			topicId: context.req.param("id"),
			entryId: context.req.param("entryId"),
		})
		if (deleted) {
			await notifyPersonalSourcesChanged(context.req.param("id"))
		}
		return deleted ? context.json({ ok: true as const }) : context.json({ error: "not found" }, 404)
	})
	.delete("/topics/:id/personal-sources/sources/:sourceId", async (context) => {
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		const deleted = await deletePersonalSource({
			userId,
			topicId: context.req.param("id"),
			sourceId: context.req.param("sourceId"),
		})
		if (deleted) {
			await notifyPersonalSourcesChanged(context.req.param("id"))
		}
		return deleted ? context.json({ ok: true as const }) : context.json({ error: "not found" }, 404)
	})
