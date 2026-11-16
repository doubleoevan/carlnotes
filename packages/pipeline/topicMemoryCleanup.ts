// retires unprotected facts by Scan recency
import { TOPIC_MEMORY_ACTIVE_LIMIT } from "@carlnotes/contracts/topicMemories"
import type { DbTransaction } from "@carlnotes/db"
import { scans } from "@carlnotes/db/schema/scans"
import { topicMemories, topicMemoryFeedback } from "@carlnotes/db/schema/topicMemories"
import { topicMemoryCorrection, topicMemoryIsSaved } from "@carlnotes/db/topicMemories"
import { and, count, eq, inArray, sql } from "drizzle-orm"
import { toEvictedTopicMemoryIds } from "./topicMemoryCleanupRules"

/**
 * Limits ready active topic memories, preserving queued claims, saved topic memories and corrections.
 */
export async function limitActiveTopicMemories(transaction: DbTransaction, topicId: string, now: Date): Promise<void> {
	// most Scans are below the cap and do not need a read of their Scan history
	const active = and(
		eq(topicMemories.topicId, topicId),
		eq(topicMemories.status, "active"),
		eq(topicMemories.isAtomic, true),
		eq(topicMemories.needsReview, false),
	)
	const [total] = await transaction.select({ count: count() }).from(topicMemories).where(active)
	if ((total?.count ?? 0) <= TOPIC_MEMORY_ACTIVE_LIMIT) {
		return
	}

	// rank the successful Scans once, starting at zero for the newest
	const successfulScans = transaction
		.select({
			id: scans.id,
			scansSinceLastSeen:
				sql<number>`(row_number() over (order by ${scans.startedAt} desc, ${scans.id} desc) - 1)::int`.as("age"),
		})
		.from(scans)
		.where(and(eq(scans.topicId, topicId), eq(scans.status, "succeeded")))
		.as("successful_scans")
	const rows = await transaction
		.select({
			id: topicMemories.id,
			importance: topicMemories.importance,
			isSavedTopicMemory: topicMemoryIsSaved,
			hasCorrection: sql<boolean>`${topicMemoryCorrection} is not null`,
			scansSinceLastSeen: successfulScans.scansSinceLastSeen,
		})
		.from(topicMemories)
		.innerJoin(successfulScans, eq(successfulScans.id, topicMemories.lastSeenScanId))
		.where(active)

	// retire the weakest unprotected topic memories in one write
	const evictedIds = toEvictedTopicMemoryIds(rows)
	if (evictedIds.length > 0) {
		await transaction
			.update(topicMemories)
			.set({ status: "outdated", replacedById: null, updatedAt: now })
			.where(inArray(topicMemories.id, evictedIds))
	}
}

export async function copyTopicMemoryFeedback(
	transaction: DbTransaction,
	{ targetId, sourceIds, userIds }: { targetId: string; sourceIds: string[]; userIds?: string[] },
): Promise<void> {
	const source = and(
		inArray(topicMemoryFeedback.topicMemoryId, sourceIds),
		userIds ? inArray(topicMemoryFeedback.userId, userIds) : undefined,
	)
	await transaction.execute(sql`
		insert into ${topicMemoryFeedback} (topic_memory_id, user_id, rating, note, created_at, updated_at)
		select distinct on (user_id) ${targetId}, user_id, rating, note, created_at, updated_at
		from ${topicMemoryFeedback} where ${source}
		order by user_id, updated_at desc, topic_memory_id

		on conflict (topic_memory_id, user_id) do nothing
	`)
}
