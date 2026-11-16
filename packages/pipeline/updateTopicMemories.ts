// builds and pays for one topic memory proposal per public Finding cluster
import { toChunks } from "@carlnotes/contracts/arrays"
import { toUtcDay } from "@carlnotes/contracts/time"
import { toNamedTopicMemoryText, topicMemoryClaimTypes } from "@carlnotes/contracts/topicMemories"
import { db } from "@carlnotes/db"
import { isUserPastDailySpendCutoff } from "@carlnotes/db/dailySpendCutoffs"
import { runWithJobLease } from "@carlnotes/db/jobLease"
import { hasUnconvertedPersonalSources } from "@carlnotes/db/personalSourcesAuthority"
import { EMBED_MODEL_NAME } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { CHEAP_COST_PER_MILLION_TOKENS, tokenCost } from "@carlnotes/models/budget"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { cheapModel, isBudgetRejection, isModelAuthenticationRejection } from "@carlnotes/models/models"
import { PRIVATE_MODEL_OPTIONS } from "@carlnotes/models/privateModelOptions"
import { loadCurrentDayContext } from "@carlnotes/models/prompts/currentDayContext"
import { type BuiltPrompt, fetchPromptTemplate, promptTelemetry } from "@carlnotes/models/prompts/fetch"
import { writePrompt } from "@carlnotes/models/prompts/write"
import { reserveUserSpend, type SpendReservation } from "@carlnotes/models/spendReservations"
import { generateText, NoObjectGeneratedError, Output } from "ai"
import { eq, sql } from "drizzle-orm"
import type { EmbeddedTopicMemoryWrite } from "./applyTopicMemoryWrite"
import { type TopicMemoryClaimCounts, validateTopicMemoryClaims } from "./topicMemoryClaimReview"
import { embedTopicMemoryClaims, embedTopicMemoryTexts } from "./topicMemoryEmbeddings"
import { loadTopicMemoryFindings, loadTopicMemoryNeighbors, loadTopicMemoryScan } from "./topicMemoryEvidence"
import {
	type TopicMemoryWrite,
	topicMemoryProposal,
	toTopicMemoryClusters,
	toTopicMemoryDraft,
} from "./topicMemoryOperations"
import { loadTopicMemoryReconciliationJournal, reconcileTopicMemoryClaims } from "./topicMemoryReconciliation"
import { recordTopicMemorySpend } from "./topicMemorySpend"
import {
	loadTopicMemorySubjects,
	resolveTopicMemorySubject,
	supportsTopicMemoryAlias,
	type TopicMemorySubject,
} from "./topicMemorySubjects"
import { saveTopicMemoryUpdates } from "./topicMemoryWrites"

// cover proposals, claim checks, and repairs under one Scan reservation
const MAX_TOPIC_MEMORY_UPDATE_DOLLARS = 0.12
const MAX_OUTPUT_TOKENS = 1900
const CONCURRENT_CLUSTERS = 4
const MAX_TOPIC_MEMORY_PROPOSALS_PER_SCAN = 60
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
type Finding = Awaited<ReturnType<typeof loadTopicMemoryFindings>>[number]
type EmbeddedFinding = Omit<Finding, "embedding" | "embeddingModel"> & { embedding: number[] }
type ClusterProposal = TopicMemoryWrite & { findingIds: string[] }
type TopicScope = { name: string; prompt: string }
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
	const findings = scan.topicMemoriesWrittenAt ? [] : await loadTopicMemoryFindings(scanId, scan.topicId)
	return proposeAndSaveTopicMemories({ ...input, ownerId: scan.ownerId, findings })
}

async function proposeAndSaveTopicMemories({
	ownerId,
	findings,
	...input
}: TopicMemoryUpdateInput & {
	ownerId: string
	findings: Finding[]
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
			? await proposeTopicMemoryWrites({ ...input, findings, litellmApiKey: await loadModelKey() })
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

/** Builds the real model proposals separately from the guarded write. */
export async function proposeTopicMemoryWrites({
	findings,
	litellmApiKey,
	...input
}: TopicMemoryUpdateInput & {
	findings: Finding[]
	litellmApiKey: string
}): Promise<{ writes: EmbeddedTopicMemoryWrite[]; counts: TopicMemoryClaimCounts }> {
	if (findings.length === 0) {
		return { writes: [], counts: { checked: 0, split: 0, rejected: 0 } }
	}
	// reuse Resource vectors and embed only the public Finding text for missing or older vectors
	const modelInput = { scanId: input.scanId, signal: input.signal, litellmApiKey }
	const [[scope], vectors, subjects, journal] = await Promise.all([
		db
			.select({ name: topics.name, prompt: sql<string>`left(${topics.prompt}, 2400)` })
			.from(topics)
			.where(eq(topics.id, input.topicId)),
		toEmbeddedFindings(findings, modelInput),
		loadTopicMemorySubjects(input.topicId),
		loadTopicMemoryReconciliationJournal(input.topicId),
	])
	const clusters = toTopicMemoryClusters(vectors)
	const proposals: ClusterProposal[] = []
	const ratedMemories = journal?.filter(({ feedback }) => feedback.length > 0).slice(0, 5)
	for (const batch of toChunks(clusters, CONCURRENT_CLUSTERS)) {
		input.signal.throwIfAborted()
		const results = await Promise.allSettled(
			batch.map((cluster) =>
				proposeClusterChange({ ...input, cluster, litellmApiKey, scope, subjects, ratedMemories }),
			),
		)
		for (const result of results) {
			if (result.status === "rejected") {
				throw result.reason
			}
			// an invalid model proposal leaves the other proposals in this batch intact
			proposals.push(...result.value)
		}
	}

	// validate and repair claim boundaries before embedding or matching them
	const drafts = limitTopicMemoryClaims(proposals, MAX_TOPIC_MEMORY_PROPOSALS_PER_SCAN)
	const { writes, counts } = await validateTopicMemoryClaims({
		...modelInput,
		topicId: input.topicId,
		proposals: drafts,
		findings,
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
			return action?.operation === "add" ? [{ ...candidate, reconciliation: { operation: "add" as const } }] : []
		}),
		counts,
	}
}

function limitTopicMemoryClaims(claims: ClusterProposal[], limit: number): ClusterProposal[] {
	return claims.length <= limit
		? claims
		: claims.toSorted((left, right) => right.importance - left.importance).slice(0, limit)
}

async function toEmbeddedFindings(findings: Finding[], modelInput: TopicMemoryModelInput): Promise<EmbeddedFinding[]> {
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

async function proposeClusterChange({
	cluster,
	topicId,
	scanId,
	scanStartedAt,
	litellmApiKey,
	signal,
	scope,
	subjects,
	ratedMemories,
}: TopicMemoryUpdateInput & {
	cluster: EmbeddedFinding[]
	litellmApiKey: string
	scope?: TopicScope
	subjects: TopicMemorySubject[]
	ratedMemories?: Awaited<ReturnType<typeof loadTopicMemoryReconciliationJournal>>
}): Promise<ClusterProposal[]> {
	// fetch neighbors only when the Journal exceeds the reconciliation budget
	const embedding = cluster[0]?.embedding.map(
		(_, index) => cluster.reduce((sum, finding) => sum + (finding.embedding[index] ?? 0), 0) / cluster.length,
	)
	const neighbors = ratedMemories ?? (await loadTopicMemoryNeighbors(topicId, requireEmbedding(embedding)))
	const builtPrompt = await buildTopicMemoryProposalPrompt({
		findings: cluster.map(({ title, snippet, description, articleContext, publicationDateHint }) => ({
			title,
			snippet,
			description,
			articleContext,
			publicationDateHint,
		})),
		neighbors,
		scanStartedAt,
		scope,
		subjects,
	})

	// failed structured output can still have usage. provenance comes from the cluster, never the model
	try {
		const result = await generateText({
			model: cheapModel(litellmApiKey),
			prompt: builtPrompt.prompt,
			output: Output.object({ schema: topicMemoryProposal }),
			abortSignal: signal,
			maxRetries: 0,
			maxOutputTokens: MAX_OUTPUT_TOKENS,
			...promptTelemetry(builtPrompt),
			...PRIVATE_MODEL_OPTIONS,
		})
		await recordTopicMemorySpend(scanId, tokenCost(result.usage.totalTokens ?? 0, CHEAP_COST_PER_MILLION_TOKENS))
		return result.output.facts.flatMap((proposal) => {
			const findingIds = [...new Set(proposal.sourceFindingIndexes.map((index) => cluster[index]?.id))]
			if (findingIds.some((id) => id === undefined)) {
				return []
			}
			const write = toTopicMemoryDraft(proposal)
			if (!write) {
				return []
			}
			const subjectAlias = validateProposedSubjectAlias({
				write,
				alias: proposal.subjectAlias,
				cluster,
				subjects,
				findingIds,
			})
			return [{ ...write, subjectAlias, findingIds: findingIds.filter((id): id is string => Boolean(id)) }]
		})
	} catch (error) {
		// discard only this cluster when the model returns an invalid proposal
		if (!isModelAuthenticationRejection(error) && NoObjectGeneratedError.isInstance(error)) {
			await recordTopicMemorySpend(scanId, tokenCost(error.usage?.totalTokens ?? 0, CHEAP_COST_PER_MILLION_TOKENS))
			return []
		}
		throw error
	}
}

// require the canonical subject and an exact quote from a linked Finding before recording an alias
function validateProposedSubjectAlias({
	write,
	alias,
	cluster,
	subjects,
	findingIds,
}: {
	write: TopicMemoryWrite
	alias: { observedName: string; quote: string; sourceFindingIndex: number } | null | undefined
	cluster: EmbeddedFinding[]
	subjects: TopicMemorySubject[]
	findingIds: (string | undefined)[]
}): TopicMemoryWrite["subjectAlias"] {
	const canonical = resolveTopicMemorySubject(write, subjects)
	const source = alias && cluster[alias.sourceFindingIndex]
	if (
		!alias ||
		!source ||
		!findingIds.includes(source.id) ||
		!subjects.some((entry) => entry.subject === canonical.subject && entry.person === canonical.person)
	) {
		return
	}
	const excerpt = [source.title, source.snippet, source.articleContext].filter(Boolean).join(" ")
	return supportsTopicMemoryAlias({
		canonical: canonical.subject,
		alias: alias.observedName,
		quote: alias.quote,
		source: excerpt,
	})
		? { aliasName: alias.observedName, findingId: source.id }
		: undefined
}

function requireEmbedding(embedding: number[] | undefined): number[] {
	if (!embedding) {
		throw new Error("A Journal embedding is missing")
	}
	return embedding
}

/** Builds a proposal prompt for one cluster and its bounded neighbors. */
export async function buildTopicMemoryProposalPrompt({
	findings,
	neighbors,
	scanStartedAt,
	now,
	scope,
	subjects = [],
}: {
	findings: Pick<Finding, "title" | "snippet" | "description" | "articleContext" | "publicationDateHint">[]
	neighbors: (Pick<
		Awaited<ReturnType<typeof loadTopicMemoryNeighbors>>[number],
		"id" | "kind" | "text" | "status" | "lastSeenAt"
	> &
		Partial<
			Pick<
				Awaited<ReturnType<typeof loadTopicMemoryNeighbors>>[number],
				"factDate" | "person" | "feedback" | "isAtomic"
			>
		>)[]
	scanStartedAt: Date
	now?: Date
	scope?: TopicScope
	subjects?: TopicMemorySubject[]
}): Promise<BuiltPrompt> {
	// keep the current day separate from the observation dates when a historical Scan runs through backfill
	const [{ template, name, registryPrompt }, currentDayBlock] = await Promise.all([
		fetchPromptTemplate("propose-topic-memories"),
		loadCurrentDayContext(now),
	])
	const datedNeighbors = neighbors.flatMap(({ lastSeenAt, ...neighbor }) => {
		const text = toNamedTopicMemoryText(neighbor.text, neighbor.person)
		return text ? [{ ...neighbor, text, lastSeenDay: toUtcDay(lastSeenAt) }] : []
	})
	const prompt = writePrompt(
		template,
		{
			keptFindings: JSON.stringify(findings.map((finding, index) => ({ index, ...finding }))),
			matchingMemories: JSON.stringify(datedNeighbors),
			topicScope: JSON.stringify(scope ?? null),
			existingSubjects: JSON.stringify(subjects),
		},
		{ currentDayBlock, scanDay: toUtcDay(scanStartedAt), claimTypes: topicMemoryClaimTypes.join(", ") },
	)
	return { prompt, name, registryPrompt }
}
