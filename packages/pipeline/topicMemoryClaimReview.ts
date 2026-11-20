// checks claim boundaries and splits compound wording before embedding
import { toChunks } from "@carlnotes/contracts/arrays"
import { db } from "@carlnotes/db"
import { CHEAP_COST_PER_MILLION_TOKENS, premiumModelCost, tokenCost } from "@carlnotes/models/budget"
import {
	cheapModel,
	isModelAuthenticationRejection,
	LOW_REASONING_PROVIDER_OPTIONS,
	scoreModel,
} from "@carlnotes/models/models"
import { PRIVATE_MODEL_OPTIONS } from "@carlnotes/models/privateModelOptions"
import { type BuiltPrompt, promptTelemetry } from "@carlnotes/models/prompts/fetch"
import { generateText, NoObjectGeneratedError, Output } from "ai"
import { z } from "zod"
import {
	buildTopicMemoryClaimCheckPrompt,
	buildTopicMemorySplitPrompt,
	type TopicMemoryClaim,
	type TopicMemoryClaimFinding,
	type TopicMemorySplitPromptOptions,
} from "./topicMemoryClaimPrompts"
import { type ArticleReads, loadTopicMemoryFindingEvidence } from "./topicMemoryEvidence"
import { runTopicMemoryModelCall, type TopicMemoryModelInput } from "./topicMemoryModelCall"
import {
	structuredTopicMemoryClaim,
	type TopicMemoryWrite,
	toStandaloneTopicMemory,
	toTopicMemoryEmbeddingText,
	toTopicMemoryWrite,
} from "./topicMemoryOperations"
import { canSpendOnTopicMemories, chargeTopicMemorySpend } from "./topicMemorySpend"
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

// a verdict and a checked claim as the model returns them
type ClaimVerdict = z.infer<typeof claimVerdict>
type CheckedClaim = z.infer<typeof checkedClaim>

// a check's claims, its model tier, whether it extracts fields, and the known subjects
type ClaimCheck = TopicMemoryModelInput & {
	claims: TopicMemoryClaim[]
	usePremiumModel?: boolean
	extractFields?: boolean
	subjects?: TopicMemorySubject[]
}

// a split's claim, its Findings, its rating notes, and the known subjects
type ClaimSplit = TopicMemoryModelInput & TopicMemorySplitPromptOptions

// a claim that a split returned, with its fields, its Findings, and the notes it used
type SplitClaim = TopicMemoryClaim &
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
}: TopicMemoryModelInput & {
	// the Topic, the proposed claims, and the Scan's public Findings
	topicId?: string
	proposals: ProposedClaim[]
	findings: TopicMemoryClaimFinding[]
}): Promise<{
	writes: ProposedClaim[]
	counts: TopicMemoryClaimCounts
}> {
	// retain original order so otherwise identical drafts keep stable write priority
	const verdicts = await checkTopicMemoryClaims({ ...input, claims: proposals })
	const findingsById = new Map(findings.map((finding) => [finding.id, finding]))
	const articleReads: ArticleReads = new Map()
	const checked = await reviewInBatches(
		proposals.map((proposal, index) => ({ proposal, verdict: verdicts[index] })),
		() => true,
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

			// a claim that needs a rewrite is left out once the update is at its spend limit
			if (!canSpendOnTopicMemories(input.spend)) {
				return { writes: [], split: 0 }
			}

			// resolve missing details once against the linked public article excerpts
			if (topicId && needsRewrite) {
				const articles = await loadTopicMemoryFindingEvidence(
					topicId,
					proposal.findingIds,
					db,
					proposal.text,
					articleReads,
				)
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
	// an update at its spend limit checks no further batch, and an unchecked claim is not written
	const canCheck = (): boolean => canSpendOnTopicMemories(input.spend)
	const chunks = toChunks(claims, CLAIMS_PER_CHECK)
	const batches = await reviewInBatches(chunks, canCheck, async (batch) => {
		// check the whole batch in one call first
		const verdicts = await readClaimVerdicts({ ...input, claims: batch, usePremiumModel })
		if (verdicts) {
			return verdicts
		}
		// a smaller retry restores index coverage after a truncated or invalid response
		const retry: CheckedClaim[] = []
		for (const claims of toChunks(batch, Math.max(1, Math.ceil(batch.length / 2)))) {
			// a half at the spend limit is left unchecked
			if (!canCheck()) {
				break
			}
			const checked = await readClaimVerdicts({ ...input, claims, usePremiumModel: true })
			if (!checked) {
				throw new Error("The topic memory claim check returned incomplete verdicts")
			}
			// keep the half's verdicts in the batch's order
			retry.push(...checked)
		}
		return retry
	})
	// a batch that the spend limit cut short ends the checked claims, so each verdict keeps its claim's index
	const claimsInOrder: CheckedClaim[] = []
	for (const [index, batch] of batches.entries()) {
		claimsInOrder.push(...batch)
		// stop after the first batch that is missing a verdict
		if (batch.length < (chunks[index]?.length ?? 0)) {
			break
		}
	}
	return claimsInOrder
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

// review the inputs a few at a time, in order, and return the results of the batches that canStart let begin
async function reviewInBatches<Input, Result>(
	inputs: Input[],
	canStart: () => boolean,
	review: (input: Input) => Promise<Result>,
): Promise<Result[]> {
	// let in-flight calls settle before releasing the Scan's budget or retrying it
	const results: Result[] = []
	for (const batch of toChunks(inputs, CLAIM_REVIEW_CONCURRENCY)) {
		// start no batch once the caller says to stop
		if (!canStart()) {
			break
		}
		// wait for the whole batch, then throw its first failure
		const settled = await Promise.allSettled(batch.map(review))
		for (const result of settled) {
			if (result.status === "rejected") {
				throw result.reason
			}
			// keep each result in its input's order
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
	// ask the cheap model, then the premium model if the reply is unreadable
	const output =
		(await generateClaimOutput(request)) ?? (await generateClaimOutput({ ...request, usePremiumModel: true }))
	if (!output) {
		throw new Error("The topic memory split returned unreadable claims")
	}
	// keep each part that is a valid write with text to embed and a Finding for every source index
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

async function generateClaimOutput<Value>({
	prompt,
	schema,
	maxOutputTokens,
	litellmApiKey,
	signal,
	spend,
	waitDeadlineAt,
	usePremiumModel = false,
}: TopicMemoryModelInput & {
	prompt: BuiltPrompt
	schema: z.ZodType<Value>
	maxOutputTokens: number
	usePremiumModel?: boolean
}): Promise<Value | undefined> {
	// the caller owns the Scan reservation. the dev repair uses the operator key and keeps no spend
	signal.throwIfAborted()
	const charge = (usage: { totalTokens?: number; inputTokens?: number; outputTokens?: number }): void => {
		const cost = usePremiumModel
			? premiumModelCost(usage)
			: tokenCost(usage.totalTokens ?? 0, CHEAP_COST_PER_MILLION_TOKENS)
		chargeTopicMemorySpend(spend, cost)
	}
	try {
		// a rate limit or a failing provider waits and tries again inside the update's attempt
		const topicMemoryModelCallResult = await runTopicMemoryModelCall({ signal, waitDeadlineAt }, () =>
			generateText({
				model: usePremiumModel ? scoreModel(litellmApiKey) : cheapModel(litellmApiKey),
				providerOptions: usePremiumModel ? LOW_REASONING_PROVIDER_OPTIONS : undefined,
				prompt: prompt.prompt,
				output: Output.object({ schema }),
				maxOutputTokens: usePremiumModel ? 2600 : maxOutputTokens,
				maxRetries: 0,
				abortSignal: signal,
				...promptTelemetry(prompt),
				...PRIVATE_MODEL_OPTIONS,
			}),
		)
		charge(topicMemoryModelCallResult.usage)
		return topicMemoryModelCallResult.output
	} catch (error) {
		// an unreadable reply is billed and returns nothing, and any other failure is thrown
		if (!isModelAuthenticationRejection(error) && NoObjectGeneratedError.isInstance(error)) {
			charge(error.usage ?? {})
			return undefined
		}
		throw error
	}
}
