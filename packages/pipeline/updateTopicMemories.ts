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
import { reportError } from "@carlnotes/server/monitoring"
import { eq, sql } from "drizzle-orm"
import type { EmbeddedTopicMemoryWrite } from "./applyTopicMemoryWrite"
import { type TopicMemoryClaimCounts, validateTopicMemoryClaims } from "./topicMemoryClaimReview"
import { isTopicMemoryLimitFilledBySaved } from "./topicMemoryCleanup"
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
import type { TopicMemoryModelInput } from "./topicMemoryModelCall"
import { groupSimilarFindings } from "./topicMemoryOperations"
import { loadTopicMemoryReconciliationJournal, reconcileTopicMemoryClaims } from "./topicMemoryReconciliation"
import {
	canSpendOnTopicMemories,
	newTopicMemorySpend,
	saveTopicMemorySpend,
	type TopicMemorySpend,
} from "./topicMemorySpend"
import { loadTopicMemorySubjects, resolveTopicMemorySubject } from "./topicMemorySubjects"
import { saveTopicMemoryUpdates } from "./topicMemoryWrites"

// the most one update spends on its proposals, claim checks, and matches, which is also what it reserves against
// the owner's budget. dev's recorded updates cost a cent at the median and under nine cents at most, so only a
// runaway update reaches it
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

/** The failure of an update that found another attempt's lease on its Scan, which that attempt has to finish first. */
export class TopicMemoryLeaseHeldError extends Error {
	constructor() {
		super("Another attempt holds the topic memory update lease")
		this.name = "TopicMemoryLeaseHeldError"
	}
}

type TopicMemoryUpdateOutcome = "skipped" | "paused" | "updated"

// the moment after which no model call of the update waits to try again, and whether the platform pays for the
// update, as it does for the backfill's
type TopicMemoryUpdateOptions = { waitDeadlineAt?: number; isPlatformBilled?: boolean }
type TopicMemoryUpdateInput = TopicMemoryUpdateOptions & {
	scanId: string
	topicId: string
	scanStartedAt: Date
	signal: AbortSignal
}

/**
 * Updates topic memories after a completed Scan. A spend pause skips the Scan without queuing historical work. An
 * update that the platform pays for runs on the platform's key, reserves nothing against the Scan's owner, is never
 * paused by the owner's spend, and records its cost as the platform's.
 */
export async function updateTopicMemories(
	scanId: string,
	signal: AbortSignal,
	options: TopicMemoryUpdateOptions = {},
): Promise<TopicMemoryUpdateOutcome> {
	// an activity retry and a backfill share the same scan lease and transactional completion mark
	signal.throwIfAborted()
	const result = await runWithJobLease({
		jobName: `topic-memories:${scanId}`,
		runTask: (leaseSignal) => updateTopicMemoriesFromScan(scanId, AbortSignal.any([signal, leaseSignal]), options),
	})
	if (result !== null) {
		return result
	}

	// a concurrent lease can end without committing. retry unless the Scan is already finished
	const scan = await loadTopicMemoryScan(scanId)
	if (!scan?.topicId || scan.topicMemoriesUpdatedAt) {
		return "skipped"
	}
	throw new TopicMemoryLeaseHeldError()
}

async function updateTopicMemoriesFromScan(
	scanId: string,
	signal: AbortSignal,
	options: TopicMemoryUpdateOptions,
): Promise<TopicMemoryUpdateOutcome> {
	// keep legacy personal-source imports outside the Journal and pause with free scans
	const scan = await loadTopicMemoryScan(scanId)
	if (!scan?.topicId || scan.topicMemoriesUpdatedAt || (await hasUnconvertedPersonalSources(scan.topicId))) {
		return "skipped"
	}
	if (!options.isPlatformBilled && (await isUserPastDailySpendCutoff(scan.ownerId, "scheduledScans"))) {
		return "paused"
	}

	// prior staged Scans finish without reapplying their writes. a Topic whose saved topic memories and corrections
	// fill its limit would retire every new one in the write that adds it, so its Scan pays for none
	const input = { ...options, scanId, topicId: scan.topicId, scanStartedAt: scan.startedAt, signal }
	const findings =
		scan.topicMemoriesWrittenAt || (await isTopicMemoryLimitFilledBySaved(scan.topicId))
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
	// hold spend until all paid calls settle and each one's cost is recorded. the platform's own key is no key, and
	// reserves nothing against the owner
	let reservation: SpendReservation | undefined
	let apiKey: string | undefined
	const { isPlatformBilled = false } = input
	const loadModelKey = async (): Promise<string | undefined> => {
		input.signal.throwIfAborted()
		if (!apiKey && !isPlatformBilled) {
			const spend = await reserveUserSpend({
				userId: ownerId,
				kind: "topicMemories",
				maxDollars: MAX_TOPIC_MEMORY_UPDATE_DOLLARS,
			})
			if (spend === "rejected") {
				throw SPEND_PAUSED
			}
			// the reservation is held from the first paid call, on the key that the owner holds now
			reservation = spend
			apiKey = await loadOrProvisionUserLiteLLMKey(ownerId)
		}
		return apiKey
	}
	// one running total for every model call of the update
	const platformBilledTopicId = isPlatformBilled ? input.topicId : undefined
	const spend = newTopicMemorySpend(input.scanId, MAX_TOPIC_MEMORY_UPDATE_DOLLARS, platformBilledTopicId)
	try {
		// reserve and provision only if the Scan has Findings for extraction
		const proposed = findings.length
			? await prepareTopicMemoryWrites({ ...input, spend, findings, litellmApiKey: await loadModelKey() })
			: undefined
		// a Scan with nothing to write is still marked updated
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
		// a rejected key ends the update, unless the owner's key was replaced meanwhile. the platform's key has no
		// replacement to wait for
		if (isModelAuthenticationRejection(error)) {
			throw isPlatformBilled ? new TopicMemoryAuthenticationError() : await toAuthenticationFailure(ownerId, apiKey)
		}
		throw error
	} finally {
		// a failed or cancelled attempt still records what its calls cost, and every ending releases the reservation
		await saveTopicMemorySpend(spend).catch((error: unknown) => {
			console.error(`could not record the topic memory spend of scan ${input.scanId}`, error)
		})
		await reservation?.release()
	}
}

// a 401 on a key that the owner still holds ends the update. a key replaced while the update ran is worth another
// attempt, which reads the new key
async function toAuthenticationFailure(ownerId: string, rejectedKey: string | undefined): Promise<Error> {
	const currentKey = await loadOrProvisionUserLiteLLMKey(ownerId).catch(() => rejectedKey)
	return currentKey === rejectedKey
		? new TopicMemoryAuthenticationError()
		: new Error("The Topic owner's key changed during the topic memory update")
}

/** Builds and checks model drafts separately from the guarded write. */
export async function prepareTopicMemoryWrites({
	findings,
	litellmApiKey,
	spend,
	...input
}: TopicMemoryUpdateInput & {
	findings: TopicMemoryFinding[]
	litellmApiKey: string | undefined
	spend?: TopicMemorySpend
}): Promise<{ writes: EmbeddedTopicMemoryWrite[]; counts: TopicMemoryClaimCounts }> {
	// keep public evidence that still matches the Topic after review
	const eligibleFindings = findings.filter(isTopicMemoryFindingEligible)
	if (eligibleFindings.length === 0) {
		return { writes: [], counts: { checked: 0, split: 0, rejected: 0 } }
	}
	// reuse Resource vectors and embed only the public Finding text for missing or older vectors
	const { signal, waitDeadlineAt } = input
	const modelInput = { signal, spend, waitDeadlineAt, litellmApiKey }
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
	// limit optional premium calls across the parallel Finding groups in this Scan
	let premiumAttempts = 0
	const reservePremiumRetry = (): boolean => {
		if (premiumAttempts >= MAX_PREMIUM_EXTRACTION_ATTEMPTS) {
			return false
		}
		premiumAttempts++
		return true
	}
	// draft from a few Finding groups at a time
	for (const batch of toChunks(findingGroups, CONCURRENT_FINDING_GROUPS)) {
		input.signal.throwIfAborted()
		// an update at its spend limit drafts from no further Finding group
		if (!canSpendOnTopicMemories(spend)) {
			break
		}
		const results = await Promise.allSettled(
			batch.map((relatedFindings) =>
				draftTopicMemoriesFromFindings({
					...input,
					...modelInput,
					relatedFindings,
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

	// validate and repair claim boundaries before embedding or matching them. the Scan row takes the spend once a stage
	await saveSpend(spend)
	const drafts = limitTopicMemoryClaims(draftedClaims, MAX_TOPIC_MEMORY_DRAFTS_PER_SCAN)
	const { writes, counts } = await validateTopicMemoryClaims({
		...modelInput,
		topicId: input.topicId,
		proposals: drafts,
		findings: eligibleFindings,
	})
	await saveSpend(spend)
	// embed the checked claims and match them against the Journal under their established subjects
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
	// the Scan row takes the match's spend before the write marks the Scan updated
	await saveSpend(spend)
	reportSpendLimitReached(input.scanId, spend)
	// a candidate that the match added or updated is written, and any other is left out
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

// write an update's unsaved spend to its Scan row. a replay outside an update keeps no spend
async function saveSpend(spend: TopicMemorySpend | undefined): Promise<void> {
	if (spend) {
		await saveTopicMemorySpend(spend)
	}
}

// an update that reached its limit left Findings undrafted or claims unmatched, which only a runaway update does
function reportSpendLimitReached(scanId: string, spend: TopicMemorySpend | undefined): void {
	if (!spend || canSpendOnTopicMemories(spend)) {
		return
	}
	console.warn(`the topic memory update of scan ${scanId} stopped at its spend limit`, {
		spentDollars: spend.spentDollars,
	})
	reportError(new Error("a topic memory update reached its spend limit"), "worker", {
		scanId,
		spentDollars: spend.spentDollars.toFixed(4),
	})
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
	// embed the text of each Finding that has no vector from the current model
	const missing = findings.filter(({ embedding, embeddingModel }) => !embedding || embeddingModel !== EMBED_MODEL_NAME)
	const embeddings = await embedTopicMemoryTexts(
		missing.map(
			({ title, snippet, description }) =>
				[title, snippet, description].filter(Boolean).join("\n") || "Untitled finding",
		),
		modelInput,
	)
	// every Finding leaves with a vector, its stored one or the new one
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
