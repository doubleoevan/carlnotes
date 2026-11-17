// extracts a group of similar public Findings into source-linked topic memory drafts
import { toUtcDay } from "@carlnotes/contracts/time"
import { toNamedTopicMemoryText, topicMemoryClaimTypes } from "@carlnotes/contracts/topicMemories"
import { CHEAP_COST_PER_MILLION_TOKENS, premiumModelCost, tokenCost } from "@carlnotes/models/budget"
import { isRetryableModelCallError } from "@carlnotes/models/modelCallRetry"
import {
	cheapModel,
	isModelAuthenticationRejection,
	LOW_REASONING_PROVIDER_OPTIONS,
	scoreModel,
} from "@carlnotes/models/models"
import { PRIVATE_MODEL_OPTIONS } from "@carlnotes/models/privateModelOptions"
import { loadCurrentDayContext } from "@carlnotes/models/prompts/currentDayContext"
import { type BuiltPrompt, fetchPromptTemplate, promptTelemetry } from "@carlnotes/models/prompts/fetch"
import { writePrompt } from "@carlnotes/models/prompts/write"
import { generateText, NoObjectGeneratedError, NoOutputGeneratedError, Output } from "ai"
import { isPromoted } from "./review/scorePolicy"
import { loadTopicMemoryNeighbors, type TopicMemoryFinding } from "./topicMemoryEvidence"
import { type TopicMemoryWrite, topicMemoryDraftResponse, toTopicMemoryDraft } from "./topicMemoryOperations"
import type { loadTopicMemoryReconciliationJournal } from "./topicMemoryReconciliation"
import { recordTopicMemorySpend } from "./topicMemorySpend"
import { resolveTopicMemorySubject, supportsTopicMemoryAlias, type TopicMemorySubject } from "./topicMemorySubjects"

// reserve time for claim validation and writes after optional extraction
const MAX_OUTPUT_TOKENS = 1900
const PREMIUM_EXTRACTION_TIMEOUT_MS = 20_000

// source vectors group Findings and source IDs keep each draft tied to its evidence
export type EmbeddedTopicMemoryFinding = Omit<TopicMemoryFinding, "embedding" | "embeddingModel"> & {
	embedding: number[]
}
export type TopicMemoryDraft = TopicMemoryWrite & { findingIds: string[] }
type TopicScope = { name: string; prompt: string }
type TopicMemoryDraftInput = {
	scanId: string
	topicId: string
	scanStartedAt: Date
	signal: AbortSignal
	litellmApiKey: string
}

/**
 * Extracts source-linked drafts from a group of similar Findings.
 */
export async function draftTopicMemoriesFromFindings({
	relatedFindings,
	topicId,
	scanId,
	scanStartedAt,
	litellmApiKey,
	signal,
	scope,
	subjects,
	ratedMemories,
	reservePremiumRetry,
}: TopicMemoryDraftInput & {
	relatedFindings: EmbeddedTopicMemoryFinding[]
	scope?: TopicScope
	subjects: TopicMemorySubject[]
	ratedMemories?: Awaited<ReturnType<typeof loadTopicMemoryReconciliationJournal>>
	reservePremiumRetry: () => boolean
}): Promise<TopicMemoryDraft[]> {
	// only draft memories when the request has evidence
	const [firstFinding] = relatedFindings
	if (!firstFinding) {
		return []
	}

	// fetch neighbors only when the Journal exceeds the reconciliation budget
	const embedding = firstFinding.embedding.map(
		(_, index) =>
			relatedFindings.reduce((sum, finding) => sum + (finding.embedding[index] ?? 0), 0) / relatedFindings.length,
	)
	const neighbors = ratedMemories ?? (await loadTopicMemoryNeighbors(topicId, embedding))
	const builtPrompt = await buildTopicMemoryDraftPrompt({
		findings: relatedFindings.map(
			({ title, snippet, description, relevanceScore, rating, articleContext, publicationDateHint }) => ({
				title,
				snippet,
				description,
				relevanceScore,
				rating,
				articleContext,
				publicationDateHint,
			}),
		),
		neighbors,
		scanStartedAt,
		scope,
		subjects,
	})

	// give a positively rated or promoted Finding a second extraction when the first has no usable draft
	const draftInput = { scanId, litellmApiKey, signal, relatedFindings, subjects, builtPrompt }
	const drafts = await generateTopicMemoryDrafts(draftInput, false)
	if (
		drafts.length ||
		!relatedFindings.some(({ rating, relevanceScore }) => rating === "up" || isPromoted(relevanceScore)) ||
		!reservePremiumRetry()
	) {
		return drafts
	}
	return generateTopicMemoryDrafts(draftInput, true)
}

async function generateTopicMemoryDrafts(
	{
		scanId,
		litellmApiKey,
		signal,
		relatedFindings,
		subjects,
		builtPrompt,
	}: Pick<TopicMemoryDraftInput, "scanId" | "litellmApiKey" | "signal"> & {
		relatedFindings: EmbeddedTopicMemoryFinding[]
		subjects: TopicMemorySubject[]
		builtPrompt: BuiltPrompt
	},
	usePremiumModel: boolean,
): Promise<TopicMemoryDraft[]> {
	// charge failed structured outputs when they report usage
	const cost = (usage: Parameters<typeof premiumModelCost>[0]): number =>
		usePremiumModel ? premiumModelCost(usage) : tokenCost(usage.totalTokens ?? 0, CHEAP_COST_PER_MILLION_TOKENS)
	const result = await generateText({
		model: usePremiumModel ? scoreModel(litellmApiKey) : cheapModel(litellmApiKey),
		providerOptions: usePremiumModel ? LOW_REASONING_PROVIDER_OPTIONS : undefined,
		prompt: builtPrompt.prompt,
		output: Output.object({ schema: topicMemoryDraftResponse }),
		abortSignal: usePremiumModel
			? AbortSignal.any([signal, AbortSignal.timeout(PREMIUM_EXTRACTION_TIMEOUT_MS)])
			: signal,
		maxRetries: 0,
		maxOutputTokens: MAX_OUTPUT_TOKENS,
		...promptTelemetry(builtPrompt),
		...PRIVATE_MODEL_OPTIONS,
	}).catch(async (error: unknown) => {
		// account for usage the SDK reported before propagating cancellation
		const hasInvalidOutput = !isModelAuthenticationRejection(error) && NoObjectGeneratedError.isInstance(error)
		if (hasInvalidOutput && error.usage) {
			await recordTopicMemorySpend(scanId, cost(error.usage))
		}
		signal.throwIfAborted()

		// let the other Finding groups continue when the optional pass hits a transient model error
		if (usePremiumModel && isRetryableModelCallError(error)) {
			console.warn("Premium topic memory extraction failed temporarily", { scanId })
			return null
		}

		if (hasInvalidOutput || NoOutputGeneratedError.isInstance(error)) {
			return null
		}
		throw error
	})
	if (!result) {
		return []
	}

	// map citations back to the indexed public Findings in this request
	await recordTopicMemorySpend(scanId, cost(result.usage))
	const output = readTopicMemoryDraftOutput(result)
	return (output?.facts ?? []).flatMap((draft) => {
		const findingIds = [...new Set(draft.sourceFindingIndexes.map((index) => relatedFindings[index]?.id))]
		if (findingIds.some((id) => id === undefined)) {
			return []
		}
		const write = toTopicMemoryDraft(draft)
		if (!write) {
			return []
		}
		const subjectAlias = validateProposedSubjectAlias({
			write,
			alias: draft.subjectAlias,
			relatedFindings,
			subjects,
			findingIds,
		})
		return [{ ...write, subjectAlias, findingIds: findingIds.filter((id): id is string => Boolean(id)) }]
	})
}

// the SDK can resolve with usage while its output getter still throws for an empty response
function readTopicMemoryDraftOutput<DraftOutput>(result: { output: DraftOutput }): DraftOutput | undefined {
	try {
		return result.output
	} catch (error) {
		if (!NoOutputGeneratedError.isInstance(error)) {
			throw error
		}
	}
}

// require the canonical subject and an exact quote from a linked Finding before recording an alias
function validateProposedSubjectAlias({
	write,
	alias,
	relatedFindings,
	subjects,
	findingIds,
}: {
	write: TopicMemoryWrite
	alias: { observedName: string; quote: string; sourceFindingIndex: number } | null | undefined
	relatedFindings: EmbeddedTopicMemoryFinding[]
	subjects: TopicMemorySubject[]
	findingIds: (string | undefined)[]
}): TopicMemoryWrite["subjectAlias"] {
	const canonical = resolveTopicMemorySubject(write, subjects)
	const source = alias && relatedFindings[alias.sourceFindingIndex]
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

/** Builds a draft prompt for similar Findings and its bounded neighbors. */
export async function buildTopicMemoryDraftPrompt({
	findings,
	neighbors,
	scanStartedAt,
	now,
	scope,
	subjects = [],
}: {
	findings: Pick<
		TopicMemoryFinding,
		"title" | "snippet" | "description" | "relevanceScore" | "rating" | "articleContext" | "publicationDateHint"
	>[]
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
