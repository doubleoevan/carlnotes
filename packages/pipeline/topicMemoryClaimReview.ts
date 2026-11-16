// checks claim boundaries and splits compound wording before embedding
import { toChunks } from "@carlnotes/contracts/arrays"
import { topicMemoryClaimTypes } from "@carlnotes/contracts/topicMemories"
import { db } from "@carlnotes/db"
import { CHEAP_COST_PER_MILLION_TOKENS, premiumModelCost, tokenCost } from "@carlnotes/models/budget"
import {
	cheapModel,
	isModelAuthenticationRejection,
	LOW_REASONING_PROVIDER_OPTIONS,
	scoreModel,
} from "@carlnotes/models/models"
import { PRIVATE_MODEL_OPTIONS } from "@carlnotes/models/privateModelOptions"
import { type BuiltPrompt, fetchPromptTemplate, promptTelemetry } from "@carlnotes/models/prompts/fetch"
import { writePrompt } from "@carlnotes/models/prompts/write"
import { generateText, NoObjectGeneratedError, Output } from "ai"
import { z } from "zod"
import { loadTopicMemoryFindingEvidence } from "./topicMemoryEvidence"
import {
	structuredTopicMemoryClaim,
	type TopicMemoryWrite,
	toStandaloneTopicMemory,
	toTopicMemoryEmbeddingText,
	toTopicMemoryWrite,
} from "./topicMemoryOperations"
import { recordTopicMemorySpend } from "./topicMemorySpend"
import type { TopicMemorySubject } from "./topicMemorySubjects"

const CLAIMS_PER_CHECK = 10
const CLAIM_REVIEW_CONCURRENCY = 4
const FINDINGS_PER_SPLIT = 12
export const FEEDBACK_PER_SPLIT = 20

// pitches and editor notes stay outside the structured claim boundary
const claimVerdict = z.enum(["single", "compound", "incomplete", "nonclaim"])
const claimFields = structuredTopicMemoryClaim.pick({ subject: true, claimType: true, value: true })
const checkedClaim = z.object({
	index: z.number().int(),
	verdict: claimVerdict,
	fields: claimFields.nullable().optional(),
})
const checkedClaims = z.object({ claims: z.array(checkedClaim) })
const splitClaim = structuredTopicMemoryClaim.extend({
	feedbackIndexes: z.array(z.number().int().min(0)).max(FEEDBACK_PER_SPLIT),
})
const splitClaims = z.object({ claims: z.array(splitClaim).max(8) })

type ClaimVerdict = z.infer<typeof claimVerdict>
type CheckedClaim = z.infer<typeof checkedClaim>
type Claim = Pick<TopicMemoryWrite, "text" | "factDate" | "person">
export type TopicMemoryClaimFinding = {
	id: string
	title: string | null
	snippet: string | null
	description: string
	articleContext?: string | null
	publicationDateHint?: string | null
}
type ClaimFeedback = { rating: "up" | "down"; note: string | null }
type ClaimModelInput = { litellmApiKey: string; signal: AbortSignal; scanId?: string }
type ClaimCheck = ClaimModelInput & {
	claims: Claim[]
	usePremiumModel?: boolean
	extractFields?: boolean
	subjects?: TopicMemorySubject[]
}
type ClaimSplit = ClaimModelInput & {
	claim: Claim
	findings: TopicMemoryClaimFinding[]
	feedback?: ClaimFeedback[]
	subjects?: TopicMemorySubject[]
}
type SplitClaim = Claim &
	Pick<TopicMemoryWrite, "subject" | "claimType" | "value"> & { findingIds: string[]; feedbackIndexes: number[] }

export type TopicMemoryClaimCounts = { checked: number; split: number; rejected: number }
type ProposedClaim = TopicMemoryWrite & { findingIds: string[] }

/**
 * Checks a Scan's proposals and returns only claims classified as single.
 */
export async function validateTopicMemoryClaims({
	proposals,
	findings,
	topicId,
	...input
}: ClaimModelInput & { topicId?: string; proposals: ProposedClaim[]; findings: TopicMemoryClaimFinding[] }): Promise<{
	writes: ProposedClaim[]
	counts: TopicMemoryClaimCounts
}> {
	// retain original order so otherwise identical drafts keep stable write priority
	const verdicts = await checkTopicMemoryClaims({ ...input, claims: proposals })
	const findingsById = new Map(findings.map((finding) => [finding.id, finding]))
	const checked = await reviewInBatches(
		proposals.map((proposal, index) => ({ proposal, verdict: verdicts[index] })),
		async ({ proposal, verdict }) => {
			if (verdict === "nonclaim" || verdict === undefined) {
				return { writes: [], split: 0 }
			}

			// present-tense status from a dated report needs the source's observation date
			const standalone = toStandaloneTopicMemory(proposal)
			let evidence = proposal.findingIds.flatMap((id) => findingsById.get(id) ?? [])
			const needsDate = needsDatedTopicMemoryContext(standalone?.text, evidence)
			const needsRewrite = !standalone || verdict === "incomplete" || needsDate
			if (verdict === "single" && standalone && !needsRewrite && toTopicMemoryEmbeddingText(standalone.text)) {
				return { writes: [standalone], split: 0 }
			}

			// resolve missing details once against the linked public article excerpts
			if (topicId && needsRewrite) {
				const articles = await loadTopicMemoryFindingEvidence(topicId, proposal.findingIds, db, proposal.text)
				evidence = [...articles].map(([id, context]) => ({ id, ...context }))
			}
			const splits = await splitTopicMemoryClaim({ ...input, claim: proposal, findings: evidence })
			return {
				writes: splits.map(({ feedbackIndexes: _feedbackIndexes, ...claim }) => ({
					...claim,
					kind: proposal.kind,
					importance: proposal.importance,
					operation: "add" as const,
				})),
				split: Number(splits.length > 1),
			}
		},
	)
	return {
		writes: checked.flatMap(({ writes }) => writes),
		counts: {
			checked: proposals.length,
			split: checked.reduce((count, row) => count + row.split, 0),
			rejected: checked.filter(({ writes }) => !writes.length).length,
		},
	}
}

// a date matters for statuses described in an older article
function needsDatedTopicMemoryContext(text: string | undefined, findings: TopicMemoryClaimFinding[]): boolean {
	return Boolean(
		text &&
			(hasUndatedResidenceClaim(text) ||
				(/\b(?:is based in|works at|serves as)\b/i.test(text) &&
					findings.some(({ publicationDateHint }) => publicationDateHint))),
	)
}

// an undated Finding cannot establish that someone still lives there
function hasUndatedResidenceClaim(text: string): boolean {
	return /\b(?:lives in|resides in)\b/i.test(text) && !/\bas of\b/i.test(text)
}

/**
 * Gives one classification per text, with a separately routed model for eval auditing.
 */
export async function checkTopicMemoryClaims(input: ClaimCheck): Promise<ClaimVerdict[]> {
	return (await inspectTopicMemoryClaims(input)).map(({ verdict }) => verdict)
}

/** Checks stored statements in batches and extracts fields when requested by the repair. */
export async function inspectTopicMemoryClaims({
	claims,
	usePremiumModel = false,
	...input
}: ClaimCheck): Promise<CheckedClaim[]> {
	const batches = await reviewInBatches(toChunks(claims, CLAIMS_PER_CHECK), async (batch) => {
		const verdicts = await readClaimVerdicts({ ...input, claims: batch, usePremiumModel })
		if (verdicts) {
			return verdicts
		}
		// a smaller retry restores index coverage after a truncated or invalid response
		const retry: CheckedClaim[] = []
		for (const claims of toChunks(batch, Math.max(1, Math.ceil(batch.length / 2)))) {
			const checked = await readClaimVerdicts({ ...input, claims, usePremiumModel: true })
			if (!checked) {
				throw new Error("The topic memory claim check returned incomplete verdicts")
			}
			retry.push(...checked)
		}
		return retry
	})
	return batches.flat()
}

async function readClaimVerdicts({
	claims,
	usePremiumModel,
	extractFields,
	subjects,
	...input
}: ClaimCheck): Promise<CheckedClaim[] | undefined> {
	const prompt = await buildTopicMemoryClaimCheckPrompt(claims, extractFields, subjects)
	const output = await generateClaimOutput({
		...input,
		prompt,
		schema: checkedClaims,
		maxOutputTokens: extractFields ? 2700 : 1200,
		usePremiumModel,
	})
	// invalid, missing, or repeated indexes cannot approve any claim
	const verdicts = new Map(output?.claims.map((claim) => [claim.index, claim]))
	return output?.claims.length === claims.length &&
		verdicts.size === claims.length &&
		claims.every((_, index) => verdicts.has(index))
		? claims.map((_, index) => verdicts.get(index) as CheckedClaim)
		: undefined
}

async function reviewInBatches<Input, Result>(
	inputs: Input[],
	review: (input: Input) => Promise<Result>,
): Promise<Result[]> {
	// let in-flight calls settle before releasing the Scan's budget or retrying it
	const results: Result[] = []
	for (const batch of toChunks(inputs, CLAIM_REVIEW_CONCURRENCY)) {
		const settled = await Promise.allSettled(batch.map(review))
		for (const result of settled) {
			if (result.status === "rejected") {
				throw result.reason
			}
			results.push(result.value)
		}
	}
	return results
}

/**
 * Splits one topic memory, rejecting unsupported or still-compound results.
 */
export async function splitTopicMemoryClaim({
	claim,
	findings,
	feedback = [],
	subjects,
	requireCompleteRewrite = false,
	...input
}: ClaimSplit & { requireCompleteRewrite?: boolean }): Promise<SplitClaim[]> {
	if (!findings.length) {
		return []
	}

	// show only source fields and opaque indexes. keep user and database identities in code
	const evidence = findings.slice(0, FINDINGS_PER_SPLIT)
	const notes = feedback.slice(0, FEEDBACK_PER_SPLIT)
	const prompt = await buildTopicMemorySplitPrompt({ claim, findings: evidence, feedback: notes, subjects })
	const request = { ...input, prompt, schema: splitClaims, maxOutputTokens: 2350 }
	const output =
		(await generateClaimOutput(request)) ?? (await generateClaimOutput({ ...request, usePremiumModel: true }))
	if (!output) {
		throw new Error("The topic memory split returned unreadable claims")
	}
	const candidates = output.claims.flatMap((part) => {
		const sourceIds = part.sourceFindingIndexes.map((index) => evidence[index]?.id)
		const write = toTopicMemoryWrite({ ...part, kind: "fact", importance: 0, operation: "add" })
		if (!write || !toTopicMemoryEmbeddingText(write.text) || sourceIds.some((id) => !id?.length)) {
			return []
		}
		return [
			{
				text: write.text,
				factDate: write.factDate,
				person: write.person,
				subject: write.subject,
				claimType: write.claimType,
				value: write.value,
				findingIds: [...new Set(sourceIds.filter((id): id is string => Boolean(id)))],
				feedbackIndexes: part.feedbackIndexes.filter((index) => Boolean(notes[index]?.note)),
			},
		]
	})

	// validate the rewritten prose in a fresh model call before any fragment can be saved
	const verdicts = await checkTopicMemoryClaims({ ...input, claims: candidates })
	const checked = candidates.filter(
		({ text }, index) => verdicts[index] === "single" && !hasUndatedResidenceClaim(text),
	)
	return requireCompleteRewrite && checked.length !== output.claims.length ? [] : checked
}

/**
 * Fences only the claim text and its own factual fields.
 */
export async function buildTopicMemoryClaimCheckPrompt(
	claims: Claim[],
	extractFields = false,
	subjects: TopicMemorySubject[] = [],
): Promise<BuiltPrompt> {
	const { template, name, registryPrompt } = await fetchPromptTemplate("check-topic-memory-claims")
	const indexed = claims.map(({ text, factDate, person }, index) => ({
		index,
		text: toStandaloneTopicMemory({ text, person })?.text ?? text,
		factDate,
		person,
	}))
	return {
		prompt: writePrompt(
			template,
			{ claims: JSON.stringify(indexed), existingSubjects: JSON.stringify(subjects) },
			{ extractFields: extractFields ? "yes" : "no", claimTypes: topicMemoryClaimTypes.join(", ") },
		),
		name,
		registryPrompt,
	}
}

/**
 * Fences the original claim, eligible evidence, and the notes needed for routing.
 */
export async function buildTopicMemorySplitPrompt({
	claim,
	findings,
	feedback,
	subjects,
}: Pick<ClaimSplit, "claim" | "findings" | "feedback" | "subjects">): Promise<BuiltPrompt> {
	const { template, name, registryPrompt } = await fetchPromptTemplate("split-topic-memory")
	const { text, factDate, person } = claim
	const topicMemoryAndEvidence = JSON.stringify({
		original: { text, factDate, person },
		existingSubjects: subjects,
		findings: findings.map(({ title, snippet, description, articleContext, publicationDateHint }, index) => ({
			index,
			title,
			snippet,
			description,
			articleContext,
			publicationDateHint,
		})),
		feedback: feedback?.map(({ note, rating }, index) => ({ index, note, rating })),
	})
	return {
		prompt: writePrompt(template, { topicMemoryAndEvidence }, { claimTypes: topicMemoryClaimTypes.join(", ") }),
		name,
		registryPrompt,
	}
}

async function generateClaimOutput<Value>({
	prompt,
	schema,
	maxOutputTokens,
	litellmApiKey,
	signal,
	scanId,
	usePremiumModel = false,
}: ClaimModelInput & {
	prompt: BuiltPrompt
	schema: z.ZodType<Value>
	maxOutputTokens: number
	usePremiumModel?: boolean
}): Promise<Value | undefined> {
	// the caller owns the Scan reservation. the dev repair uses the operator key
	signal.throwIfAborted()
	const charge = async (usage: {
		totalTokens?: number
		inputTokens?: number
		outputTokens?: number
	}): Promise<void> => {
		if (scanId) {
			const cost = usePremiumModel
				? premiumModelCost(usage)
				: tokenCost(usage.totalTokens ?? 0, CHEAP_COST_PER_MILLION_TOKENS)
			await recordTopicMemorySpend(scanId, cost)
		}
	}
	try {
		const result = await generateText({
			model: usePremiumModel ? scoreModel(litellmApiKey) : cheapModel(litellmApiKey),
			providerOptions: usePremiumModel ? LOW_REASONING_PROVIDER_OPTIONS : undefined,
			prompt: prompt.prompt,
			output: Output.object({ schema }),
			maxOutputTokens: usePremiumModel ? 2600 : maxOutputTokens,
			maxRetries: 0,
			abortSignal: signal,
			...promptTelemetry(prompt),
			...PRIVATE_MODEL_OPTIONS,
		})
		await charge(result.usage)
		return result.output
	} catch (error) {
		if (!isModelAuthenticationRejection(error) && NoObjectGeneratedError.isInstance(error)) {
			await charge(error.usage ?? {})
			return undefined
		}
		throw error
	}
}
