// the Journal reads and its owner and team lead feedback write

import {
	type TopicMemoriesPage,
	topicMemoriesQuery,
	topicMemoryFeedbackPayload,
} from "@carlnotes/contracts/topicMemories"
import { db } from "@carlnotes/db"
import { canRateTopicMemories } from "@carlnotes/db/findingPermissions"
import { topics } from "@carlnotes/db/schema/topics"
import { loadMemberTopicMemoriesPage, loadTopicMemoriesPage } from "@carlnotes/db/topicMemories"
import { saveTopicMemoryFeedback } from "@carlnotes/db/topicMemoryFeedback"
import { gatedTopicColumns, toTopicRole } from "@carlnotes/db/topicPermissions"
import { zValidator } from "@hono/zod-validator"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { isAllowed } from "../authorization"
import { type AppEnv, currentUser } from "../currentUser"
import { socialReadRateLimiter, toolCallerRateLimiter } from "../rateLimit"

export const topicMemoriesRoute = new Hono<AppEnv>()
	.get("/topics/:id/journal", socialReadRateLimiter, zValidator("query", topicMemoriesQuery), async (context) => {
		// the Journal contains the current user's rating and must never enter a shared cache
		context.header("Cache-Control", "private, no-store")
		const result = await readTopicMemories({
			topicId: context.req.param("id"),
			userId: currentUser(context),
			page: context.req.valid("query").page,
		})
		return result ? context.json(result) : context.json({ error: "not found" }, 404)
	})
	.put(
		"/topics/:id/journal/:memoryId/feedback",
		toolCallerRateLimiter,
		zValidator("json", topicMemoryFeedbackPayload),
		async (context) => {
			// seeing the Topic does not grant a vote
			const userId = currentUser(context)
			if (!userId) {
				return context.json({ error: "sign in to rate a takeaway" }, 401)
			}
			// keep hidden and missing Topics indistinguishable to the caller
			const { id: topicId, memoryId: topicMemoryId } = context.req.param()
			const topic = await loadReadableTopic(topicId, userId)
			if (!topic) {
				return context.json({ error: "not found" }, 404)
			}
			// the storage write checks that the named topic memory still belongs to the active Journal
			const status = await saveTopicMemoryFeedback({
				topicId,
				topicMemoryId,
				userId,
				feedback: context.req.valid("json"),
			})
			if (status === "forbidden") {
				return context.json({ error: "you can't rate this takeaway" }, 403)
			}
			return status === "missing" ? context.json({ error: "not found" }, 404) : context.json({ status })
		},
	)

/** Applies Topic visibility. MCP also requires membership for private Topics. */
export async function readTopicMemories({
	topicId,
	userId,
	page,
	requiresPrivateMembership = false,
}: {
	topicId: string
	userId: string | null
	page: number
	requiresPrivateMembership?: boolean
}): Promise<TopicMemoriesPage | null> {
	// MCP binds private membership to the page and count read
	if (requiresPrivateMembership) {
		const result = await loadMemberTopicMemoriesPage({ topicId, userId, page })
		if (!result || !(await isAllowed(userId, "topic:view", result.topic))) {
			return null
		}
		return { ...result.page, canRate: false }
	}

	// never load topic memories for a caller outside the Topic's visibility
	const topic = await loadReadableTopic(topicId, userId)
	if (!topic) {
		return null
	}
	const [result, role] = await Promise.all([
		loadTopicMemoriesPage({ topicId, userId, page, visibility: topic.visibility }),
		toTopicRole(userId, topic),
	])
	return { ...result, canRate: canRateTopicMemories(role) }
}

// the app inherits its Topic entitlement
async function loadReadableTopic(
	topicId: string,
	userId: string | null,
): Promise<Pick<typeof topics.$inferSelect, keyof typeof gatedTopicColumns> | null> {
	const [topic] = await db.select(gatedTopicColumns).from(topics).where(eq(topics.id, topicId))
	return topic && (await isAllowed(userId, "topic:view", topic)) ? topic : null
}
