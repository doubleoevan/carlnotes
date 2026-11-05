// receiving Source metadata comes from live entries and authenticated connection state
import {
	aiAgentSourceConfig,
	PERSONAL_SOURCES_IMPORT_LABELS,
	type PersonalSource,
	type PersonalSourcesContextResponse,
	type TopicPersonalSources,
} from "@carlnotes/contracts/personalSources"
import { isPersonalSourcesReceivingEnabled } from "@carlnotes/server/personalSourcesSettings"
import { and, count, countDistinct, eq, isNull, ne, sql } from "drizzle-orm"
import { listAiAgentApiKeys } from "./aiAgentApiKeys"
import { loadConnectedAiAgents } from "./aiAgentConnections"
import { isAllowed } from "./authorization"
import { db } from "./index"
import { loadPersonalSourcesReviewContext } from "./personalSourcesContext"
import { personalSourceEntries, personalSourcesLinks, topicPersonalSourceContexts } from "./schema/personalSources"
import { sources, topics } from "./schema/topics"

/**
 * Returns the exact current scoring summary only after the sender authority check.
 */
export async function loadSenderPersonalSourcesContext({
	userId,
	topicId,
}: {
	userId: string
	topicId: string
}): Promise<PersonalSourcesContextResponse | null> {
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId)).limit(1)
	if (!topic || !(await isAllowed(userId, "personalSources:read", topic))) {
		return null
	}
	const context = await loadPersonalSourcesReviewContext({ topicId, userId })
	return {
		text: context?.text ?? null,
		expiresAt: null,
		includedEntryCount: context?.includedEntryCount ?? 0,
		hasIncompleteCoverage: context?.hasIncompleteCoverage ?? false,
	}
}

/**
 * Loads additive personal sources state without exposing receiving kinds in legacy Topic responses.
 */
export async function loadTopicPersonalSources({
	userId,
	topicId,
}: {
	userId: string
	topicId: string
}): Promise<TopicPersonalSources | null> {
	// check sender access before reading private metadata
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId)).limit(1)
	if (!topic || !(await isAllowed(userId, "personalSources:read", topic))) {
		return null
	}
	const sourceRows = await db
		.select()
		.from(sources)
		.where(
			and(
				eq(sources.topicId, topicId),
				eq(sources.personalSourcesUserId, userId),
				sql`${sources.personalSourcesIdentity} is not null`,
			),
		)
	const [sourceCount] = await db
		.select({ count: count() })
		.from(sources)
		.where(and(eq(sources.topicId, topicId), isNull(sources.personalSourcesIdentity)))
	const [context] = await db
		.select({
			state: topicPersonalSourceContexts.state,
			activatedAt: topicPersonalSourceContexts.activatedAt,
			hasIncompleteCoverage: topicPersonalSourceContexts.hasIncompleteCoverage,
		})
		.from(topicPersonalSourceContexts)
		.where(and(eq(topicPersonalSourceContexts.topicId, topicId), eq(topicPersonalSourceContexts.userId, userId)))
	return {
		sourceCount: sourceCount?.count ?? 0,
		canReceive: isPersonalSourcesReceivingEnabled() && (await isAllowed(userId, "personalSources:send", topic)),
		sources: await loadSourceMetadata({ sourceRows, userId, topic }),
		context: {
			status: context?.state ?? "empty",
			hasIncompleteCoverage: context?.hasIncompleteCoverage ?? false,
			activatedAt: context?.activatedAt.toISOString() ?? null,
		},
	}
}

// count retained items and weeks from Monday at 00:00 UTC
async function loadSourceMetadata({
	sourceRows,
	userId,
	topic,
}: {
	sourceRows: (typeof sources.$inferSelect)[]
	userId: string
	topic: typeof topics.$inferSelect
}): Promise<PersonalSource[]> {
	if (sourceRows.length === 0) {
		return []
	}
	// batch the counts and connection metadata without loading encrypted bodies
	const [entryCounts, linkCounts, aiAgents, keys, canReceiveEmail, canUseKey] = await Promise.all([
		db
			.select({
				sourceId: personalSourceEntries.sourceId,
				entryCount: count(),
				weekEntryCount:
					sql<number>`count(*) filter (where ${personalSourceEntries.receivedAt} >= (date_trunc('week', clock_timestamp() at time zone 'UTC') at time zone 'UTC'))`.mapWith(
						Number,
					),
			})
			.from(personalSourceEntries)
			.where(and(eq(personalSourceEntries.topicId, topic.id), eq(personalSourceEntries.userId, userId)))
			.groupBy(personalSourceEntries.sourceId),
		db
			.select({ sourceId: personalSourceEntries.sourceId, count: countDistinct(personalSourcesLinks.fingerprint) })
			.from(personalSourcesLinks)
			.innerJoin(personalSourceEntries, eq(personalSourceEntries.id, personalSourcesLinks.entryId))
			.where(
				and(
					eq(personalSourceEntries.topicId, topic.id),
					eq(personalSourceEntries.userId, userId),

					ne(personalSourcesLinks.state, "considered"),
				),
			)
			.groupBy(personalSourceEntries.sourceId),
		loadConnectedAiAgents(userId),
		listAiAgentApiKeys(userId),
		isAllowed(userId, "personalSources:email", topic),
		isAllowed(userId, "personalSources:apiKey"),
	])
	const countsBySource = new Map(entryCounts.map((row) => [row.sourceId, row]))
	const linksBySource = new Map(linkCounts.map((row) => [row.sourceId, row.count]))
	const aiAgentsByClient = new Map(aiAgents.flatMap((aiAgent) => aiAgent.clientIds.map((id) => [id, aiAgent] as const)))
	const keysById = new Map(keys.map((key) => [key.id, key]))
	return sourceRows.map((source) => {
		// retained validated configuration names disconnected Sources without trusting client-supplied names
		const config = aiAgentSourceConfig.safeParse(source.config)
		let identity = { label: "AI Agent", isConnected: false, groupId: source.id }
		if (source.kind === "email") {
			identity = { label: "Email", isConnected: canReceiveEmail, groupId: source.id }
		} else if (config.success) {
			identity = toSourceIdentity({ config: config.data, sourceId: source.id, aiAgentsByClient, keysById, canUseKey })
		}
		return {
			id: source.id,
			sourceKind: source.kind === "email" ? "email" : "ai_agent",
			...identity,
			entryCount: countsBySource.get(source.id)?.entryCount ?? 0,
			weekEntryCount: countsBySource.get(source.id)?.weekEntryCount ?? 0,
			waitingLinkCount: linksBySource.get(source.id) ?? 0,
		}
	})
}

// known OAuth domains group by verified identity; keys, imports, and local clients retain distinct Sources
function toSourceIdentity({
	config,
	sourceId,
	aiAgentsByClient,
	keysById,
	canUseKey,
}: {
	config: import("@carlnotes/contracts/personalSources").AiAgentSourceConfig
	sourceId: string
	aiAgentsByClient: Map<string, import("@carlnotes/contracts/personalSourcesAccounts").ConnectedAiAgent>
	keysById: Map<string, import("@carlnotes/contracts/personalSourcesAccounts").AiAgentApiKey>
	canUseKey: boolean
}): { label: string; isConnected: boolean; groupId: string } {
	if (config.delivery === "oauth") {
		const aiAgent = aiAgentsByClient.get(config.clientId)
		return {
			label: aiAgent?.label ?? config.appDomain ?? "Local client",
			isConnected: aiAgent?.isConnected ?? false,
			groupId: aiAgent?.id ?? sourceId,
		}
	}
	if (config.delivery === "import") {
		return {
			label: PERSONAL_SOURCES_IMPORT_LABELS[config.provider],
			isConnected: true,
			groupId: sourceId,
		}
	}
	const key = keysById.get(config.apiKeyId)
	return { label: key?.label ?? "API key", isConnected: Boolean(key && !key.revokedAt) && canUseKey, groupId: sourceId }
}
