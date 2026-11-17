// drafts and writes topic memories from eligible public Findings
import { toChunks } from "@carlnotes/contracts/arrays"
import { db } from "@carlnotes/db"
import { isUserPastDailySpendCutoff } from "@carlnotes/db/dailySpendCutoffs"
import { runWithJobLease } from "@carlnotes/db/jobLease"
import { hasUnconvertedPersonalSources } from "@carlnotes/db/personalSourcesAuthority"
import { EMBED_MODEL_NAME } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { isBudgetRejection, isModelAuthenticationRejection } from "@carlnotes/models/models"
import { reserveUserSpend, type SpendReservation } from "@carlnotes/models/spendReservations"
import { eq, sql } from "drizzle-orm"
import type { EmbeddedTopicMemoryWrite } from "./applyTopicMemoryWrite"
import { type TopicMemoryClaimCounts, validateTopicMemoryClaims } from "./topicMemoryClaimReview"
import {
	draftTopicMemoriesFromFindings,
	type EmbeddedTopicMemoryFinding,
	type TopicMemoryDraft,
} from "./topicMemoryDrafts"
import { embedTopicMemoryClaims, embedTopicMemoryTexts } from "./topicMemoryEmbeddings"
import {
	isTopicMemoryFindingEligible,
	loadTopicMemoryFindings,
	loadTopicMemoryScan,
	type TopicMemoryFinding,
} from "./topicMemoryEvidence"
import { groupSimilarFindings } from "./topicMemoryOperations"
import { loadTopicMemoryReconciliationJournal, reconcileTopicMemoryClaims } from "./topicMemoryReconciliation"
import { loadTopicMemorySubjects, resolveTopicMemorySubject } from "./topicMemorySubjects"
import { saveTopicMemoryUpdates } from "./topicMemoryWrites"

// cover proposals, claim checks, and repairs under one Scan reservation
const MAX_TOPIC_MEMORY_UPDATE_DOLLARS = 0.12
const CONCURRENT_FINDING_GROUPS = 4
const MAX_PREMIUM_EXTRACTION_ATTEMPTS = 3
const MAX_TOPIC_MEMORY_DRAFTS_PER_SCAN = 60
const MAX_TOPIC_MEMORY_WRITES_PER_SCAN = 120
const SPEND_PAUSED = Symbol("Topic memory spend paused")

/** Safe failure marker for an owner key that LiteLLM refused. */
export class TopicMemoryAuthenticationError extends Error {
	constructor() {
		super("LiteLLM rejected the Topic owner's virtual key with HTTP 401")
		this.name = "TopicMemoryAuthenticationError"
	}
}

type TopicMemoryUpdateOutcome = "skipped" | "paused" | "updated"
type TopicMemoryUpdateInput = { scanId: string; topicId: string; scanStartedAt: Date; signal: AbortSignal }
type TopicMemoryModelInput = Pick<TopicMemoryUpdateInput, "scanId" | "signal"> & { litellmApiKey: string }

/** Updates topic memories after a completed Scan. A spend pause skips the Scan without queuing historical work. */
export async function updateTopicMemories(scanId: string, signal: AbortSignal): Promise<TopicMemoryUpdateOutcome> {
	// an activity retry and a backfill share the same scan lease and transactional completion mark
	signal.throwIfAborted()
	const result = await runWithJobLease({
		jobName: `topic-memories:${scanId}`,
		runTask: (leaseSignal) => updateTopicMemoriesFromScan(scanId, AbortSignal.any([signal, leaseSignal])),
	})
	if (result !== null) {
		return result
	}

	// a concurrent lease can end without committing. retry unless the Scan is already finished
	const scan = await loadTopicMemoryScan(scanId)
	if (!scan?.topicId || scan.topicMemoriesUpdatedAt) {
		return "skipped"
	}
	throw new Error("Another attempt holds the topic memory update lease")
}

async function updateTopicMemoriesFromScan(scanId: string, signal: AbortSignal): Promise<TopicMemoryUpdateOutcome> {
	// keep legacy personal-source imports outside the Journal and pause with free scans
	const scan = await loadTopicMemoryScan(scanId)
	if (!scan?.topicId || scan.topicMemoriesUpdatedAt || (await hasUnconvertedPersonalSources(scan.topicId))) {
		return "skipped"
	}
	if (await isUserPastDailySpendCutoff(scan.ownerId, "scheduledScans")) {
		return "paused"
	}

	// prior staged Scans finish without reapplying their writes
	const input = { scanId, topicId: scan.topicId, scanStartedAt: scan.startedAt, signal }
	const findings = scan.topicMemoriesWrittenAt
		? []
		: (await loadTopicMemoryFindings(scanId, scan.topicId)).filter(isTopicMemoryFindingEligible)
	return proposeAndSaveTopicMemories({ ...input, ownerId: scan.ownerId, findings })
}

async function proposeAndSaveTopicMemories({
	ownerId,
	findings,
	...input
}: TopicMemoryUpdateInput & {
	ownerId: string
	findings: TopicMemoryFinding[]
}): Promise<TopicMemoryUpdateOutcome> {
	// hold spend until all paid calls settle and each one's cost is recorded
	let reservation: SpendReservation | undefined
	let apiKey: string | undefined
	const loadModelKey = async (): Promise<string> => {
		input.signal.throwIfAborted()
		if (!apiKey) {
			const spend = await reserveUserSpend({
				userId: ownerId,
				kind: "topicMemories",
				maxDollars: MAX_TOPIC_MEMORY_UPDATE_DOLLARS,
			})
			if (spend === "rejected") {
				throw SPEND_PAUSED
			}
			reservation = spend
			apiKey = await loadOrProvisionUserLiteLLMKey(ownerId)
		}
		return apiKey
	}
	try {
		// reserve and provision only if the Scan has Findings for extraction
		const proposed = findings.length
			? await prepareTopicMemoryWrites({ ...input, findings, litellmApiKey: await loadModelKey() })
			: undefined
		const writes = proposed?.writes ?? []
		await saveTopicMemoryUpdates({
			...input,
			writes,
		})
		return "updated"
	} catch (error) {
		// report cancellation or lease loss before classifying a provider failure
		input.signal.throwIfAborted()
		if (error === SPEND_PAUSED || isBudgetRejection(error)) {
			return "paused"
		}
		if (isModelAuthenticationRejection(error)) {
			throw new TopicMemoryAuthenticationError()
		}
		throw error
	} finally {
		// cancellation, budget pauses and successful writes all release their reservation
		await reservation?.release()
	}
}

/** Builds and checks model drafts separately from the guarded write. */
export async function prepareTopicMemoryWrites({
	findings,
	litellmApiKey,
	...input
}: TopicMemoryUpdateInput & {
	findings: TopicMemoryFinding[]
	litellmApiKey: string
}): Promise<{ writes: EmbeddedTopicMemoryWrite[]; counts: TopicMemoryClaimCounts }> {
	// keep public evidence that still matches the Topic after review
	const eligibleFindings = findings.filter(isTopicMemoryFindingEligible)
	if (eligibleFindings.length === 0) {
		return { writes: [], counts: { checked: 0, split: 0, rejected: 0 } }
	}
	// reuse Resource vectors and embed only the public Finding text for missing or older vectors
	const modelInput = { scanId: input.scanId, signal: input.signal, litellmApiKey }
	const [[scope], vectors, subjects, journal] = await Promise.all([
		db
			.select({ name: topics.name, prompt: sql<string>`left(${topics.prompt}, 2400)` })
			.from(topics)
			.where(eq(topics.id, input.topicId)),
		toEmbeddedFindings(eligibleFindings, modelInput),
		loadTopicMemorySubjects(input.topicId),
		loadTopicMemoryReconciliationJournal(input.topicId),
	])
	const findingGroups = groupSimilarFindings(vectors)
	const draftedClaims: TopicMemoryDraft[] = []
	const ratedMemories = journal?.filter(({ feedback }) => feedback.length > 0).slice(0, 5)
	// cap optional premium calls across the parallel Finding groups in this Scan
	let premiumAttempts = 0
	const reservePremiumRetry = (): boolean => {
		if (premiumAttempts >= MAX_PREMIUM_EXTRACTION_ATTEMPTS) {
			return false
		}
		premiumAttempts++
		return true
	}
	for (const batch of toChunks(findingGroups, CONCURRENT_FINDING_GROUPS)) {
		input.signal.throwIfAborted()
		const results = await Promise.allSettled(
			batch.map((relatedFindings) =>
				draftTopicMemoriesFromFindings({
					...input,
					relatedFindings,
					litellmApiKey,
					scope,
					subjects,
					ratedMemories,
					reservePremiumRetry,
				}),
			),
		)
		for (const result of results) {
			if (result.status === "rejected") {
				throw result.reason
			}
			// an invalid model draft leaves the other drafts in this batch intact
			draftedClaims.push(...result.value)
		}
	}

	// validate and repair claim boundaries before embedding or matching them
	const drafts = limitTopicMemoryClaims(draftedClaims, MAX_TOPIC_MEMORY_DRAFTS_PER_SCAN)
	const { writes, counts } = await validateTopicMemoryClaims({
		...modelInput,
		topicId: input.topicId,
		proposals: drafts,
		findings: eligibleFindings,
	})
	const checked = limitTopicMemoryClaims(writes, MAX_TOPIC_MEMORY_WRITES_PER_SCAN)
	const embeddings = await embedTopicMemoryClaims(checked, modelInput)
	const candidates = checked.map((write, index) => ({
		...resolveTopicMemorySubject(write, subjects),
		embedding: requireEmbedding(embeddings[index]),
	}))
	const operations = await reconcileTopicMemoryClaims({
		...modelInput,
		topicId: input.topicId,
		candidates,
		journal,
		subjects,
	})
	return {
		writes: candidates.flatMap<EmbeddedTopicMemoryWrite>((candidate, index) => {
			const action = operations[index]
			if (action?.operation === "update") {
				return [{ ...candidate, reconciliation: action }]
			}
			return action?.operation === "add" ? [{ ...candidate, reconciliation: action }] : []
		}),
		counts,
	}
}

function limitTopicMemoryClaims(claims: TopicMemoryDraft[], limit: number): TopicMemoryDraft[] {
	return claims.length <= limit
		? claims
		: claims.toSorted((left, right) => right.importance - left.importance).slice(0, limit)
}

async function toEmbeddedFindings(
	findings: TopicMemoryFinding[],
	modelInput: TopicMemoryModelInput,
): Promise<EmbeddedTopicMemoryFinding[]> {
	const missing = findings.filter(({ embedding, embeddingModel }) => !embedding || embeddingModel !== EMBED_MODEL_NAME)
	const embeddings = await embedTopicMemoryTexts(
		missing.map(
			({ title, snippet, description }) =>
				[title, snippet, description].filter(Boolean).join("\n") || "Untitled finding",
		),
		modelInput,
	)
	const byFinding = new Map(missing.map(({ id }, index) => [id, embeddings[index]]))
	return findings.map(({ embedding, embeddingModel, ...finding }) => ({
		...finding,
		embedding: requireEmbedding(
			embeddingModel === EMBED_MODEL_NAME && embedding ? embedding : byFinding.get(finding.id),
		),
	}))
}

function requireEmbedding(embedding: number[] | undefined): number[] {
	if (!embedding) {
		throw new Error("A Journal embedding is missing")
	}
	return embedding
}
