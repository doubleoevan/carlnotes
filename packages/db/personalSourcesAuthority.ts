// personal topic eligibility and the lasting boundary around private received context
import { PLANS } from "@carlnotes/contracts/plans"
import { and, eq, notInArray, or, type SQL } from "drizzle-orm"
import { type DbHandle, db } from "./index"
import { loadUserAccess } from "./quotas"
import { topicPersonalSourceContexts } from "./schema/personalSources"
import { topics } from "./schema/topics"
import { toTopicAccessFilter, toTopicEditRole } from "./topicPermissions"

// cleanup stays available when paid receiving capabilities are lost
export type PersonalSourcesCapability =
	| "personalSources:read"
	| "personalSources:send"
	| "personalSources:import"
	| "personalSources:delete"
	| "personalSources:email"
	| "personalSources:apiKey"
	| "personalSources:credentials"
type PersonalTopic = Pick<typeof topics.$inferSelect, "id" | "ownerId" | "visibility" | "teamId">

/**
 * Decides personal sources authority before any general administrative override.
 */
export async function decidePersonalSourcesCapability({
	userId,
	capability,
	topic,
	transaction = db,
}: {
	userId: string | null
	capability: PersonalSourcesCapability
	topic?: PersonalTopic
	transaction?: DbHandle
}): Promise<boolean> {
	if (!userId) {
		return false
	}
	if (capability === "personalSources:credentials") {
		return true
	}
	if (topic && (capability === "personalSources:read" || capability === "personalSources:delete")) {
		return canAccessPersonalSourcesHistory({ userId, capability, topic, transaction })
	}
	if (
		capability !== "personalSources:apiKey" &&
		(!topic || !(await isPersonalSourcesTopic({ userId, topic, transaction })))
	) {
		return false
	}
	if (capability !== "personalSources:email" && capability !== "personalSources:apiKey") {
		return true
	}

	// paid receiving checks entitlement after personal authority
	const userAccess = await loadUserAccess(userId, transaction)
	return (
		userAccess.isAdmin ||
		(capability === "personalSources:apiKey"
			? PLANS[userAccess.plan].canUseAiAgentApiKeys
			: PLANS[userAccess.plan].canEmailCarl)
	)
}

// retain sender cleanup and history access after edit authority ends
async function canAccessPersonalSourcesHistory({
	userId,
	capability,
	topic,
	transaction,
}: {
	userId: string
	capability: "personalSources:read" | "personalSources:delete"
	topic: PersonalTopic
	transaction: DbHandle
}): Promise<boolean> {
	if (await isPersonalSourcesTopic({ userId, topic, transaction })) {
		return true
	}
	const [personalSourcesContext] = await transaction
		.select({ topicId: topicPersonalSourceContexts.topicId })
		.from(topicPersonalSourceContexts)
		.innerJoin(topics, eq(topics.id, topicPersonalSourceContexts.topicId))
		.where(
			and(
				eq(topicPersonalSourceContexts.topicId, topic.id),
				eq(topicPersonalSourceContexts.userId, userId),
				capability === "personalSources:read"
					? or(eq(topics.visibility, "public"), toTopicAccessFilter(userId))
					: undefined,
			),
		)
		.limit(1)
	return personalSourcesContext !== undefined
}

/**
 * Checks the same edit authority for every Topic visibility.
 */
export async function isPersonalSourcesTopic({
	userId,
	topic,
	transaction = db,
}: {
	userId: string
	topic: PersonalTopic
	transaction?: DbHandle
}): Promise<boolean> {
	const access = await loadUserAccess(userId, transaction)
	return access.isAdmin || (await toTopicEditRole(userId, topic, transaction)) !== null
}

/**
 * Identifies Topics whose legacy generated text still needs private conversion.
 */
export async function hasUnconvertedPersonalSources(topicId: string, transaction: DbHandle = db): Promise<boolean> {
	const [personalSourcesContext] = await transaction
		.select({ topicId: topicPersonalSourceContexts.topicId })
		.from(topicPersonalSourceContexts)
		.where(
			and(eq(topicPersonalSourceContexts.topicId, topicId), eq(topicPersonalSourceContexts.publicOutputsVersion, 0)),
		)
		.limit(1)
	return personalSourcesContext !== undefined
}

/**
 * Returns the filter that keeps Topics with no legacy generated text that still needs private conversion.
 */
export function toConvertedPersonalSourcesFilter(): SQL {
	const unconvertedTopicIds = db
		.select({ topicId: topicPersonalSourceContexts.topicId })
		.from(topicPersonalSourceContexts)
		.where(eq(topicPersonalSourceContexts.publicOutputsVersion, 0))
	return notInArray(topics.id, unconvertedTopicIds)
}
