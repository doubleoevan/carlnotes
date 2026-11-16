// builds and pays for one takeaway proposal per public Finding cluster
import { toChunks } from "@carlnotes/contracts/arrays"
import { toUtcDay } from "@carlnotes/contracts/time"
import { db } from "@carlnotes/db"
import { isUserPastDailySpendCutoff } from "@carlnotes/db/dailySpendCutoffs"
import { runWithJobLease } from "@carlnotes/db/jobLease"
import { hasUnconvertedPersonalSources } from "@carlnotes/db/personalSourcesAuthority"
import { EMBED_MODEL_NAME } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import {
	CHEAP_COST_PER_MILLION_TOKENS,
	EMBED_COST_PER_MILLION_TOKENS,
	toEstimatedTokens,
	tokenCost,
} from "@carlnotes/models/budget"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { cheapModel, embedVectors, isBudgetRejection } from "@carlnotes/models/models"
import { loadCurrentDayContext } from "@carlnotes/models/prompts/currentDayContext"
import { type BuiltPrompt, fetchPromptTemplate, promptTelemetry } from "@carlnotes/models/prompts/fetch"
import { writePrompt } from "@carlnotes/models/prompts/write"
import { reserveUserSpend, type SpendReservation } from "@carlnotes/models/spendReservations"
import { generateText, NoObjectGeneratedError, Output } from "ai"
import { eq, sql } from "drizzle-orm"
import type { EmbeddedTopicMemoryWrite } from "./applyTopicMemoryWrite"
import { confirmTopicMemoryCleanupPairs } from "./topicMemoryCleanupReview"
import { loadTopicMemoryFindings, loadTopicMemoryNeighbors, loadTopicMemoryScan } from "./topicMemoryEvidence"
import {
	type TopicMemoryWrite,
	topicMemoryProposal,
	toTopicMemoryClusters,
	toTopicMemoryWrite,
} from "./topicMemoryOperations"
import { recordTopicMemorySpend, saveTopicMemoryUpdates } from "./topicMemoryWrites"

// allow for thirty proposal calls plus three cleanup batches
const MAX_TAKEAWAY_UPDATE_DOLLARS = 0.06
const MAX_OUTPUT_TOKENS = 1900
const CONCURRENT_CLUSTERS = 4
const SPEND_PAUSED = Symbol("Topic memory spend paused")

type TopicTakeawayUpdateOutcome = "skipped" | "paused" | "updated"
type Finding = Awaited<ReturnType<typeof loadTopicMemoryFindings>>[number]
type EmbeddedFinding = Omit<Finding, "embedding" | "embeddingModel"> & { embedding: number[] }
type ClusterProposal = TopicMemoryWrite & { findingIds: string[] }
type TopicScope = { name: string; prompt: string }
type TopicTakeawayUpdateInput = { scanId: string; topicId: string; scanStartedAt: Date; signal: AbortSignal }
type TopicTakeawayModelInput = Pick<TopicTakeawayUpdateInput, "scanId" | "signal"> & { litellmApiKey: string }

/** Updates takeaways after a completed Scan. A spend pause skips the Scan without queuing historical work. */
export async function updateTopicTakeaways(scanId: string, signal: AbortSignal): Promise<TopicTakeawayUpdateOutcome> {
	// an activity retry and a backfill share the same scan lease and transactional completion mark
	signal.throwIfAborted()
	const result = await runWithJobLease({
		jobName: `topic-memories:${scanId}`,
		runTask: (leaseSignal) => updateTakeawaysFromScan(scanId, AbortSignal.any([signal, leaseSignal])),
	})
	if (result !== null) {
		return result
	}

	// a concurrent lease can end without committing. retry unless the Scan is already finished
	const scan = await loadTopicMemoryScan(scanId)
	if (!scan?.topicId || scan.topicMemoriesUpdatedAt) {
		return "skipped"
	}
	throw new Error("Another attempt holds the takeaway update lease")
}

async function updateTakeawaysFromScan(scanId: string, signal: AbortSignal): Promise<TopicTakeawayUpdateOutcome> {
	// keep legacy personal-source imports outside the Journal and pause with free scans
	const scan = await loadTopicMemoryScan(scanId)
	if (!scan?.topicId || scan.topicMemoriesUpdatedAt || (await hasUnconvertedPersonalSources(scan.topicId))) {
		return "skipped"
	}
	if (await isUserPastDailySpendCutoff(scan.ownerId, "scheduledScans")) {
		return "paused"
	}

	// a Scan with no eligible Findings can still trigger cleanup and age out old takeaways
	const input = { scanId, topicId: scan.topicId, scanStartedAt: scan.startedAt, signal }
	const findings = scan.topicMemoriesWrittenAt ? [] : await loadTopicMemoryFindings(scanId, scan.topicId)
	return proposeAndSaveTakeaways({ ...input, ownerId: scan.ownerId, findings })
}

async function proposeAndSaveTakeaways({
	ownerId,
	findings,
	...input
}: TopicTakeawayUpdateInput & {
	ownerId: string
	findings: Finding[]
}): Promise<TopicTakeawayUpdateOutcome> {
	// hold spend until all paid calls settle and each one's cost is recorded
	let reservation: SpendReservation | undefined
	let apiKey: string | undefined
	const loadModelKey = async (): Promise<string> => {
		input.signal.throwIfAborted()
		if (!apiKey) {
			const spend = await reserveUserSpend({
				userId: ownerId,
				kind: "topicMemories",
				maxDollars: MAX_TAKEAWAY_UPDATE_DOLLARS,
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
		// reserve and provision only if the Scan has proposals or cleanup pairs to ask about
		const writes = findings.length
			? await proposeTopicMemoryWrites({ ...input, findings, litellmApiKey: await loadModelKey() })
			: []
		await saveTopicMemoryUpdates({
			...input,
			writes,
			confirmCleanup: async (pairs) =>
				confirmTopicMemoryCleanupPairs({ ...input, pairs, litellmApiKey: await loadModelKey() }),
		})
		return "updated"
	} catch (error) {
		// report cancellation or lease loss before classifying a provider failure
		input.signal.throwIfAborted()
		if (error === SPEND_PAUSED || isBudgetRejection(error)) {
			return "paused"
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
}: TopicTakeawayUpdateInput & {
	findings: Finding[]
	litellmApiKey: string
}): Promise<EmbeddedTopicMemoryWrite[]> {
	if (findings.length === 0) {
		return []
	}
	// reuse Resource vectors and embed only the public Finding text for missing or older vectors
	const modelInput = { scanId: input.scanId, signal: input.signal, litellmApiKey }
	const [[scope], vectors] = await Promise.all([
		db
			.select({ name: topics.name, prompt: sql<string>`left(${topics.prompt}, 2400)` })
			.from(topics)
			.where(eq(topics.id, input.topicId)),
		toEmbeddedFindings(findings, modelInput),
	])
	const clusters = toTopicMemoryClusters(vectors)
	const proposals: ClusterProposal[] = []
	for (const batch of toChunks(clusters, CONCURRENT_CLUSTERS)) {
		input.signal.throwIfAborted()
		const results = await Promise.allSettled(
			batch.map((cluster) => proposeClusterChange({ ...input, cluster, litellmApiKey, scope })),
		)
		for (const result of results) {
			if (result.status === "rejected") {
				throw result.reason
			}
			// an invalid model proposal leaves the other proposals in this batch intact
			proposals.push(...result.value)
		}
	}

	// compare what will actually be stored, using a fresh vector for each proposed statement
	const embeddings = await embedTopicMemoryTexts(
		proposals.map(({ text }) => text),
		modelInput,
	)
	return proposals.map((proposal, index) => ({ ...proposal, embedding: requireEmbedding(embeddings[index]) }))
}

async function toEmbeddedFindings(
	findings: Finding[],
	modelInput: TopicTakeawayModelInput,
): Promise<EmbeddedFinding[]> {
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

async function embedTopicMemoryTexts(
	texts: string[],
	{ scanId, signal, litellmApiKey }: TopicTakeawayModelInput,
): Promise<number[][]> {
	if (texts.length === 0) {
		return []
	}
	// charge embedding work to the Scan before its results are applied
	signal.throwIfAborted()
	const embeddings = await embedVectors(texts, { litellmApiKey, maxRetries: 0, abortSignal: signal })
	const tokens = texts.reduce((sum, text) => sum + toEstimatedTokens(text.length), 0)
	await recordTopicMemorySpend(scanId, tokenCost(tokens, EMBED_COST_PER_MILLION_TOKENS))
	return embeddings
}

async function proposeClusterChange({
	cluster,
	topicId,
	scanId,
	scanStartedAt,
	litellmApiKey,
	signal,
	scope,
}: TopicTakeawayUpdateInput & {
	cluster: EmbeddedFinding[]
	litellmApiKey: string
	scope?: TopicScope
}): Promise<ClusterProposal[]> {
	// average the cluster's Resource vectors to retrieve its five neighbors and strip vectors from model input
	const embedding = cluster[0]?.embedding.map(
		(_, index) => cluster.reduce((sum, finding) => sum + (finding.embedding[index] ?? 0), 0) / cluster.length,
	)
	const neighbors = await loadTopicMemoryNeighbors(topicId, requireEmbedding(embedding))
	const builtPrompt = await buildTopicMemoryProposalPrompt({
		findings: cluster.map(({ title, snippet, description }) => ({ title, snippet, description })),
		neighbors,
		scanStartedAt,
		scope,
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
		})
		await recordTopicMemorySpend(scanId, tokenCost(result.usage.totalTokens ?? 0, CHEAP_COST_PER_MILLION_TOKENS))
		const currentFactIds = new Set(neighbors.filter(({ isAtomic }) => isAtomic).map(({ id }) => id))
		return result.output.facts.flatMap((proposal) => {
			const findingIds = [...new Set(proposal.sourceFindingIndexes.map((index) => cluster[index]?.id))]
			if (findingIds.some((id) => id === undefined)) {
				return []
			}
			const write = toTopicMemoryWrite(proposal, currentFactIds)
			return write ? [{ ...write, findingIds: findingIds.filter((id): id is string => Boolean(id)) }] : []
		})
	} catch (error) {
		// discard only this cluster when the model returns an invalid proposal
		if (NoObjectGeneratedError.isInstance(error)) {
			await recordTopicMemorySpend(scanId, tokenCost(error.usage?.totalTokens ?? 0, CHEAP_COST_PER_MILLION_TOKENS))
			return []
		}
		throw error
	}
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
}: {
	findings: Pick<Finding, "title" | "snippet" | "description">[]
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
}): Promise<BuiltPrompt> {
	// keep the current day separate from the observation dates when a historical Scan runs through backfill
	const [{ template, name, registryPrompt }, currentDayBlock] = await Promise.all([
		fetchPromptTemplate("propose-topic-takeaways"),
		loadCurrentDayContext(now),
	])
	const datedNeighbors = neighbors.map(({ lastSeenAt, ...neighbor }) => ({
		...neighbor,
		lastSeenDay: toUtcDay(lastSeenAt),
	}))
	const prompt = writePrompt(
		template,
		{
			indexedFindings: JSON.stringify(findings.map((finding, index) => ({ index, ...finding }))),
			matchingMemories: JSON.stringify(datedNeighbors),
			topicScope: JSON.stringify(scope ?? null),
		},
		{ currentDayBlock, scanDay: toUtcDay(scanStartedAt) },
	)
	return { prompt, name, registryPrompt }
}
