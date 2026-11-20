// applies exact structured facts under the Topic lock
import {
	areTopicMemoryDatesCompatible,
	canModelCombineTopicMemories,
	hasExactTopicMemoryKey,
	toMostPreciseTopicMemoryDate,
	toNewestTopicMemoryFindingIds,
} from "@carlnotes/contracts/topicMemoryWork"
import { type DbHandle, type DbTransaction, db } from "@carlnotes/db"
import { scans } from "@carlnotes/db/schema/scans"
import { TOPIC_MEMORY_EMBEDDING_MODEL, topicMemories, topicMemoryDecisions } from "@carlnotes/db/schema/topicMemories"
import { topicMemoryCorrection } from "@carlnotes/db/topicMemories"
import { toTopicMemorySimilarity } from "@carlnotes/db/topicMemoryGroups"
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { applyTopicMemoryJournalUpdate } from "./applyTopicMemoryJournalUpdate"
import { copyTopicMemoryFeedback } from "./topicMemoryCleanup"
import {
	normalizeTopicMemoryValue,
	type TopicMemoryWrite,
	toTopicMemoryPersonMatchKey,
	toTopicMemorySubject,
} from "./topicMemoryOperations"
import type { TopicMemoryReconciliation } from "./topicMemoryReconciliation"

const TOPIC_MEMORY_EXACT_CANDIDATE_LIMIT = 128

export type EmbeddedTopicMemoryWrite = TopicMemoryWrite & {
	embedding: number[]
	findingIds: string[]
	reconciliation?: Exclude<TopicMemoryReconciliation, { operation: "noOp" }>
}
export type TopicMemoryMergedPair = { candidate: string; matched: string; cosine: number | null; source: string }

// one checked claim to write, the Scan it came from, and the Topic it belongs to
export type ApplyTopicMemoryWriteOptions = {
	write: EmbeddedTopicMemoryWrite
	scanId: string
	startedAt: Date
	firstScan?: { id: string; startedAt: Date }
	topicId: string
	now: Date
	// the merged pairs to add to, a reviewed replacement, and the stored row if the claim is one already
	mergedPairs?: TopicMemoryMergedPair[]
	replacement?: TopicMemoryReplacementCandidate
	existingRowId?: string
	// whether the Topic's rejected topic memories already withhold this write, if its caller read that for a whole
	// Scan's writes at once
	isRejected?: boolean
}

/** Combines an exact value and only replaces a claim with a current semantic approval. */
export async function applyTopicMemoryWrite(
	transaction: DbTransaction,
	options: ApplyTopicMemoryWriteOptions,
): Promise<string | undefined> {
	// use the same person identity for rejected wording and the exact subject key
	const { write, topicId } = options
	const personMatchKey = toTopicMemoryPersonMatchKey(write.person)
	const subject = toTopicMemorySubject(write.subject, write.person)
	const value = normalizeTopicMemoryValue(write.value)
	// a rejected topic memory withholds the claim, read here unless the caller read it for all of a Scan's writes
	const isRejected =
		options.isRejected ?? (await loadRejectedTopicMemoryWrites(transaction, topicId, [write])).has(write)
	if (isRejected) {
		return
	}

	// a model-confirmed update goes to the row it names
	if (write.reconciliation?.operation === "update") {
		return applyTopicMemoryJournalUpdate(transaction, options, write.reconciliation)
	}

	// match the value as well as the earliest keys so another value cannot mask an exact match
	const existing = await loadExactTopicMemory(transaction, {
		topicId,
		subject,
		claimType: write.claimType,
		factDate: write.factDate,
		value,
		excludeId: options.existingRowId,
	})
	// an explicit add stays separate when the model saw distinct claims sharing structured fields
	const canCombine =
		write.reconciliation?.operation !== "add" ||
		write.reconciliation.combineWithExactMatch ||
		(existing && normalizeTopicMemoryValue(existing.text) === normalizeTopicMemoryValue(write.text))
	if (existing && canCombine) {
		return combineTopicMemoryEvidence(transaction, options, existing, isNewerTopicMemoryObservation(options, existing))
	}
	// a stored row with no exact match stays as it is
	if (options.existingRowId) {
		return options.existingRowId
	}

	// recheck the exact snapshot the model reviewed after acquiring the Topic lock
	const reviewed = options.replacement
	const current = reviewed ? await loadTopicMemoryReplacementCandidate(options, transaction) : undefined
	const replacement = reviewed && current && isSameReplacementCandidate(reviewed, current) ? current : undefined
	return insertTopicMemoryValue(transaction, options, { subject, value, personMatchKey, replacement })
}

type ExactTopicMemory = NonNullable<Awaited<ReturnType<typeof loadExactTopicMemory>>>
type TopicMemoryReplacementCandidate = Pick<
	ExactTopicMemory,
	"id" | "text" | "factDate" | "value" | "lastSeenScanId" | "lastSeenAt" | "updatedAt" | "embedding" | "embeddingModel"
>
type ReplacementInput = Pick<ApplyTopicMemoryWriteOptions, "write" | "topicId" | "startedAt">

/** Finds the only active predecessor for an edition-specific runtime or air date. */
export async function loadTopicMemoryReplacementCandidate(
	{ write, topicId, startedAt }: ReplacementInput,
	handle: DbHandle = db,
): Promise<TopicMemoryReplacementCandidate | undefined> {
	// only a dated runtime or air date names one edition's single value
	const { claimType, factDate } = write
	if (
		(claimType !== "runtime" && claimType !== "airDate") ||
		!factDate ||
		!hasExactTopicMemoryKey(factDate, claimType)
	) {
		return
	}
	// the stored forms of the claim's subject and value
	const subject = toTopicMemorySubject(write.subject, write.person)
	const value = normalizeTopicMemoryValue(write.value)

	// ambiguous slots stay separate when there is more than one plausible predecessor
	const candidates = await handle
		.select({
			id: topicMemories.id,
			text: topicMemories.text,
			factDate: topicMemories.factDate,
			subject: topicMemories.subject,
			claimType: topicMemories.claimType,
			value: topicMemories.value,
			lastSeenScanId: topicMemories.lastSeenScanId,
			lastSeenAt: scans.startedAt,
			updatedAt: topicMemories.updatedAt,
			embedding: topicMemories.embedding,
			embeddingModel: topicMemories.embeddingModel,
		})
		.from(topicMemories)
		.innerJoin(scans, eq(scans.id, topicMemories.lastSeenScanId))
		.where(
			and(
				eq(topicMemories.topicId, topicId),
				eq(topicMemories.subject, subject),
				eq(topicMemories.claimType, claimType),
				eq(topicMemories.factDate, factDate),
				eq(topicMemories.status, "active"),
				eq(topicMemories.isAtomic, true),
				eq(topicMemories.needsReview, false),
				isNull(topicMemories.replacedById),
			),
		)
		.limit(2)
	// the one predecessor qualifies if its value differs, the two may combine, and this Scan is the newer one
	const [candidate] = candidates
	const isPredecessor =
		candidates.length === 1 &&
		candidate &&
		candidate.value !== value &&
		canModelCombineTopicMemories(candidate, { subject, claimType, value }) &&
		startedAt > candidate.lastSeenAt
	// any other claim is added beside the stored rows
	return isPredecessor ? candidate : undefined
}

function isNewerTopicMemoryObservation(
	{ scanId, startedAt }: Pick<ApplyTopicMemoryWriteOptions, "scanId" | "startedAt">,
	{ lastSeenAt, lastSeenScanId }: Pick<ExactTopicMemory, "lastSeenAt" | "lastSeenScanId">,
): boolean {
	return startedAt > lastSeenAt || (startedAt.getTime() === lastSeenAt.getTime() && scanId > lastSeenScanId)
}

function isSameReplacementCandidate(
	previous: TopicMemoryReplacementCandidate,
	current: TopicMemoryReplacementCandidate,
): boolean {
	return (
		previous.id === current.id &&
		previous.text === current.text &&
		previous.factDate === current.factDate &&
		// neither its value nor its evidence moved since the review
		previous.value === current.value &&
		previous.lastSeenScanId === current.lastSeenScanId &&
		previous.updatedAt.getTime() === current.updatedAt.getTime()
	)
}

async function combineTopicMemoryEvidence(
	transaction: DbTransaction,
	options: ApplyTopicMemoryWriteOptions,
	existing: ExactTopicMemory,
	isNewer: boolean,
): Promise<string> {
	const { write, scanId, startedAt, firstScan = { id: scanId, startedAt }, now } = options
	// keep both original statements and union their evidence on the survivor, which keeps its newest Finding ids
	const findingIds = toNewestTopicMemoryFindingIds(existing.findingIds, write.findingIds)
	const factDate = toMostPreciseTopicMemoryDate(existing.factDate, write.factDate)
	const hasNewEvidence = write.findingIds.some((findingId) => !existing.findingIds.includes(findingId))
	// a statement is archived only if its wording or its date is new: the survivor's own wording with more evidence
	// is not, and neither is a wording that this Scan already archived
	const isSameStatement = write.text === existing.text && factDate === existing.factDate
	const revisited =
		isSameStatement ||
		(!hasNewEvidence &&
			factDate === existing.factDate &&
			(await hasArchivedObservation(transaction, options, existing.id)))
	// save the actual incoming claim with its own evidence before promoting its contents to the survivor
	if (options.existingRowId) {
		await transaction
			.update(topicMemories)
			.set({ status: "outdated", replacedById: existing.id, updatedAt: now })
			.where(eq(topicMemories.id, options.existingRowId))
		await copyTopicMemoryFeedback(transaction, { targetId: existing.id, sourceIds: [options.existingRowId] })
		await saveExactDecision(transaction, options, existing, existing.id, "merge", options.existingRowId)
	} else if (!revisited) {
		// a new statement of the fact is kept as an outdated row under the survivor
		const archived = await insertTopicMemoryValue(transaction, options, {
			subject: toTopicMemorySubject(write.subject, write.person),
			value: normalizeTopicMemoryValue(write.value),
			personMatchKey: toTopicMemoryPersonMatchKey(write.person),
			archivedUnderId: existing.id,
		})
		if (!archived) {
			throw new Error("Could not preserve the combined topic memory")
		}
		await saveExactDecision(transaction, options, existing, existing.id, "merge", archived)
	}
	// the survivor takes the union of the evidence, the more precise date, and the wider Scan range
	await transaction
		.update(topicMemories)
		.set({
			factDate,
			status: "active",
			updatedAt: now,
			importance: Math.max(existing.importance, write.importance),
			firstScanId: existing.firstSeenAt > firstScan.startedAt ? firstScan.id : existing.firstScanId,
			lastSeenScanId: isNewer ? scanId : existing.lastSeenScanId,
			findingIds,
		})
		.where(eq(topicMemories.id, existing.id))
	return existing.id
}

async function hasArchivedObservation(
	transaction: DbTransaction,
	{ write, topicId, scanId }: ApplyTopicMemoryWriteOptions,
	survivorId: string,
): Promise<boolean> {
	const [archived] = await transaction
		.select({ id: topicMemories.id })
		.from(topicMemories)
		.where(
			and(
				eq(topicMemories.topicId, topicId),
				eq(topicMemories.lastSeenScanId, scanId),
				eq(topicMemories.replacedById, survivorId),
				eq(topicMemories.text, write.text),
				sql`${topicMemories.factDate} is not distinct from ${write.factDate}`,
			),
		)
		.limit(1)
	return Boolean(archived)
}

async function insertTopicMemoryValue(
	transaction: DbTransaction,
	options: ApplyTopicMemoryWriteOptions,
	{
		subject,
		value,
		personMatchKey,
		replacement,
		archivedUnderId,
	}: {
		subject: string
		value: string
		personMatchKey: string | null
		replacement?: TopicMemoryReplacementCandidate
		archivedUnderId?: string
	},
): Promise<string | undefined> {
	const { write, topicId, scanId, startedAt, firstScan = { id: scanId, startedAt }, now } = options

	// distinct facts start active, including facts discovered in older brews
	const [added] = await transaction
		.insert(topicMemories)
		.values({
			topicId,
			kind: write.kind,
			text: write.text,
			factDate: write.factDate,
			person: write.person,
			personMatchKey,
			subject,
			claimType: write.claimType,
			value,
			isAtomic: true,
			findingIds: write.findingIds,
			importance: write.importance,
			embedding: write.embedding,
			embeddingModel: TOPIC_MEMORY_EMBEDDING_MODEL,
			firstScanId: firstScan.id,
			lastSeenScanId: scanId,
			status: archivedUnderId ? "outdated" : "active",
			replacedById: archivedUnderId,
			updatedAt: now,
		})
		.returning({ id: topicMemories.id })
	if (added && replacement) {
		// ratings stay on the claim the reader saw
		await transaction
			.update(topicMemories)
			.set({ status: "outdated", replacedById: added.id, updatedAt: now })
			.where(eq(topicMemories.id, replacement.id))
		await saveExactDecision(transaction, options, replacement, added.id, "replace")
	}
	return added?.id
}

// find only an exact, current fact or an evicted fact without a replacement
async function loadExactTopicMemory(
	transaction: DbTransaction,
	{
		topicId,
		subject,
		claimType,
		factDate,
		value,
		excludeId,
	}: {
		topicId: string
		subject: string
		claimType: EmbeddedTopicMemoryWrite["claimType"]
		factDate: string | null
		value: string
		excludeId?: string
	},
) {
	const firstScans = transaction.select({ id: scans.id, startedAt: scans.startedAt }).from(scans).as("first_brew")
	const candidates = await transaction
		.select({
			id: topicMemories.id,
			status: topicMemories.status,
			text: topicMemories.text,
			value: topicMemories.value,
			factDate: topicMemories.factDate,
			updatedAt: topicMemories.updatedAt,
			importance: topicMemories.importance,
			findingIds: topicMemories.findingIds,
			firstScanId: topicMemories.firstScanId,
			firstSeenAt: firstScans.startedAt,
			lastSeenScanId: topicMemories.lastSeenScanId,
			lastSeenAt: scans.startedAt,
			hasCorrection: sql<boolean>`${topicMemoryCorrection} is not null`,
			embedding: topicMemories.embedding,
			embeddingModel: topicMemories.embeddingModel,
		})
		.from(topicMemories)
		.innerJoin(firstScans, eq(firstScans.id, topicMemories.firstScanId))
		.innerJoin(scans, eq(scans.id, topicMemories.lastSeenScanId))
		.where(
			and(
				eq(topicMemories.topicId, topicId),
				eq(topicMemories.subject, subject),
				eq(topicMemories.claimType, claimType),
				factDate
					? sql`(${topicMemories.factDate} is null or ${topicMemories.factDate} = ${factDate}
						or ${topicMemories.factDate} like ${`${factDate}-%`}
						or ${factDate} like ${topicMemories.factDate} || '-%')`
					: undefined,
				eq(topicMemories.value, value),
				excludeId ? sql`${topicMemories.id} <> ${excludeId}` : undefined,
				eq(topicMemories.isAtomic, true),
				eq(topicMemories.needsReview, false),
				inArray(topicMemories.status, ["active", "outdated"]),
				isNull(topicMemories.replacedById),
			),
		)
		.orderBy(
			sql`${topicMemories.status} = 'active' desc`,
			desc(scans.startedAt),
			desc(topicMemories.lastSeenScanId),
			topicMemories.id,
		)
		.limit(TOPIC_MEMORY_EXACT_CANDIDATE_LIMIT + 1)
	// a large candidate set may hide a conflict beyond the rows we can safely read
	if (candidates.length > TOPIC_MEMORY_EXACT_CANDIDATE_LIMIT) {
		return undefined
	}
	// a coarse or undated observation must never bridge conflicting dated occurrences
	const mostPrecise = candidates.reduce(
		(date, candidate) => toMostPreciseTopicMemoryDate(date, candidate.factDate),
		factDate,
	)
	const first = candidates[0]
	return first &&
		(!excludeId || first.status === "active") &&
		candidates.every(({ factDate }) => areTopicMemoryDatesCompatible(mostPrecise, factDate))
		? first
		: undefined
}

// retain both immutable texts for the blinded evaluation
async function saveExactDecision(
	transaction: DbTransaction,
	{ write, scanId, mergedPairs }: ApplyTopicMemoryWriteOptions,
	match: TopicMemoryReplacementCandidate,
	memoryId: string,
	kind: "merge" | "replace",
	archivedId?: string,
): Promise<void> {
	const cosine =
		match.embeddingModel === TOPIC_MEMORY_EMBEDDING_MODEL
			? toTopicMemorySimilarity(write.embedding, match.embedding)
			: null
	await transaction.insert(topicMemoryDecisions).values({
		scanId,
		memoryId,
		matchMemoryId: archivedId ?? match.id,
		kind,
		source: kind === "replace" ? "model" : "exact",
		cosine,
		candidateText: write.text,
		matchText: match.text,
	})
	if (kind === "merge") {
		mergedPairs?.push({ candidate: write.text, matched: match.text, cosine, source: "exact" })
	}
}

/**
 * Returns the writes that a rejected topic memory of the Topic withholds: one with the same wording for the same
 * person, ignoring case and whitespace. One read covers every write of a Scan.
 */
export async function loadRejectedTopicMemoryWrites(
	transaction: DbTransaction,
	topicId: string,
	writes: EmbeddedTopicMemoryWrite[],
): Promise<Set<EmbeddedTopicMemoryWrite>> {
	if (writes.length === 0) {
		return new Set()
	}
	// each write's place in the list, its wording, and its person, as one json value
	const claims = JSON.stringify(
		writes.map(({ text, person }, index) => ({ index, text, personMatchKey: toTopicMemoryPersonMatchKey(person) })),
	)
	// a rejected row withholds a claim with its wording for the same person. both sides are normalized in sql
	const hasSameWording = sql`${topicMemories.personMatchKey} is not distinct from claim."personMatchKey"
		and lower(regexp_replace(trim(${topicMemories.text}), '[[:space:]]+', ' ', 'g')) =
			lower(regexp_replace(trim(claim.text), '[[:space:]]+', ' ', 'g'))`
	// one statement compares every write with the Topic's rejected rows
	const { rows } = await transaction.execute<{ index: number }>(sql`
		select distinct claim.index
		from jsonb_to_recordset(${claims}::jsonb) as claim(index int, text text, "personMatchKey" text)
		inner join ${topicMemories} on ${topicMemories.topicId} = ${topicId}
			and ${topicMemories.status} = 'rejected' and ${hasSameWording}
	`)
	return new Set(rows.flatMap(({ index }) => writes[index] ?? []))
}
