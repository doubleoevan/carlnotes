import type { ConnectedAiAgent } from "@carlnotes/contracts/personalSourcesAccounts"
import { isPersonalSourcesReceivingEnabled } from "@carlnotes/server/personalSourcesSettings"
import { and, eq, sql } from "drizzle-orm"
import { loadConnectedAiAgents, loadLiveAiAgent } from "./aiAgentConnections"
import { db } from "./index"
import { decidePersonalSourcesCapability } from "./personalSourcesAuthority"
import { lockPersonalSourcesSender, lockPersonalSourcesTopic } from "./personalSourcesLocks"
import { sources } from "./schema/topics"
import { users } from "./schema/users"

/**
 * Returns the newest undismissed consent without creating a Source or reading received text.
 */
export async function loadPersonalSourcesConnectionNudge(userId: string): Promise<string | null> {
	// compare live consents with the last explicitly dismissed connection
	const aiAgents = await loadConnectedAiAgents(userId)
	const [user] = await db
		.select({ dismissedAt: users.personalSourcesConnectionDismissedAt })
		.from(users)
		.where(eq(users.id, userId))
	return toPersonalSourcesConnectionNudge({ aiAgents, dismissedAt: user?.dismissedAt?.toISOString() ?? null })
}

/**
 * Chooses a newly connected app's consent timestamp while ignoring disconnected history.
 */
export function toPersonalSourcesConnectionNudge({
	aiAgents,
	dismissedAt,
}: {
	aiAgents: ConnectedAiAgent[]
	dismissedAt: string | null
}): string | null {
	const consentTimes = aiAgents
		.filter((aiAgent) => aiAgent.isConnected && aiAgent.consentCreatedAt)
		.map((aiAgent) => aiAgent.consentCreatedAt as string)
	const latestConsent = consentTimes.sort().at(-1)
	return latestConsent && (!dismissedAt || latestConsent > dismissedAt) ? latestConsent : null
}

/**
 * Dismisses only the presented consent so a later reconnect can show its own nudge.
 */
export async function dismissPersonalSourcesConnectionNudge({
	userId,
	consentCreatedAt,
}: {
	userId: string
	consentCreatedAt: string
}): Promise<void> {
	await db
		.update(users)
		.set({
			personalSourcesConnectionDismissedAt: sql`greatest(${users.personalSourcesConnectionDismissedAt}, least(${new Date(consentCreatedAt)}, clock_timestamp()))`,
		})
		.where(eq(users.id, userId))
}

/**
 * Adds one verified connected AI Agent as a ready, empty Source without importing assistant history.
 */
export async function addPersonalSourcesAiAgent({
	userId,
	topicId,
	clientId,
}: {
	userId: string
	topicId: string
	clientId: string
}): Promise<"added" | "alreadyAdded" | "disconnected" | "unavailable" | "not_found"> {
	// nothing is added while receiving is off
	if (!isPersonalSourcesReceivingEnabled()) {
		return "unavailable"
	}
	return db.transaction(async (transaction) => {
		// share confirmation's lock order and recheck the concrete client's live grant
		await lockPersonalSourcesSender(transaction, userId)
		const aiAgent = await loadLiveAiAgent({ userId, clientId, transaction })
		if (!aiAgent) {
			return "disconnected"
		}
		const topic = await lockPersonalSourcesTopic(transaction, topicId)
		if (
			!topic ||
			!(await decidePersonalSourcesCapability({ userId, capability: "personalSources:send", topic, transaction }))
		) {
			return "not_found"
		}

		// reuse the concrete receiving identity under the Topic lock
		const identity = `oauth:${clientId}`
		const [existingSource] = await transaction
			.select({ id: sources.id })
			.from(sources)
			.where(
				and(
					eq(sources.topicId, topicId),
					eq(sources.personalSourcesUserId, userId),
					eq(sources.personalSourcesIdentity, identity),
				),
			)
		if (existingSource) {
			return "alreadyAdded"
		}
		await transaction.insert(sources).values({
			topicId,
			kind: "ai_agent",
			status: "ready",
			personalSourcesIdentity: identity,
			personalSourcesUserId: userId,
			config: { delivery: "oauth", clientId, appDomain: aiAgent.domain },
		})
		return "added"
	})
}
