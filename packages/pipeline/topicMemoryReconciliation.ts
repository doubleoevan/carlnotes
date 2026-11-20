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
import { alias } from "drizzle-orm/pg-core"
import { z } from "zod"
import { loadTopicMemoryNeighbors } from "./topicMemoryEvidence"
import { runTopicMemoryModelCall, type TopicMemoryModelInput } from "./topicMemoryModelCall"
import { normalizeTopicMemoryValue, toTopicMemoryPersonMatchKey } from "./topicMemoryOperations"
import { canSpendOnTopicMemories, chargeTopicMemorySpend } from "./topicMemorySpend"
import { readTopicMemorySubjectName, type TopicMemorySubject } from "./topicMemorySubjects"

const JOURNAL_TOKEN_BUDGET = 48_000
const MATCH_BATCH_SIZE = 15
const MATCH_CONCURRENCY = 3

// how many of a batch's candidates read their nearest rows at once, if the Journal is past the input budget
const NEIGHBOR_READ_CONCURRENCY = 5

// how long one match call may run before it is tried again, so a call that hangs does not use the whole attempt
const MATCH_TIMEOUT_MS = 60_000
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

// a claim as the match prompt lists it
type JournalClaim = {
	id: string
	text: string
	factDate: string | null
	person: TopicMemoryPerson | null
	// the structured identity, which a row read as a neighbor leaves out
	subject?: string | null
	claimType?: string | null
	value?: string | null
}

// a stored row that a candidate may update, a checked candidate, which has an id if it is a stored row itself, and
// the candidate with its vector
export type TopicMemoryReconciliationTarget = JournalClaim & { updatedAt: Date }
type CheckedCandidate = Omit<JournalClaim, "id"> & { id?: string }
type ReconciliationCandidate = CheckedCandidate & { embedding: number[] }

// what the writer does with a candidate
export type TopicMemoryReconciliation =
	| { operation: "add"; combineWithExactMatch?: true }
	| { operation: "noOp" }
	| { operation: "update"; target: TopicMemoryReconciliationTarget; useCandidateText: boolean }
type ReconciliationInput = TopicMemoryModelInput & { subjects?: TopicMemorySubject[] }

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
	const firstScans = alias(scans, "first_scans")
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
		.innerJoin(firstScans, eq(firstScans.id, topicMemories.firstScanId))
		.where(
			and(
				eq(topicMemories.topicId, topicId),
				eq(topicMemories.status, "active"),
				eq(topicMemories.isAtomic, true),
				eq(topicMemories.needsReview, false),
			),
		)
		// the earliest matching row that the prompt asks for is the one first seen earliest
		.orderBy(asc(firstScans.startedAt), asc(topicMemories.id))
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
	const batches = toChunks(candidates, MATCH_BATCH_SIZE)
	const results = await runWithConcurrency(batches, MATCH_CONCURRENCY, async (batch) => {
		try {
			// an update at its spend limit starts no further match, and an unmatched candidate is not written
			if (!canSpendOnTopicMemories(input.spend)) {
				return { operations: batch.map((): TopicMemoryReconciliation => ({ operation: "noOp" })) }
			}
			// a Journal past the input budget is matched a batch at a time against that batch's nearest rows
			const nearestJournalRows = journal ?? (await loadNearestJournalRows(topicId, batch))
			return { operations: await matchTopicMemoryClaims({ ...input, candidates: batch, journal: nearestJournalRows }) }
		} catch (error) {
			return { error } as const
		}
	})
	// a batch that failed fails the update once every batch has settled
	return results.flatMap((result) => {
		if ("error" in result) {
			throw result.error
		}
		return result.operations
	})
}

// the nearest active rows of every candidate in a batch, each row once, in the order that the candidates found them
async function loadNearestJournalRows(
	topicId: string,
	batch: ReconciliationCandidate[],
): Promise<TopicMemoryReconciliationTarget[]> {
	const neighborLists = await runWithConcurrency(batch, NEIGHBOR_READ_CONCURRENCY, ({ embedding }) =>
		loadTopicMemoryNeighbors(topicId, embedding, { activeOnly: true }),
	)
	return [...new Map(neighborLists.flat().map((row) => [row.id, row])).values()]
}

/** Matches a bounded batch and checks every returned index, ID and known date. */
async function matchTopicMemoryClaims({
	candidates,
	journal,
	spend,
	litellmApiKey,
	signal,
	waitDeadlineAt,
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
	// an update at its spend limit makes no further match call, including a smaller batch's retry
	if (!canSpendOnTopicMemories(spend)) {
		return candidates.map((): TopicMemoryReconciliation => ({ operation: "noOp" }))
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
		// a rate limit or a timeout waits and tries again, and each attempt gets its own timeout
		const topicMemoryModelCallResult = await runTopicMemoryModelCall({ signal, waitDeadlineAt }, () =>
			generateText({
				model: scoreModel(litellmApiKey),
				prompt,
				output: Output.object({ schema: matchResponse }),
				providerOptions: LOW_REASONING_PROVIDER_OPTIONS,
				maxOutputTokens: SCORE_OUTPUT_TOKENS,
				abortSignal: AbortSignal.any([signal, AbortSignal.timeout(MATCH_TIMEOUT_MS)]),
				maxRetries: 0,
				...promptTelemetry({ prompt, name, registryPrompt }),
				...PRIVATE_MODEL_OPTIONS,
			}),
		)
		chargeTopicMemorySpend(spend, premiumModelCost(topicMemoryModelCallResult.usage))
		return validateReconciliation(candidates, journal, topicMemoryModelCallResult.output.operations)
	} catch (error) {
		// retry truncated or empty structured output in smaller batches
		if (!NoObjectGeneratedError.isInstance(error) && !NoOutputGeneratedError.isInstance(error)) {
			throw error
		}
		if (NoObjectGeneratedError.isInstance(error) && error.usage) {
			chargeTopicMemorySpend(spend, premiumModelCost(error.usage))
		}
		// one candidate cannot be cut smaller, so it is left out
		if (candidates.length === 1) {
			return [{ operation: "noOp" }]
		}
		// match each half by itself, in order
		const operations: TopicMemoryReconciliation[] = []
		for (const batch of toChunks(candidates, Math.ceil(candidates.length / 2))) {
			const modelInput = { spend, litellmApiKey, signal, waitDeadlineAt }
			operations.push(...(await matchTopicMemoryClaims({ ...modelInput, candidates: batch, journal, subjects })))
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
		// a candidate with no reply, or with two, is left out
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
			// values match once their formatting is normalized
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
	// a new candidate comes after every stored row, and a stored one may only update a row listed before it
	const targetPosition = order.get(target.id) ?? -1
	const candidatePosition = candidate.id ? (order.get(candidate.id) ?? -1) : order.size
	return (
		targetPosition >= 0 &&
		targetPosition < candidatePosition &&
		// neither the occurrence date nor the person may conflict
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
