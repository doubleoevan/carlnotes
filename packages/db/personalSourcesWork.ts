// durable metadata discovers missed notifications without decrypting it
import { type PersonalSourcesWork, personalSourcesWorkDelay } from "@carlnotes/contracts/personalSourcesWork"
import { and, eq, isNotNull, sql } from "drizzle-orm"
import { db } from "./index"
import { topicPersonalSourceContexts } from "./schema/personalSources"
import { topics } from "./schema/topics"
import { users } from "./schema/users"
import { toEditableTopicFilter } from "./topicPermissions"

/**
 * Reads the identifiers and deadlines a workflow needs without returning any private text.
 */
export async function loadPersonalSourcesWork(topicId: string): Promise<PersonalSourcesWork | null> {
	const contexts = await db
		.select({
			state: topicPersonalSourceContexts.state,
			hasKey: sql<boolean>`${users.litellmVirtualKey} is not null`,
			revision: topicPersonalSourceContexts.revision,
			processedRevision: topicPersonalSourceContexts.processedRevision,
			dirtySince: topicPersonalSourceContexts.dirtySince,
			changedAt: topicPersonalSourceContexts.updatedAt,
			now: sql<string>`clock_timestamp()::text`,
		})
		.from(topicPersonalSourceContexts)
		.innerJoin(topics, eq(topics.id, topicPersonalSourceContexts.topicId))
		.innerJoin(users, eq(users.id, topics.ownerId))
		.where(
			and(eq(topicPersonalSourceContexts.topicId, topicId), toEditableTopicFilter(topicPersonalSourceContexts.userId)),
		)
	if (contexts.length === 0) {
		return null
	}
	// choose the next sender deadline independently so one failed key cannot delay another sender
	const workItems = contexts.map((context) => {
		const work: PersonalSourcesWork = {
			revision: context.revision,
			processedRevision: context.processedRevision,
			dirtySince: context.dirtySince?.getTime() ?? null,
			changedAt: context.changedAt.getTime(),
			now: new Date(context.now).getTime(),
		}
		const isRetry = ["failed", "budget"].includes(context.state) || (context.state === "missing_key" && !context.hasKey)
		return { ...work, retryAt: isRetry ? work.changedAt + 15 * 60_000 : undefined }
	})
	workItems.sort(
		(first, second) => (personalSourcesWorkDelay(first) ?? Infinity) - (personalSourcesWorkDelay(second) ?? Infinity),
	)
	return workItems[0] ?? null
}

/**
 * Finds one bounded batch of unfinished personal sources contexts for sweep recovery.
 */
export async function loadPendingPersonalSourcesTopicIds(): Promise<string[]> {
	const rows = await db
		.select({ topicId: topicPersonalSourceContexts.topicId })
		.from(topicPersonalSourceContexts)
		.innerJoin(topics, eq(topics.id, topicPersonalSourceContexts.topicId))
		.where(
			and(toEditableTopicFilter(topicPersonalSourceContexts.userId), isNotNull(topicPersonalSourceContexts.dirtySince)),
		)
		.orderBy(topicPersonalSourceContexts.updatedAt, topicPersonalSourceContexts.topicId)
		.limit(100)
	return [...new Set(rows.map((row) => row.topicId))]
}
