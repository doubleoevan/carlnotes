// combines confirmed Topic Memories and retires unprotected facts by Scan recency
import { TOPIC_MEMORY_ACTIVE_LIMIT } from "@carlnotes/contracts/topicMemories"
import type { DbTransaction } from "@carlnotes/db"
import { scans } from "@carlnotes/db/schema/scans"
import { topicMemories, topicMemoryDecisions, topicMemoryFeedback } from "@carlnotes/db/schema/topicMemories"
import { topicMemoryCorrection, topicMemoryIsSaved } from "@carlnotes/db/topicMemories"
import { and, count, eq, inArray, sql } from "drizzle-orm"
import type { TopicMemoryMergedPair } from "./applyTopicMemoryWrite"
import { loadTopicMemoryCleanupRows, type TopicMemoryCleanupReview, toReviewPairs } from "./topicMemoryCleanupPairs"
import { toTopicMemorySimilarity } from "./topicMemoryOperations"
import { toEvictedTopicMemoryIds, toTopicMemoryCleanupGroups } from "./topicMemoryRetention"

const MAX_CLEANUP_CANDIDATES = 2 * TOPIC_MEMORY_ACTIVE_LIMIT

/** Cleans up every fifth successful Scan, then ages out the bottom unprotected active takeaways. */
export async function applyTopicMemoryRetention(
	transaction: DbTransaction,
	{
		topicId,
		scanId,
		now,
		shouldCleanUp,
		mergedPairs,
		reviews = [],
	}: {
		topicId: string
		scanId: string
		now: Date
		shouldCleanUp: boolean
		mergedPairs?: TopicMemoryMergedPair[]
		reviews?: TopicMemoryCleanupReview[]
	},
): Promise<void> {
	// cleanup may change the surviving rating, so load the eviction candidates afterward
	if (shouldCleanUp) {
		await mergeTopicMemoryDuplicates(transaction, { topicId, scanId, now, mergedPairs, reviews })
	}

	// most Scans are below the cap and do not need a read of their Scan history
	const active = and(
		eq(topicMemories.topicId, topicId),
		eq(topicMemories.status, "active"),
		eq(topicMemories.isAtomic, true),
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
		.as("successful_brews")
	const rows = await transaction
		.select({
			id: topicMemories.id,
			importance: topicMemories.importance,
			isSavedTakeaway: topicMemoryIsSaved,
			hasCorrection: sql<boolean>`${topicMemoryCorrection} is not null`,
			scansSinceLastSeen: successfulScans.scansSinceLastSeen,
		})
		.from(topicMemories)
		.innerJoin(successfulScans, eq(successfulScans.id, topicMemories.lastSeenScanId))
		.where(active)

	// evict the weakest unprotected takeaways in one write
	const evictedIds = toEvictedTopicMemoryIds(rows)
	if (evictedIds.length > 0) {
		await transaction
			.update(topicMemories)
			.set({ status: "outdated", replacedById: null, updatedAt: now })
			.where(inArray(topicMemories.id, evictedIds))
	}
}

// find flagged duplicates and high-similarity clusters within the bounded active set
async function mergeTopicMemoryDuplicates(
	transaction: DbTransaction,
	{
		topicId,
		scanId,
		now,
		mergedPairs,
		reviews,
	}: {
		topicId: string
		scanId: string
		now: Date
		mergedPairs?: TopicMemoryMergedPair[]
		reviews: TopicMemoryCleanupReview[]
	},
): Promise<void> {
	// a correction, replacement or new Scan after review invalidates that verdict
	const rows = await loadTopicMemoryCleanupRows(transaction, topicId)
	const pending = toReviewPairs(rows)
	const byId = new Map(pending.map((pair) => [pair.id, pair]))
	const confirmed = new Set<string>()
	const confirmedMemoryIds = new Set<string>()
	for (const { id, revision, verdict } of reviews) {
		const current = byId.get(id)
		if (!current || current.revision !== revision) {
			continue
		}
		if (verdict === "duplicate") {
			confirmed.add(id)
			confirmedMemoryIds.add(current.flagged.id)
			confirmedMemoryIds.add(current.match.id)
		} else if (verdict === "distinct") {
			await transaction
				.update(topicMemories)
				.set({ needsReview: false, reviewMatchId: null })
				.where(eq(topicMemories.id, current.flagged.id))
		} else {
			// rotate uncertain pairs behind older pending reviews
			await transaction.update(topicMemories).set({ updatedAt: now }).where(eq(topicMemories.id, current.flagged.id))
		}
	}
	// keep confirmed pairs eligible and bound pairwise work when protected memories exceed the eviction target
	const candidates = rows
		.sort(
			(left, right) =>
				Number(confirmedMemoryIds.has(right.id)) - Number(confirmedMemoryIds.has(left.id)) ||
				right.lastSeenAt.getTime() - left.lastSeenAt.getTime() ||
				left.id.localeCompare(right.id),
		)
		.slice(0, MAX_CLEANUP_CANDIDATES)
	for (const [survivor, ...duplicates] of toTopicMemoryCleanupGroups(candidates, confirmed)) {
		if (!survivor?.isActive || duplicates.length === 0) {
			continue
		}

		// retire the duplicates and preserve all earlier replacement links
		const duplicateIds = duplicates.map(({ id }) => id)
		await transaction.insert(topicMemoryDecisions).values(
			duplicates.map((candidate) => {
				const cosine = toTopicMemorySimilarity(candidate.embedding, survivor.embedding)
				mergedPairs?.push({ candidate: candidate.text, matched: survivor.text, cosine, source: "cleanup" })
				return {
					scanId,
					memoryId: survivor.id,
					candidateMemoryId: candidate.id,
					matchMemoryId: survivor.id,
					kind: "merge" as const,
					source: "cleanup" as const,
					cosine,
				}
			}),
		)
		await transaction
			.update(topicMemories)
			.set({ status: "outdated", replacedById: survivor.id, needsReview: false, reviewMatchId: null, updatedAt: now })
			.where(inArray(topicMemories.id, duplicateIds))
		// old references must resolve to the new survivor in one hop
		await transaction
			.update(topicMemories)
			.set({ replacedById: survivor.id, updatedAt: now })
			.where(inArray(topicMemories.replacedById, duplicateIds))
		// pending reviews follow the survivor when their original match retires
		await transaction
			.update(topicMemories)
			.set({ reviewMatchId: survivor.id })
			.where(inArray(topicMemories.reviewMatchId, duplicateIds))
		await copyTopicMemoryFeedback(transaction, survivor.id, duplicateIds)

		// keep the union of evidence and the earliest and latest Scans across the cluster
		const group = [survivor, ...duplicates]
		const first = group.reduce((left, right) => (left.firstSeenAt <= right.firstSeenAt ? left : right))
		const last = group.reduce((left, right) => (left.lastSeenAt >= right.lastSeenAt ? left : right))
		await transaction
			.update(topicMemories)
			.set({
				factDate: survivor.factDate ?? group.find(({ factDate }) => factDate !== null)?.factDate,
				firstScanId: first.firstScanId,
				lastSeenScanId: last.lastSeenScanId,
				updatedAt: now,
				needsReview: false,
				reviewMatchId: null,
				importance: Math.max(...group.map(({ importance }) => importance)),
				findingIds: [...new Set(group.flatMap(({ findingIds }) => findingIds))],
			})
			.where(eq(topicMemories.id, survivor.id))
	}
}

// history retains each original vote. the survivor uses the latest vote per user
async function copyTopicMemoryFeedback(
	transaction: DbTransaction,
	survivorId: string,
	duplicateIds: string[],
): Promise<void> {
	await transaction.execute(sql`
		insert into ${topicMemoryFeedback} (topic_memory_id, user_id, rating, note, created_at, updated_at)
		select distinct on (user_id) ${survivorId}, user_id, rating, note, created_at, updated_at
		from ${topicMemoryFeedback} where ${inArray(topicMemoryFeedback.topicMemoryId, duplicateIds)}
		order by user_id, updated_at desc, topic_memory_id

		on conflict (topic_memory_id, user_id) do update
		set rating = excluded.rating, note = excluded.note, updated_at = excluded.updated_at
		where excluded.updated_at > ${topicMemoryFeedback.updatedAt}
	`)
}
