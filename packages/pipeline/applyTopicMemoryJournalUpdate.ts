// applies a confirmed update to its original Journal ID and preserves the previous wording
import { areTopicMemoryDatesCompatible, toMostPreciseTopicMemoryDate } from "@carlnotes/contracts/topicMemoryWork"
import type { DbTransaction } from "@carlnotes/db"
import { scans } from "@carlnotes/db/schema/scans"
import { TOPIC_MEMORY_EMBEDDING_MODEL, topicMemories, topicMemoryDecisions } from "@carlnotes/db/schema/topicMemories"
import { toTopicMemorySimilarity } from "@carlnotes/db/topicMemoryGroups"
import { and, eq, inArray } from "drizzle-orm"
import type { ApplyTopicMemoryWriteOptions } from "./applyTopicMemoryWrite"
import { copyTopicMemoryFeedback } from "./topicMemoryCleanup"
import { normalizeTopicMemoryValue, toTopicMemoryPersonMatchKey, toTopicMemorySubject } from "./topicMemoryOperations"
import { haveCompatibleTopicMemoryPeople, type TopicMemoryReconciliation } from "./topicMemoryReconciliation"

type Update = Extract<TopicMemoryReconciliation, { operation: "update" }>
type StoredRow = typeof topicMemories.$inferSelect

/** Revalidates the approved target and optional duplicate source while the caller holds the Topic lock. */
export async function applyTopicMemoryJournalUpdate(
	transaction: DbTransaction,
	options: ApplyTopicMemoryWriteOptions,
	decision: Update,
): Promise<string | undefined> {
	// load only the active rows approved for this Topic and this revision
	const matched = await loadJournalUpdateRows(transaction, options, decision)
	if (!matched) {
		return
	}
	const { target, source } = matched
	const { write, scanId, now } = options

	// retain the approved ID for feedback, new evidence and any improvement in wording
	const findingIds = [...new Set([...target.findingIds, ...write.findingIds])]
	const factDate = toMostPreciseTopicMemoryDate(target.factDate, write.factDate)
	const text = decision.useCandidateText ? write.text : target.text
	const changedClaim = text !== target.text || factDate !== target.factDate
	if (!source && !changedClaim && findingIds.length === target.findingIds.length) {
		return target.id
	}
	if (changedClaim || !source) {
		await archiveTopicMemoryVersion(transaction, target, now)
	}
	if (source) {
		await transaction
			.update(topicMemories)
			.set({ status: "outdated", replacedById: target.id, updatedAt: now })
			.where(eq(topicMemories.id, source.id))
		await copyTopicMemoryFeedback(transaction, { targetId: target.id, sourceIds: [source.id] })
	}

	// keep the earliest and latest evidence times even during historical backfill
	const seen = await transaction
		.select({ id: scans.id, at: scans.startedAt })
		.from(scans)
		.where(inArray(scans.id, [target.firstScanId, target.lastSeenScanId]))
	const first = options.firstScan ?? { id: scanId, startedAt: options.startedAt }
	const oldFirst = seen.find(({ id }) => id === target.firstScanId)
	const oldLast = seen.find(({ id }) => id === target.lastSeenScanId)
	await transaction
		.update(topicMemories)
		.set({
			text,
			factDate,
			findingIds,
			updatedAt: now,
			importance: Math.max(target.importance, write.importance),
			firstScanId: oldFirst && first.startedAt < oldFirst.at ? first.id : target.firstScanId,
			lastSeenScanId: oldLast && options.startedAt >= oldLast.at ? scanId : target.lastSeenScanId,
			...(text !== target.text
				? {
						claimType: write.claimType,
						value: normalizeTopicMemoryValue(write.value),
						subject: toTopicMemorySubject(write.subject, write.person),
						person: write.person,
						personMatchKey: toTopicMemoryPersonMatchKey(write.person),
						embedding: write.embedding,
						embeddingModel: TOPIC_MEMORY_EMBEDDING_MODEL,
					}
				: {}),
		})
		.where(eq(topicMemories.id, target.id))
	const cosine =
		target.embeddingModel === TOPIC_MEMORY_EMBEDDING_MODEL
			? toTopicMemorySimilarity(write.embedding, target.embedding)
			: null
	await transaction.insert(topicMemoryDecisions).values({
		memoryId: target.id,
		scanId,
		candidateMemoryId: source?.id,
		matchMemoryId: target.id,
		kind: "merge",
		source: "model",
		candidateText: write.text,
		matchText: target.text,
		cosine,
	})
	options.mergedPairs?.push({ candidate: write.text, matched: target.text, source: "model", cosine })
	return target.id
}

async function archiveTopicMemoryVersion(transaction: DbTransaction, row: StoredRow, now: Date): Promise<void> {
	// copy the old wording, original evidence, and ratings before changing the stable ID
	const { id, ...previous } = row
	const [archived] = await transaction
		.insert(topicMemories)
		.values({ ...previous, status: "outdated", replacedById: id, updatedAt: now })
		.returning({ id: topicMemories.id })
	if (!archived) {
		throw new Error("Could not preserve the previous topic memory")
	}
	await copyTopicMemoryFeedback(transaction, { targetId: archived.id, sourceIds: [id] })
}

async function loadJournalUpdateRows(
	transaction: DbTransaction,
	options: ApplyTopicMemoryWriteOptions,
	decision: Update,
): Promise<{ target: StoredRow; source?: StoredRow } | undefined> {
	const { topicId, write, existingRowId, now } = options
	if (existingRowId === decision.target.id) {
		return
	}
	const ids = existingRowId ? [existingRowId, decision.target.id] : [decision.target.id]
	const rows = await transaction
		.select()
		.from(topicMemories)
		.where(
			and(
				eq(topicMemories.topicId, topicId),
				eq(topicMemories.status, "active"),
				eq(topicMemories.needsReview, false),
				eq(topicMemories.isAtomic, true),
				inArray(topicMemories.id, ids),
			),
		)
	const target = rows.find(({ id }) => id === decision.target.id)
	const source = rows.find(({ id }) => id === existingRowId)
	if (
		!target ||
		(existingRowId && !source) ||
		(source && source.text !== write.text) ||
		(target.updatedAt.getTime() !== now.getTime() &&
			target.updatedAt.getTime() !== decision.target.updatedAt.getTime()) ||
		!areTopicMemoryDatesCompatible(target.factDate, write.factDate) ||
		!haveCompatibleTopicMemoryPeople(target.person, write.person)
	) {
		return
	}

	return { target, source }
}
