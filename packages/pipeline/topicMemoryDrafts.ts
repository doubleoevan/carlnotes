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
import { loadTopicMemoryClaimBlocks } from "@carlnotes/models/prompts/topicMemoryClaimBlocks"
import { writePrompt } from "@carlnotes/models/prompts/write"
import { generateText, NoObjectGeneratedError, NoOutputGeneratedError, Output } from "ai"
import { isPromoted } from "./review/scorePolicy"
import { loadTopicMemoryNeighbors, type TopicMemoryFinding } from "./topicMemoryEvidence"
import { runTopicMemoryModelCall, type TopicMemoryModelInput } from "./topicMemoryModelCall"
import { type TopicMemoryWrite, topicMemoryDraftResponse, toTopicMemoryDraft } from "./topicMemoryOperations"
import type { loadTopicMemoryReconciliationJournal } from "./topicMemoryReconciliation"
import { canSpendOnTopicMemories, chargeTopicMemorySpend } from "./topicMemorySpend"
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
type TopicMemoryDraftInput = TopicMemoryModelInput & { scanId: string; topicId: string; scanStartedAt: Date }

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
	spend,
	waitDeadlineAt,
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

	// give a positively rated or promoted Finding a second extraction when the first has no usable draft, unless the
	// update is at its spend limit
	const modelInput = { litellmApiKey, signal, spend, waitDeadlineAt }
	const draftInput = { ...modelInput, scanId, relatedFindings, subjects, builtPrompt }
	const drafts = await generateTopicMemoryDrafts(draftInput, false)
	// the first drafts stand if there are any, if no Finding was rated up or promoted, or if no retry can be paid for
	if (
		drafts.length ||
		!relatedFindings.some(({ rating, relevanceScore }) => rating === "up" || isPromoted(relevanceScore)) ||
		!canSpendOnTopicMemories(spend) ||
		!reservePremiumRetry()
	) {
		return drafts
	}
	// the second extraction asks the premium model
	return generateTopicMemoryDrafts(draftInput, true)
}

async function generateTopicMemoryDrafts(
	{
		scanId,
		litellmApiKey,
		signal,
		spend,
		waitDeadlineAt,
		relatedFindings,
		subjects,
		builtPrompt,
	}: Pick<TopicMemoryDraftInput, "scanId" | "litellmApiKey" | "signal" | "spend" | "waitDeadlineAt"> & {
		relatedFindings: EmbeddedTopicMemoryFinding[]
		subjects: TopicMemorySubject[]
		builtPrompt: BuiltPrompt
	},
	usePremiumModel: boolean,
): Promise<TopicMemoryDraft[]> {
	// charge failed structured outputs when they report usage
	const cost = (usage: Parameters<typeof premiumModelCost>[0]): number =>
		usePremiumModel ? premiumModelCost(usage) : tokenCost(usage.totalTokens ?? 0, CHEAP_COST_PER_MILLION_TOKENS)
	// a rate limit waits and tries the extraction again. the optional premium pass gets a wait deadline that has
	// passed, so it makes one attempt, because its transient failure is skipped below
	const extraction = runTopicMemoryModelCall({ signal, waitDeadlineAt: usePremiumModel ? 0 : waitDeadlineAt }, () =>
		generateText({
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
		}),
	)
	const extractionResult = await extraction.catch(async (error: unknown) => {
		// account for usage the SDK reported before propagating cancellation
		const hasInvalidOutput = !isModelAuthenticationRejection(error) && NoObjectGeneratedError.isInstance(error)
		if (hasInvalidOutput && error.usage) {
			chargeTopicMemorySpend(spend, cost(error.usage))
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
	if (!extractionResult) {
		return []
	}

	// map citations back to the indexed public Findings in this request
	chargeTopicMemorySpend(spend, cost(extractionResult.usage))
	const output = readTopicMemoryDraftOutput(extractionResult)
	return (output?.facts ?? []).flatMap((draft) => {
		const findingIds = [...new Set(draft.sourceFindingIndexes.map((index) => relatedFindings[index]?.id))]
		// a draft that cites an index outside the request is dropped
		if (findingIds.some((id) => id === undefined)) {
			return []
		}
		// a draft that makes no valid write is dropped too
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
		// any other error is thrown, and an empty response returns nothing
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
	// the write, the alias that its draft proposed, the request's Findings, the known subjects, and the draft's Findings
	write: TopicMemoryWrite
	alias: { observedName: string; quote: string; sourceFindingIndex: number } | null | undefined
	relatedFindings: EmbeddedTopicMemoryFinding[]
	subjects: TopicMemorySubject[]
	findingIds: (string | undefined)[]
}): TopicMemoryWrite["subjectAlias"] {
	// the subject that the write resolves to, and the Finding that the alias cites
	const canonical = resolveTopicMemorySubject(write, subjects)
	const source = alias && relatedFindings[alias.sourceFindingIndex]
	// no alias without a cited Finding of the draft and a known subject
	if (
		!alias ||
		!source ||
		!findingIds.includes(source.id) ||
		!subjects.some((entry) => entry.subject === canonical.subject && entry.person === canonical.person)
	) {
		return
	}
	// the alias stands only if the Finding's own words support it
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
	const [{ template, name, registryPrompt }, currentDayBlock, topicMemoryClaimBlocks] = await Promise.all([
		fetchPromptTemplate("propose-topic-memories"),
		loadCurrentDayContext(now),
		loadTopicMemoryClaimBlocks(),
	])
	// a note holds its rater's private words and a proposed claim is shown to every reader, so only the thumbs go in
	const datedNeighbors = neighbors.flatMap(({ lastSeenAt, feedback, ...neighbor }) => {
		const text = toNamedTopicMemoryText(neighbor.text, neighbor.person)
		const ratings = feedback?.map(({ rating }) => rating)
		return text ? [{ ...neighbor, text, ratings, lastSeenDay: toUtcDay(lastSeenAt) }] : []
	})
	const prompt = writePrompt(
		template,
		{
			keptFindings: JSON.stringify(findings.map((finding, index) => ({ index, ...finding }))),
			matchingMemories: JSON.stringify(datedNeighbors),
			topicScope: JSON.stringify(scope ?? null),
			existingSubjects: JSON.stringify(subjects),
		},
		{
			currentDayBlock,
			...topicMemoryClaimBlocks,
			scanDay: toUtcDay(scanStartedAt),
			claimTypes: topicMemoryClaimTypes.join(", "),
		},
	)
	return { prompt, name, registryPrompt }
}
