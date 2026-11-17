// matches checked claims against the active Journal before they reach the writer
import { toChunks } from "@carlnotes/contracts/arrays"
import type { TopicMemoryPerson } from "@carlnotes/contracts/topicMemories"
import { areTopicMemoryDatesCompatible } from "@carlnotes/contracts/topicMemoryWork"
import { db } from "@carlnotes/db"
import { scans } from "@carlnotes/db/schema/scans"
import { topicMemories } from "@carlnotes/db/schema/topicMemories"
import { topicMemoryPromptFeedback } from "@carlnotes/db/topicMemories"
import { premiumModelCost } from "@carlnotes/models/budget"
import { LOW_REASONING_PROVIDER_OPTIONS, SCORE_OUTPUT_TOKENS, scoreModel } from "@carlnotes/models/models"
import { PRIVATE_MODEL_OPTIONS } from "@carlnotes/models/privateModelOptions"
import { fetchPromptTemplate, promptTelemetry } from "@carlnotes/models/prompts/fetch"
import { writePrompt } from "@carlnotes/models/prompts/write"
import { runWithConcurrency } from "@carlnotes/server/concurrency"
import { generateText, NoObjectGeneratedError, NoOutputGeneratedError, Output } from "ai"
import { and, asc, eq, sql } from "drizzle-orm"
import { z } from "zod"
import { loadTopicMemoryNeighbors } from "./topicMemoryEvidence"
import { normalizeTopicMemoryValue, toTopicMemoryPersonMatchKey } from "./topicMemoryOperations"
import { recordTopicMemorySpend } from "./topicMemorySpend"
import { readTopicMemorySubjectName, type TopicMemorySubject } from "./topicMemorySubjects"

const JOURNAL_TOKEN_BUDGET = 48_000
const MATCH_BATCH_SIZE = 15
const MATCH_CONCURRENCY = 3
const matchResponse = z.object({
	operations: z.array(
		z.object({
			index: z.number().int(),
			operation: z.enum(["add", "update", "noOp"]),
			memoryId: z.string().nullable(),
			useCandidateText: z.boolean(),
		}),
	),
})

type JournalClaim = {
	id: string
	text: string
	factDate: string | null
	person: TopicMemoryPerson | null
	subject?: string | null
	claimType?: string | null
	value?: string | null
}
export type TopicMemoryReconciliationTarget = JournalClaim & { updatedAt: Date }
type CheckedCandidate = Omit<JournalClaim, "id"> & { id?: string }
type ReconciliationCandidate = CheckedCandidate & { embedding: number[] }
export type TopicMemoryReconciliation =
	| { operation: "add"; combineWithExactMatch?: true }
	| { operation: "noOp" }
	| { operation: "update"; target: TopicMemoryReconciliationTarget; useCandidateText: boolean }
type ReconciliationInput = {
	scanId?: string
	litellmApiKey: string
	signal: AbortSignal
	subjects?: TopicMemorySubject[]
}

/** Loads every eligible active row when its serialized text fits the input token budget. */
export async function loadTopicMemoryReconciliationJournal(
	topicId: string,
): Promise<
	| (TopicMemoryReconciliationTarget &
			Pick<
				Awaited<ReturnType<typeof loadTopicMemoryNeighbors>>[number],
				"status" | "kind" | "lastSeenAt" | "feedback"
			>)[]
	| undefined
> {
	// a byte count conservatively bounds tokens. the running total avoids transferring large Journals
	const rows = await db
		.select({
			id: topicMemories.id,
			text: topicMemories.text,
			factDate: topicMemories.factDate,
			person: topicMemories.person,
			subject: topicMemories.subject,
			claimType: topicMemories.claimType,
			value: topicMemories.value,
			updatedAt: topicMemories.updatedAt,
			kind: topicMemories.kind,
			status: topicMemories.status,
			lastSeenAt: scans.startedAt,
			feedback: topicMemoryPromptFeedback,
			bytes: sql<number>`sum(octet_length(json_build_array(
				${topicMemories.id}, ${topicMemories.text}, ${topicMemories.factDate}, ${topicMemories.person},
				${topicMemories.subject}, ${topicMemories.claimType}, ${topicMemories.value}
			)::text) + 85) over ()`.mapWith(Number),
		})
		.from(topicMemories)
		.innerJoin(scans, eq(scans.id, topicMemories.lastSeenScanId))
		.where(
			and(
				eq(topicMemories.topicId, topicId),
				eq(topicMemories.status, "active"),
				eq(topicMemories.isAtomic, true),
				eq(topicMemories.needsReview, false),
			),
		)
		.orderBy(asc(topicMemories.firstScanId), asc(topicMemories.id))
		.limit(JOURNAL_TOKEN_BUDGET / 50 + 1)
	if (rows[0] && rows[0].bytes > JOURNAL_TOKEN_BUDGET) {
		return
	}
	return rows.map(({ bytes: _bytes, ...row }) => row)
}

/** Returns a validated action for each checked candidate, including split pieces. */
export async function reconcileTopicMemoryClaims({
	topicId,
	candidates,
	journal,
	...input
}: ReconciliationInput & {
	topicId: string
	candidates: ReconciliationCandidate[]
	journal: TopicMemoryReconciliationTarget[] | undefined
}): Promise<TopicMemoryReconciliation[]> {
	// let all paid calls finish before the caller releases the Scan's reservation
	const batches = journal ? toChunks(candidates, MATCH_BATCH_SIZE) : candidates.map((candidate) => [candidate])
	const results = await runWithConcurrency(batches, MATCH_CONCURRENCY, async (batch) => {
		try {
			const [first] = batch
			if (!first) {
				return { operations: [] }
			}
			const rows = journal ?? (await loadTopicMemoryNeighbors(topicId, first.embedding, { activeOnly: true }))
			return { operations: await matchTopicMemoryClaims({ ...input, candidates: batch, journal: rows }) }
		} catch (error) {
			return { error } as const
		}
	})
	return results.flatMap((result) => {
		if ("error" in result) {
			throw result.error
		}
		return result.operations
	})
}

/** Matches a bounded batch and checks every returned index, ID and known date. */
async function matchTopicMemoryClaims({
	candidates,
	journal,
	scanId,
	litellmApiKey,
	signal,
	subjects = [],
}: ReconciliationInput & {
	candidates: CheckedCandidate[]
	journal: TopicMemoryReconciliationTarget[]
}): Promise<TopicMemoryReconciliation[]> {
	// preserve short inputs and avoid paying for an empty request
	if (!candidates.length) {
		return []
	}
	if (!journal.length && candidates.length === 1) {
		return [{ operation: "add" }]
	}
	const { template, name, registryPrompt } = await fetchPromptTemplate("reconcile-topic-memory-claims")
	const prompt = writePrompt(template, {
		subjects: JSON.stringify(subjects),
		existingMemories: JSON.stringify(
			journal.map(({ updatedAt: _updatedAt, id, text, factDate, person, subject, claimType, value }) => ({
				id,
				text,
				factDate,
				person,
				subject: subject ? readTopicMemorySubjectName(subject) : subject,
				claimType,
				value,
			})),
		),
		candidates: JSON.stringify(
			candidates.map(({ id, text, factDate, person, subject, claimType, value }, index) => ({
				index,
				id,
				text,
				factDate,
				person,
				subject: subject ? readTopicMemorySubjectName(subject) : subject,
				claimType,
				value,
			})),
		),
	})
	try {
		const result = await generateText({
			model: scoreModel(litellmApiKey),
			prompt,
			output: Output.object({ schema: matchResponse }),
			providerOptions: LOW_REASONING_PROVIDER_OPTIONS,
			maxOutputTokens: SCORE_OUTPUT_TOKENS,
			abortSignal: signal,
			maxRetries: 0,
			...promptTelemetry({ prompt, name, registryPrompt }),
			...PRIVATE_MODEL_OPTIONS,
		})
		if (scanId) {
			await recordTopicMemorySpend(scanId, premiumModelCost(result.usage))
		}
		return validateReconciliation(candidates, journal, result.output.operations)
	} catch (error) {
		// retry truncated or empty structured output in smaller batches
		if (!NoObjectGeneratedError.isInstance(error) && !NoOutputGeneratedError.isInstance(error)) {
			throw error
		}
		if (scanId && NoObjectGeneratedError.isInstance(error) && error.usage) {
			await recordTopicMemorySpend(scanId, premiumModelCost(error.usage))
		}
		if (candidates.length === 1) {
			return [{ operation: "noOp" }]
		}
		const operations: TopicMemoryReconciliation[] = []
		for (const batch of toChunks(candidates, Math.ceil(candidates.length / 2))) {
			operations.push(
				...(await matchTopicMemoryClaims({ candidates: batch, journal, scanId, litellmApiKey, signal, subjects })),
			)
		}
		return operations
	}
}

// reject repeated indexes and compare each requested target with the exact snapshot sent to the model
function validateReconciliation(
	candidates: CheckedCandidate[],
	journal: TopicMemoryReconciliationTarget[],
	actions: z.infer<typeof matchResponse>["operations"],
): TopicMemoryReconciliation[] {
	const indexes = Map.groupBy(actions, ({ index }) => index)
	const journalOrder = new Map(journal.map(({ id }, index) => [id, index]))
	const validated = candidates.map<TopicMemoryReconciliation>((candidate, index) => {
		const [action, duplicate] = indexes.get(index) ?? []
		if (!action || duplicate) {
			return { operation: "noOp" }
		}
		if (action.operation !== "update") {
			return { operation: action.memoryId === null ? action.operation : "noOp" }
		}

		const target = journal[journalOrder.get(action.memoryId ?? "") ?? -1]
		return target && canReconcileTopicMemoryTarget(candidate, target, journalOrder)
			? { operation: "update", target, useCandidateText: action.useCandidateText }
			: { operation: "noOp" }
	})

	// let the writer combine an exact duplicate only once that fact is in storage
	return candidates.map((candidate, index) => {
		const [reply, duplicate] = indexes.get(index) ?? []
		if (reply?.operation !== "noOp" || reply.memoryId !== null || duplicate) {
			return validated[index] ?? { operation: "noOp" }
		}
		const hasMatchingDraft = candidates.some(
			(peer, peerIndex) =>
				(validated[peerIndex]?.operation === "add" || validated[peerIndex]?.operation === "update") &&
				haveMatchingTopicMemoryKeys(candidate, peer),
		)
		return hasMatchingDraft ? { operation: "add", combineWithExactMatch: true } : { operation: "add" }
	})
}

// require a retained claim with the same key and a compatible occurrence date
function haveMatchingTopicMemoryKeys(first: CheckedCandidate, second: CheckedCandidate): boolean {
	return Boolean(
		first.subject &&
			first.subject === second.subject &&
			first.claimType &&
			first.claimType === second.claimType &&
			first.value &&
			second.value &&
			normalizeTopicMemoryValue(first.value) === normalizeTopicMemoryValue(second.value) &&
			areTopicMemoryDatesCompatible(first.factDate, second.factDate) &&
			haveCompatibleTopicMemoryPeople(first.person, second.person),
	)
}

// enforce the ordering rule and reject a conflict in either occurrence date or name
function canReconcileTopicMemoryTarget(
	candidate: CheckedCandidate,
	target: TopicMemoryReconciliationTarget,
	order: ReadonlyMap<string, number>,
): boolean {
	const targetPosition = order.get(target.id) ?? -1
	const candidatePosition = candidate.id ? (order.get(candidate.id) ?? -1) : order.size
	return (
		targetPosition >= 0 &&
		targetPosition < candidatePosition &&
		areTopicMemoryDatesCompatible(target.factDate, candidate.factDate) &&
		haveCompatibleTopicMemoryPeople(target.person, candidate.person)
	)
}

/** Requires the same resolved identity for claims about people. */
export function haveCompatibleTopicMemoryPeople(
	first: TopicMemoryPerson | null,
	second: TopicMemoryPerson | null,
): boolean {
	if (!first && !second) {
		return true
	}

	// require the matching name and identifying detail after canonicalization
	const key = toTopicMemoryPersonMatchKey(first)
	return key !== null && key === toTopicMemoryPersonMatchKey(second)
}
