// checks stored topic memories once and preserves their feedback across a split
import {
	TOPIC_MEMORY_APPROXIMATE_MONTH_PATTERN,
	TOPIC_MEMORY_CALENDAR_DATE_PATTERN,
	TOPIC_MEMORY_INCOMPLETE_CONTEXT_PATTERN,
	TOPIC_MEMORY_JOB_START_PATTERN,
	TOPIC_MEMORY_TEXT_LIMIT,
	TOPIC_MEMORY_UNNAMED_SUBJECT_PATTERN,
	toNamedTopicMemoryText,
	toTopicMemoryFactDate,
} from "@carlnotes/contracts/topicMemories"
import { type DbHandle, type DbTransaction, db } from "@carlnotes/db"
import { hasUnconvertedPersonalSources, toConvertedPersonalSourcesFilter } from "@carlnotes/db/personalSourcesAuthority"
import { lockPersonalSourcesTopic } from "@carlnotes/db/personalSourcesLocks"
import { scans } from "@carlnotes/db/schema/scans"
import { TOPIC_MEMORY_EMBEDDING_MODEL, topicMemories, topicMemoryFeedback } from "@carlnotes/db/schema/topicMemories"
import { topics } from "@carlnotes/db/schema/topics"
import { runWithConcurrency } from "@carlnotes/server/concurrency"
import { and, asc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { applyTopicMemoryWrite } from "./applyTopicMemoryWrite"
import { FEEDBACK_PER_SPLIT, inspectTopicMemoryClaims, splitTopicMemoryClaim } from "./topicMemoryClaimReview"
import { copyTopicMemoryFeedback, limitActiveTopicMemories } from "./topicMemoryCleanup"
import { embedTopicMemoryClaims } from "./topicMemoryEmbeddings"
import { loadTopicMemoryFindingEvidence } from "./topicMemoryEvidence"
import {
	normalizeTopicMemoryValue,
	toTopicMemoryEmbeddingText,
	toTopicMemoryPersonMatchKey,
	toTopicMemorySubject,
} from "./topicMemoryOperations"
import { loadTopicMemorySubjects, type TopicMemorySubject, toCanonicalTopicMemoryPerson } from "./topicMemorySubjects"

const REPAIR_PAGE_SIZE = 30
const REPAIR_CONCURRENCY = 4
const REPAIR_FINDINGS_LIMIT = 12
const REPAIR_CALL_TIMEOUT_MS = 120_000

type RepairCounts = {
	checked: number
	single: number
	split: number
	rewritten: number
	retired: number
	queued: number
	deferred: number
}
type RepairOutcome = Exclude<keyof RepairCounts, "checked">
type RepairInput = { litellmApiKey: string; signal: AbortSignal }
type RepairScope = { topicId: string }
type AuditVerdict = "compound" | "incomplete" | "nonclaim"
type StoredTopicMemory = Omit<typeof topicMemories.$inferSelect, "embedding" | "createdAt"> & {
	firstSeenAt: Date
	lastSeenAt: Date
}
type Feedback = typeof topicMemoryFeedback.$inferSelect
type Claim = Awaited<ReturnType<typeof splitTopicMemoryClaim>>[number]

/**
 * Rechecks live and reusable historical claims. Each completed row is safe to skip on retry.
 */
export async function repairTopicMemoryClaims({
	litellmApiKey,
	signal,
	onPage,
	onlyUnnamed = false,
	compoundIds,
	auditedVerdicts,
	scope,
}: RepairInput & {
	onlyUnnamed?: boolean
	compoundIds?: string[]
	auditedVerdicts?: Record<string, AuditVerdict>
	scope?: RepairScope
	onPage?: (counts: RepairCounts) => void
}): Promise<RepairCounts> {
	// use an audit selection or discover candidates in a stable keyset
	const audited =
		auditedVerdicts ??
		(compoundIds ? Object.fromEntries(compoundIds.map((id) => [id, "compound" as const])) : undefined)
	const selectedIds = audited ? Object.keys(audited) : undefined
	const subjects = scope ? await loadTopicMemorySubjects(scope.topicId) : []
	let afterId: string | undefined
	const counts: RepairCounts = { checked: 0, single: 0, split: 0, rewritten: 0, retired: 0, queued: 0, deferred: 0 }
	while (!signal.aborted) {
		const rows = await loadTopicMemoriesToRepair(afterId, onlyUnnamed, selectedIds, scope)
		if (!rows.length) {
			break
		}
		afterId = rows.at(-1)?.id
		const input = { litellmApiKey, signal: AbortSignal.any([signal, AbortSignal.timeout(REPAIR_CALL_TIMEOUT_MS)]) }
		const verdicts = audited
			? []
			: await inspectTopicMemoryClaims({ ...input, claims: rows, extractFields: true, subjects }).catch(() => {
					signal.throwIfAborted()
					return []
				})
		const outcomes = await runWithConcurrency(rows, REPAIR_CONCURRENCY, async (row, index) => {
			try {
				const verdict = audited?.[row.id]
				const check = verdict ? { index, verdict } : verdicts[index]
				const result = await repairTopicMemory(row, check, input, signal, subjects, scope !== undefined)
				return { result } as const
			} catch (error) {
				return { error } as const
			}
		})

		// wait for the whole page before propagating a provider failure
		for (const outcome of outcomes) {
			if ("error" in outcome) {
				throw outcome.error
			}
			counts.checked += 1
			counts[outcome.result] += 1
		}
		onPage?.(counts)
	}

	signal.throwIfAborted()
	return counts
}

async function loadTopicMemoriesToRepair(
	afterId: string | undefined,
	onlyUnnamed: boolean,
	selectedIds: string[] | undefined,
	scope?: RepairScope,
): Promise<StoredTopicMemory[]> {
	// include all active rows and any unreplaced fact the match path could otherwise reactivate
	const firstScan = alias(scans, "first_scan")
	return db
		.select({
			id: topicMemories.id,
			topicId: topicMemories.topicId,
			text: topicMemories.text,
			subject: topicMemories.subject,
			claimType: topicMemories.claimType,
			value: topicMemories.value,
			factDate: topicMemories.factDate,
			person: topicMemories.person,
			personMatchKey: topicMemories.personMatchKey,
			status: topicMemories.status,
			isAtomic: topicMemories.isAtomic,
			updatedAt: topicMemories.updatedAt,
			firstScanId: topicMemories.firstScanId,
			lastSeenScanId: topicMemories.lastSeenScanId,
			kind: topicMemories.kind,
			importance: topicMemories.importance,
			findingIds: topicMemories.findingIds,
			replacedById: topicMemories.replacedById,
			needsReview: topicMemories.needsReview,
			reviewMatchId: topicMemories.reviewMatchId,
			embeddingModel: topicMemories.embeddingModel,
			firstSeenAt: firstScan.startedAt,
			lastSeenAt: scans.startedAt,
		})
		.from(topicMemories)
		.innerJoin(topics, eq(topicMemories.topicId, topics.id))
		.innerJoin(firstScan, eq(firstScan.id, topicMemories.firstScanId))
		.innerJoin(scans, eq(scans.id, topicMemories.lastSeenScanId))
		.where(
			and(
				toConvertedPersonalSourcesFilter(),
				scope ? and(eq(topicMemories.topicId, scope.topicId), eq(topicMemories.status, "active")) : undefined,
				selectedIds
					? inArray(topicMemories.id, selectedIds)
					: onlyUnnamed
						? hasUnnamedTopicMemorySubject()
						: scope
							? eq(topicMemories.needsReview, true)
							: needsTopicMemoryRepair(),
				isNull(topicMemories.replacedById),
				or(
					eq(topicMemories.status, "active"),
					and(eq(topicMemories.status, "outdated"), eq(topicMemories.isAtomic, true)),
				),
				afterId ? gt(topicMemories.id, afterId) : undefined,
			),
		)
		.orderBy(asc(topicMemories.id))
		.limit(REPAIR_PAGE_SIZE)
}

type ClaimCheck = Awaited<ReturnType<typeof inspectTopicMemoryClaims>>[number]
type PreparedSingle = { kind: "single"; text: string; fields: ClaimCheck["fields"]; embedding?: number[] }
type PreparedSplit = {
	kind: "split"
	claims: Claim[]
	embeddings: number[][]
	feedback: Feedback[]
	minimumClaims: number
}
type PreparedRepair = PreparedSingle | PreparedSplit | { kind: "queued" | "nonclaim" }

async function repairTopicMemory(
	row: StoredTopicMemory,
	check: ClaimCheck | undefined,
	input: RepairInput,
	signal: AbortSignal,
	subjects: TopicMemorySubject[],
	recheckKeys: boolean,
): Promise<RepairOutcome> {
	// finish model calls before taking the same Topic lock as ratings and Scan writes
	const prepared = await prepareTopicMemoryRepair(row, check, input, subjects).catch((): PreparedRepair => {
		signal.throwIfAborted()
		return { kind: "queued" }
	})
	signal.throwIfAborted()
	return db.transaction(async (transaction) => {
		if (
			!(await lockPersonalSourcesTopic(transaction, row.topicId)) ||
			(await hasUnconvertedPersonalSources(row.topicId, transaction)) ||
			!(await isCurrentTopicMemory(transaction, row))
		) {
			return "deferred"
		}
		if (prepared.kind === "single") {
			return storeSingleTopicMemory(transaction, row, prepared, subjects, recheckKeys)
		}
		if (prepared.kind === "nonclaim") {
			if (recheckKeys) {
				return queueTopicMemoryRepair(transaction, row.id)
			}
			await archiveTopicMemoryOriginal(transaction, row.id)
			return "retired"
		}
		if (
			prepared.kind !== "split" ||
			!prepared.claims.length ||
			!(await isSplitReviewCurrent(transaction, row, prepared.claims, prepared.feedback))
		) {
			return queueTopicMemoryRepair(transaction, row.id)
		}
		return storeSplitTopicMemories(transaction, row, prepared)
	})
}

async function prepareTopicMemoryRepair(
	row: StoredTopicMemory,
	check: ClaimCheck | undefined,
	input: RepairInput,
	subjects: TopicMemorySubject[],
): Promise<PreparedRepair> {
	// only an explicit nonclaim verdict may retire an original without a saved rewrite
	if (check?.verdict === "nonclaim") {
		return { kind: "nonclaim" }
	}
	if (!check) {
		return { kind: "queued" }
	}

	// reuse a valid claim-only embedding when the wording stays the same
	const text = toNamedTopicMemoryText(row.text, row.person)
	if (
		(row.isAtomic || row.needsReview) &&
		check?.verdict === "single" &&
		(check.fields || row.subject) &&
		text &&
		text.length <= TOPIC_MEMORY_TEXT_LIMIT &&
		toTopicMemoryEmbeddingText(text)
	) {
		const embedding =
			text !== row.text || row.embeddingModel !== TOPIC_MEMORY_EMBEDDING_MODEL
				? (await embedTopicMemoryClaims([{ text }], input))[0]
				: undefined
		return { kind: "single", text, fields: check.fields, embedding }
	}

	// use linked public Findings to split or name facts whose subject is missing
	if (row.status !== "active") {
		return { kind: "queued" }
	}
	const [evidence, feedback] = await Promise.all([
		loadTopicMemoryFindingEvidence(row.topicId, row.findingIds.slice(-REPAIR_FINDINGS_LIMIT), db, row.text),
		loadFeedback(row.id),
	])
	const proposed = await splitTopicMemoryClaim({
		...input,
		claim: row,
		findings: [...evidence].map(([id, source]) => ({ id, ...source })),
		feedback: feedback.slice(0, FEEDBACK_PER_SPLIT),
		subjects,
		requireCompleteRewrite: true,
	})
	// require changed wording when the audit found a compound or incomplete claim
	const original = normalizeTopicMemoryValue(row.text)
	const claims =
		check?.verdict === "compound" || check?.verdict === "incomplete"
			? proposed.filter(({ text }) => normalizeTopicMemoryValue(text) !== original)
			: proposed
	const minimumClaims = check.verdict === "compound" ? 2 : 1
	if (claims.length < minimumClaims) {
		return { kind: "queued" }
	}
	const embeddings = await embedTopicMemoryClaims(claims, input)
	if (embeddings.length !== claims.length) {
		throw new Error("A repaired topic memory is missing its embedding")
	}
	return {
		kind: "split",
		claims: claims.map((claim) => ({ ...claim, person: toCanonicalTopicMemoryPerson(claim.person, subjects) })),
		embeddings,
		feedback,
		minimumClaims,
	}
}

async function storeSingleTopicMemory(
	transaction: DbTransaction,
	row: StoredTopicMemory,
	{ text, fields, embedding }: PreparedSingle,
	subjects: TopicMemorySubject[],
	recheckKeys: boolean,
): Promise<RepairOutcome> {
	// give a historical claim a match key only while it still has eligible public evidence
	const eligible = await loadTopicMemoryFindingEvidence(
		row.topicId,
		row.findingIds.slice(-REPAIR_FINDINGS_LIMIT),
		transaction,
	)
	if (!eligible.size) {
		return queueTopicMemoryRepair(transaction, row.id)
	}
	const person = toCanonicalTopicMemoryPerson(row.person, subjects)
	const subject = fields && (recheckKeys || !row.subject) ? toTopicMemorySubject(fields.subject, person) : row.subject
	const value = recheckKeys ? (fields?.value ?? row.value) : (row.value ?? fields?.value)
	const claimType = recheckKeys ? (fields?.claimType ?? row.claimType) : (row.claimType ?? fields?.claimType)
	const [saved] = await transaction
		.update(topicMemories)
		.set({
			text,
			factDate: toTopicMemoryFactDate(text, row.factDate),
			subject,
			person,
			personMatchKey: toTopicMemoryPersonMatchKey(person),
			claimType,
			value: value ? normalizeTopicMemoryValue(value) : value,
			embedding,
			embeddingModel: TOPIC_MEMORY_EMBEDDING_MODEL,
			isAtomic: true,
			needsReview: false,
			reviewMatchId: null,
			updatedAt: new Date(),
		})
		.where(eq(topicMemories.id, row.id))
		.returning({ embedding: topicMemories.embedding, factDate: topicMemories.factDate })
	if (recheckKeys && fields && claimType && value && saved) {
		// republish the checked claim through the exact matcher without inserting a second original
		await applyTopicMemoryWrite(transaction, {
			topicId: row.topicId,
			scanId: row.lastSeenScanId,
			startedAt: row.lastSeenAt,
			firstScan: { id: row.firstScanId, startedAt: row.firstSeenAt },
			now: new Date(),
			existingRowId: row.id,
			write: {
				operation: "add",
				text,
				factDate: saved.factDate,
				person,
				subject: fields.subject,
				claimType,
				value,
				kind: row.kind,
				importance: row.importance,
				findingIds: [...eligible.keys()],
				embedding: saved.embedding,
			},
		})
	}
	return "single"
}

// select old claim formats and pronoun-only statements awaiting source-grounded correction
function needsTopicMemoryRepair() {
	return or(
		eq(topicMemories.needsReview, true),
		isNull(topicMemories.subject),
		ne(topicMemories.embeddingModel, TOPIC_MEMORY_EMBEDDING_MODEL),
		hasUnnamedTopicMemorySubject(),
	)
}

function hasUnnamedTopicMemorySubject() {
	const name = sql`${topicMemories.person}->>'name'`
	const surname = sql`regexp_replace(${name}, '^.*[[:space:]]+', '')`
	return or(
		sql`${name} like '% %' and lower(split_part(${topicMemories.text}, ' ', 1)) = lower(${surname})`,
		sql`${topicMemories.text} ~* ${TOPIC_MEMORY_UNNAMED_SUBJECT_PATTERN}`,
		sql`${topicMemories.text} ~* ${TOPIC_MEMORY_INCOMPLETE_CONTEXT_PATTERN}`,
		and(
			sql`${topicMemories.text} ~* ${TOPIC_MEMORY_JOB_START_PATTERN}`,
			or(
				sql`${topicMemories.text} !~ ${TOPIC_MEMORY_CALENDAR_DATE_PATTERN}`,
				and(
					or(isNull(topicMemories.factDate), sql`char_length(${topicMemories.factDate}) = 10`),
					sql`${topicMemories.text} ~* ${TOPIC_MEMORY_APPROXIMATE_MONTH_PATTERN}`,
				),
			),
		),
	)
}

// use the same committed row whose text and sources were sent for review
async function isCurrentTopicMemory(transaction: DbTransaction, row: StoredTopicMemory): Promise<boolean> {
	const [current] = await transaction
		.select({
			updatedAt: topicMemories.updatedAt,
			text: topicMemories.text,
			factDate: topicMemories.factDate,
			findingIds: topicMemories.findingIds,
		})
		.from(topicMemories)
		.where(
			and(eq(topicMemories.id, row.id), eq(topicMemories.topicId, row.topicId), eq(topicMemories.status, row.status)),
		)
	return Boolean(
		current &&
			current.updatedAt.getTime() === row.updatedAt.getTime() &&
			current.text === row.text &&
			current.factDate === row.factDate &&
			JSON.stringify(current.findingIds) === JSON.stringify(row.findingIds),
	)
}

// source visibility and rater edits can change while a split is being reviewed
async function isSplitReviewCurrent(
	transaction: DbTransaction,
	row: StoredTopicMemory,
	claims: Claim[],
	feedback: Feedback[],
): Promise<boolean> {
	const ids = [...new Set(claims.flatMap(({ findingIds }) => findingIds))]
	const eligible = await loadTopicMemoryFindingEvidence(row.topicId, ids, transaction)
	return (
		ids.every((id) => eligible.has(id)) &&
		JSON.stringify(await loadFeedback(row.id, transaction)) === JSON.stringify(feedback)
	)
}

async function storeSplitTopicMemories(
	transaction: DbTransaction,
	row: StoredTopicMemory,
	prepared: PreparedSplit,
): Promise<RepairOutcome> {
	// keep the original queued even if any child or its feedback has to roll back
	await queueTopicMemoryRepair(transaction, row.id)
	try {
		return await transaction.transaction((splitTransaction) => writeTopicMemorySplit(splitTransaction, row, prepared))
	} catch (error) {
		if (error instanceof RejectedTopicMemorySplitError) {
			return "queued"
		}
		throw error
	}
}

async function writeTopicMemorySplit(
	transaction: DbTransaction,
	row: StoredTopicMemory,
	{ claims, embeddings, feedback, minimumClaims }: PreparedSplit,
): Promise<RepairOutcome> {
	// reuse matching and rejection checks before applying each claim's ratings
	const now = new Date()
	const stored = new Set<string>()
	for (const [index, claim] of claims.entries()) {
		const { feedbackIndexes: _feedbackIndexes, ...fields } = claim
		const id = await applyTopicMemoryWrite(transaction, {
			topicId: row.topicId,
			scanId: row.lastSeenScanId,
			startedAt: row.lastSeenAt,
			now,
			firstScan: { id: row.firstScanId, startedAt: row.firstSeenAt },
			write: {
				...fields,
				operation: "add",
				kind: row.kind,
				importance: row.importance,
				embedding: embeddings[index] as number[],
			},
		})
		if (!id) {
			throw new RejectedTopicMemorySplitError()
		}
		stored.add(id)
		const userIds = feedback
			.filter((_, feedbackIndex) => isFeedbackForClaim(feedbackIndex, claims, index))
			.map(({ userId }) => userId)
		if (userIds.length) {
			await copyTopicMemoryFeedback(transaction, { targetId: id, sourceIds: [row.id], userIds })
		}
	}
	// two rewrites that reach the same survivor do not finish a compound repair
	const [firstStoredId] = stored
	if (!firstStoredId || stored.size < minimumClaims) {
		throw new RejectedTopicMemorySplitError()
	}
	await archiveTopicMemoryOriginal(transaction, row.id, firstStoredId)
	await limitActiveTopicMemories(transaction, row.topicId, now)
	return stored.size > 1 ? "split" : "rewritten"
}

class RejectedTopicMemorySplitError extends Error {}

async function queueTopicMemoryRepair(transaction: DbTransaction, id: string): Promise<"queued"> {
	await transaction
		.update(topicMemories)
		.set({ needsReview: true, reviewMatchId: null })
		.where(eq(topicMemories.id, id))
	return "queued"
}

async function archiveTopicMemoryOriginal(
	transaction: DbTransaction,
	id: string,
	replacedById?: string,
): Promise<void> {
	await transaction
		.update(topicMemories)
		.set({ status: "outdated", isAtomic: false, needsReview: false, reviewMatchId: null, replacedById })
		.where(eq(topicMemories.id, id))
}

function loadFeedback(id: string, handle: DbHandle = db): Promise<Feedback[]> {
	return handle
		.select()
		.from(topicMemoryFeedback)
		.where(eq(topicMemoryFeedback.topicMemoryId, id))
		.orderBy(topicMemoryFeedback.userId)
}

// an unassigned note or vote applies to every surviving claim
function isFeedbackForClaim(index: number, claims: Claim[], claimIndex: number): boolean {
	return (
		claims[claimIndex]?.feedbackIndexes.includes(index) === true ||
		!claims.some(({ feedbackIndexes }) => feedbackIndexes.includes(index))
	)
}
