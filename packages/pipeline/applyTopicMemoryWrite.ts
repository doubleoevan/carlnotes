// applies one proposed fact after checking identity and similarity
import { TOPIC_MEMORY_REVIEW_SIMILARITY } from "@carlnotes/contracts/topicMemoryWork"
import type { DbTransaction } from "@carlnotes/db"
import { EMBED_MODEL_NAME, scans } from "@carlnotes/db/schema/scans"
import { topicMemories, topicMemoryDecisions } from "@carlnotes/db/schema/topicMemories"
import { topicMemoryCorrection } from "@carlnotes/db/topicMemories"
import { and, cosineDistance, eq, inArray, isNull, or, sql } from "drizzle-orm"
import {
	type TopicMemoryWrite,
	toTopicMemoryPersonMatchKey,
	toTopicMemorySimilarity,
	toTopicMemorySimilarityAction,
} from "./topicMemoryOperations"

type TopicMemoryRow = typeof topicMemories.$inferSelect
type TopicMemoryMergeTarget = Pick<
	TopicMemoryRow,
	| "id"
	| "text"
	| "kind"
	| "factDate"
	| "personMatchKey"
	| "status"
	| "replacedById"
	| "importance"
	| "findingIds"
	| "firstScanId"
	| "lastSeenScanId"
	| "embedding"
	| "embeddingModel"
> & { firstSeenAt: Date; lastSeenAt: Date; hasCorrection: boolean }
type TopicMemoryMergeMatch = {
	id: string
	matchMemoryId: string
	text: string
	similarity: number | null
	factDate: string | null
}

export type EmbeddedTopicMemoryWrite = TopicMemoryWrite & { embedding: number[]; findingIds: string[] }

export type TopicMemoryMergedPair = { candidate: string; matched: string; cosine: number | null; source: string }

export type ApplyTopicMemoryWriteOptions = {
	write: EmbeddedTopicMemoryWrite
	scanId: string
	startedAt: Date
	topicId: string
	now: Date
	mergedPairs?: TopicMemoryMergedPair[]
}
type TopicMemoryAddOptions = ApplyTopicMemoryWriteOptions & {
	write: Extract<EmbeddedTopicMemoryWrite, { operation: "add" }>
}
type TopicMemoryReviewMatch = { id: string; similarity: number | null }

// validate the nomination and its identity under the lock before persisting the claim
export async function applyTopicMemoryWrite(
	transaction: DbTransaction,
	options: ApplyTopicMemoryWriteOptions,
): Promise<string | undefined> {
	const { write, topicId } = options
	const personMatchKey = toTopicMemoryPersonMatchKey(write.person)
	if (await isRejectedTopicMemoryText(transaction, { topicId, personMatchKey, text: write.text })) {
		return
	}
	if (write.operation === "add") {
		return applyTopicMemoryAdd(transaction, { ...options, write })
	}

	// the first model nominates. namesakes and different event dates stay separate even if it chose to merge
	const target = await loadMergeTarget(transaction, topicId, write.id)
	const compatible =
		target &&
		target.status !== "rejected" &&
		!target.replacedById &&
		target.personMatchKey === personMatchKey &&
		(!target.factDate || !write.factDate || target.factDate === write.factDate)
	const similarity = compatible ? toMergeSimilarity(write.embedding, target) : null
	const action = toTopicMemorySimilarityAction(similarity ?? -1, [write.text, target?.text ?? ""])
	if (target && action === "merge") {
		return mergeTopicMemory(transaction, options, { id: target.id, source: "model", target })
	}

	const draft = { ...write, operation: "add" as const }
	const nominated = target && action === "flag" ? { id: target.id, similarity } : undefined
	return applyTopicMemoryAdd(transaction, { ...options, write: draft }, nominated)
}

async function applyTopicMemoryAdd(
	transaction: DbTransaction,
	options: TopicMemoryAddOptions,
	nominated?: TopicMemoryReviewMatch,
): Promise<string | undefined> {
	// compare only facts about the same person and a compatible event date
	const { write, topicId } = options
	const personMatchKey = toTopicMemoryPersonMatchKey(write.person)
	const nearest = await loadNearestTopicMemory(transaction, {
		topicId,
		personMatchKey,
		factDate: write.factDate,
		embedding: write.embedding,
	})
	const action = toTopicMemorySimilarityAction(nearest?.similarity ?? -1, [write.text, nearest?.text ?? ""])
	if (nearest && action === "merge") {
		return mergeTopicMemory(transaction, options, { id: nearest.id, source: "similarity", match: nearest })
	}

	const review = nominated ?? (action === "flag" ? nearest : undefined)
	return insertTopicMemoryAdd(transaction, {
		...options,
		personMatchKey,
		review,
		reviewSource: nominated ? "model" : "similarity",
	})
}

async function insertTopicMemoryAdd(
	transaction: DbTransaction,
	{
		write,
		topicId,
		scanId,
		now,
		personMatchKey,
		review,
		reviewSource,
	}: TopicMemoryAddOptions & {
		personMatchKey: string | null
		review?: TopicMemoryReviewMatch
		reviewSource: "model" | "similarity"
	},
): Promise<string | undefined> {
	const [added] = await transaction
		.insert(topicMemories)
		.values({
			topicId,
			kind: write.kind,
			text: write.text,
			factDate: write.factDate,
			person: write.person,
			personMatchKey,
			isAtomic: true,
			findingIds: write.findingIds,
			importance: write.importance,
			embedding: write.embedding,
			embeddingModel: EMBED_MODEL_NAME,
			needsReview: Boolean(review),
			reviewMatchId: review?.id ?? null,
			firstScanId: scanId,
			lastSeenScanId: scanId,
			updatedAt: now,
		})
		.returning({ id: topicMemories.id })
	if (added && review) {
		await transaction.insert(topicMemoryDecisions).values({
			scanId,
			memoryId: added.id,
			candidateMemoryId: added.id,
			matchMemoryId: review.id,
			kind: "flag",
			source: reviewSource,
			cosine: review.similarity,
		})
	}
	return added?.id
}

async function isRejectedTopicMemoryText(
	transaction: DbTransaction,
	{ topicId, personMatchKey, text }: { topicId: string; personMatchKey: string | null; text: string },
): Promise<boolean> {
	// compare the rejected statement for the same person, ignoring case and whitespace
	const [rejected] = await transaction
		.select({ id: topicMemories.id })
		.from(topicMemories)
		.where(
			and(
				eq(topicMemories.topicId, topicId),
				eq(topicMemories.status, "rejected"),
				sql`${topicMemories.personMatchKey} is not distinct from ${personMatchKey}`,
				sql`lower(regexp_replace(trim(${topicMemories.text}), '[[:space:]]+', ' ', 'g')) =
			lower(regexp_replace(trim(${text}), '[[:space:]]+', ' ', 'g'))`,
			),
		)
		.limit(1)
	return rejected !== undefined
}

async function loadNearestTopicMemory(
	transaction: DbTransaction,
	{
		topicId,
		personMatchKey,
		factDate,
		embedding,
	}: {
		topicId: string
		personMatchKey: string | null
		factDate: string | null
		embedding: number[]
	},
): Promise<TopicMemoryMergeMatch | undefined> {
	// legacy and replaced text stay in history. an evicted compatible fact can still reactivate
	const distance = cosineDistance(topicMemories.embedding, embedding)
	const [nearest] = await transaction
		.select({
			id: topicMemories.id,
			matchMemoryId: topicMemories.id,
			text: topicMemories.text,
			factDate: topicMemories.factDate,
			similarity: sql<number>`1 - (${distance})`,
		})
		.from(topicMemories)
		.where(
			and(
				eq(topicMemories.topicId, topicId),
				eq(topicMemories.isAtomic, true),
				inArray(topicMemories.status, ["active", "outdated"]),
				isNull(topicMemories.replacedById),
				personMatchKey ? eq(topicMemories.personMatchKey, personMatchKey) : isNull(topicMemories.personMatchKey),
				factDate ? or(isNull(topicMemories.factDate), eq(topicMemories.factDate, factDate)) : undefined,
				eq(topicMemories.embeddingModel, EMBED_MODEL_NAME),
				sql`1 - (${distance}) >= ${TOPIC_MEMORY_REVIEW_SIMILARITY}`,
			),
		)
		.orderBy(distance, topicMemories.id)
		.limit(1)
	return nearest
}

async function mergeTopicMemory(
	transaction: DbTransaction,
	options: ApplyTopicMemoryWriteOptions,
	{
		id,
		source,
		match,
		target,
	}: {
		id: string
		source: "model" | "similarity"
		match?: TopicMemoryMergeMatch
		target?: TopicMemoryMergeTarget
	},
): Promise<string | undefined> {
	// a model only approved the specific neighbor it saw, so skip an obsolete replacement
	const { write, topicId, scanId, startedAt, now } = options
	const memory = target ?? (await loadMergeTarget(transaction, topicId, id))
	if (!memory || memory.replacedById || memory.status === "rejected") {
		return
	}

	// a backfill can add provenance without overwriting the wording or latest brew that newer evidence supplied
	const isNewer = memory.lastSeenAt <= startedAt
	const phrasing =
		isNewer && !memory.hasCorrection
			? { text: write.text, embedding: write.embedding, embeddingModel: EMBED_MODEL_NAME }
			: {}
	await transaction
		.update(topicMemories)
		.set({
			...phrasing,
			status: "active",
			factDate: write.factDate ?? memory.factDate,
			replacedById: null,
			updatedAt: now,
			importance: Math.max(memory.importance, write.importance),
			firstScanId: memory.firstSeenAt > startedAt ? scanId : memory.firstScanId,
			lastSeenScanId: isNewer ? scanId : memory.lastSeenScanId,
			findingIds: [...new Set([...memory.findingIds, ...write.findingIds])],
		})
		.where(eq(topicMemories.id, memory.id))

	// use the vector that participated in the decision before replacing any text or embedding
	const cosine = match ? match.similarity : toMergeSimilarity(write.embedding, memory)
	await transaction.insert(topicMemoryDecisions).values({
		scanId,
		memoryId: memory.id,
		matchMemoryId: match?.matchMemoryId ?? memory.id,
		kind: "merge",
		source,
		cosine,
	})
	options.mergedPairs?.push({ candidate: write.text, matched: match?.text ?? memory.text, cosine, source })
	return memory.id
}

// vectors from different embedding models have no comparable cosine
function toMergeSimilarity(embedding: number[], target: TopicMemoryMergeTarget): number | null {
	return target.embeddingModel === EMBED_MODEL_NAME ? toTopicMemorySimilarity(embedding, target.embedding) : null
}

async function loadMergeTarget(
	transaction: DbTransaction,
	topicId: string,
	id: string,
): Promise<TopicMemoryMergeTarget | undefined> {
	// both brew dates stay available for historical writes
	const firstScans = transaction.select({ id: scans.id, startedAt: scans.startedAt }).from(scans).as("first_brew")
	const [memory] = await transaction
		.select({
			id: topicMemories.id,
			text: topicMemories.text,
			status: topicMemories.status,
			replacedById: topicMemories.replacedById,
			importance: topicMemories.importance,
			findingIds: topicMemories.findingIds,
			firstScanId: topicMemories.firstScanId,
			firstSeenAt: firstScans.startedAt,
			lastSeenScanId: topicMemories.lastSeenScanId,
			lastSeenAt: scans.startedAt,
			hasCorrection: sql<boolean>`${topicMemoryCorrection} is not null`,
			embedding: topicMemories.embedding,
			embeddingModel: topicMemories.embeddingModel,
			kind: topicMemories.kind,
			factDate: topicMemories.factDate,
			personMatchKey: topicMemories.personMatchKey,
		})
		.from(topicMemories)
		.innerJoin(firstScans, eq(firstScans.id, topicMemories.firstScanId))
		.innerJoin(scans, eq(scans.id, topicMemories.lastSeenScanId))
		.where(and(eq(topicMemories.id, id), eq(topicMemories.topicId, topicId), eq(topicMemories.isAtomic, true)))
		.limit(1)
	return memory
}
