// applies a confirmed update to its original Journal ID and preserves the previous wording
import {
	areTopicMemoryDatesCompatible,
	toMostPreciseTopicMemoryDate,
	toNewestTopicMemoryFindingIds,
} from "@carlnotes/contracts/topicMemoryWork"
import type { DbTransaction } from "@carlnotes/db"
import { scans } from "@carlnotes/db/schema/scans"
import {
	TOPIC_MEMORY_EMBEDDING_MODEL,
	topicMemories,
	topicMemoryDecisions,
	topicMemoryFeedback,
} from "@carlnotes/db/schema/topicMemories"
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
	const { write, now } = options

	// keep the earliest and latest evidence times even during historical backfill
	const { firstScanId, lastSeenScanId, isLatestScan } = await toWidenedScanRange(transaction, options, target)

	// retain the approved ID for feedback, new evidence and any improvement in wording. an older Scan's wording
	// never replaces a newer one's, and a rating stays on the wording that its rater saw
	const findingIds = toNewestTopicMemoryFindingIds(target.findingIds, write.findingIds)
	const hasNewEvidence = write.findingIds.some((findingId) => !target.findingIds.includes(findingId))
	const factDate = toMostPreciseTopicMemoryDate(target.factDate, write.factDate)
	const canUseCandidateText =
		decision.useCandidateText && isLatestScan && !(await hasTopicMemoryFeedback(transaction, target.id))
	const text = canUseCandidateText ? write.text : target.text
	const changedClaim = text !== target.text || factDate !== target.factDate
	const isRepeatedClaim = !source && !changedClaim && !hasNewEvidence
	// an update with nothing new and no wider Scan range leaves the row as it is. a changed claim keeps its prior
	// version as an outdated row, and an update that only adds evidence archives nothing
	if (isRepeatedClaim && firstScanId === target.firstScanId && lastSeenScanId === target.lastSeenScanId) {
		return target.id
	}
	if (changedClaim) {
		await archiveTopicMemoryVersion(transaction, target, now)
	}
	// a duplicate that is already stored retires under the row that keeps its ID, with its ratings
	if (source) {
		await transaction
			.update(topicMemories)
			.set({ status: "outdated", replacedById: target.id, updatedAt: now })
			.where(eq(topicMemories.id, source.id))
		await copyTopicMemoryFeedback(transaction, { targetId: target.id, sourceIds: [source.id] })
	}

	// the stable row takes the union of the evidence, and the candidate's fields with its wording
	await transaction
		.update(topicMemories)
		.set({
			text,
			factDate,
			findingIds,
			updatedAt: now,
			importance: Math.max(target.importance, write.importance),
			firstScanId,
			lastSeenScanId,
			...(text === target.text ? {} : toCandidateClaimFields(write)),
		})
		.where(eq(topicMemories.id, target.id))
	// a repeated claim only widens the Scan range, so it saves no merge decision
	if (!isRepeatedClaim) {
		await saveJournalUpdateDecision(transaction, options, { target, source })
	}
	return target.id
}

// the row's Scan range widened to an earlier first Scan and a later last Scan, and whether this Scan is the latest
async function toWidenedScanRange(
	transaction: DbTransaction,
	{ scanId, startedAt, firstScan = { id: scanId, startedAt } }: ApplyTopicMemoryWriteOptions,
	target: StoredRow,
): Promise<{ firstScanId: string; lastSeenScanId: string; isLatestScan: boolean }> {
	// read the start times of the row's first and last Scans
	const seen = await transaction
		.select({ id: scans.id, at: scans.startedAt })
		.from(scans)
		.where(inArray(scans.id, [target.firstScanId, target.lastSeenScanId]))
	const oldFirst = seen.find(({ id }) => id === target.firstScanId)
	const oldLast = seen.find(({ id }) => id === target.lastSeenScanId)

	// an earlier Scan becomes the first, and a Scan no older than the last becomes the last
	const isLatestScan = Boolean(oldLast && startedAt >= oldLast.at)
	return {
		firstScanId: oldFirst && firstScan.startedAt < oldFirst.at ? firstScan.id : target.firstScanId,
		lastSeenScanId: isLatestScan ? scanId : target.lastSeenScanId,
		isLatestScan,
	}
}

// the structured identity and vector that go with a candidate's wording
function toCandidateClaimFields(
	write: ApplyTopicMemoryWriteOptions["write"],
): Pick<
	typeof topicMemories.$inferInsert,
	"claimType" | "value" | "subject" | "person" | "personMatchKey" | "embedding" | "embeddingModel"
> {
	return {
		claimType: write.claimType,
		value: normalizeTopicMemoryValue(write.value),
		subject: toTopicMemorySubject(write.subject, write.person),
		person: write.person,
		personMatchKey: toTopicMemoryPersonMatchKey(write.person),
		embedding: write.embedding,
		embeddingModel: TOPIC_MEMORY_EMBEDDING_MODEL,
	}
}

// retain both texts and their cosine for the blinded evaluation
async function saveJournalUpdateDecision(
	transaction: DbTransaction,
	{ write, scanId, mergedPairs }: ApplyTopicMemoryWriteOptions,
	{ target, source }: { target: StoredRow; source?: StoredRow },
): Promise<void> {
	const cosine =
		target.embeddingModel === TOPIC_MEMORY_EMBEDDING_MODEL
			? toTopicMemorySimilarity(write.embedding, target.embedding)
			: null
	// the decision names the row that kept its ID and the duplicate that it absorbed
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
	mergedPairs?.push({ candidate: write.text, matched: target.text, source: "model", cosine })
}

// any rater's rating counts here, whether or not that rater may still rate
async function hasTopicMemoryFeedback(transaction: DbTransaction, topicMemoryId: string): Promise<boolean> {
	const [rated] = await transaction
		.select({ topicMemoryId: topicMemoryFeedback.topicMemoryId })
		.from(topicMemoryFeedback)
		.where(eq(topicMemoryFeedback.topicMemoryId, topicMemoryId))
		.limit(1)
	return rated !== undefined
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
	// the archived wording keeps the ratings it had
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
	// read the matched row, and the stored duplicate if the candidate is one, among this Topic's ready rows
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
	// a row that changed after the model saw it, or whose date or person conflicts, is left alone
	const target = rows.find(({ id }) => id === decision.target.id)
	const source = rows.find(({ id }) => id === existingRowId)
	if (
		!target ||
		(existingRowId && !source) ||
		(source && source.text !== write.text) ||
		// the row is as the model saw it, unless an earlier write of this transaction changed it
		(target.updatedAt.getTime() !== now.getTime() &&
			target.updatedAt.getTime() !== decision.target.updatedAt.getTime()) ||
		!areTopicMemoryDatesCompatible(target.factDate, write.factDate) ||
		!haveCompatibleTopicMemoryPeople(target.person, write.person)
	) {
		return
	}

	return { target, source }
}
