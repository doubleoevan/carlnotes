import { toUtcDay } from "@carlnotes/contracts/time"
import { CHEAP_COST_PER_MILLION_TOKENS, tokenCost } from "@carlnotes/models/budget"
import { cheapModel, isModelAuthenticationRejection } from "@carlnotes/models/models"
import { PRIVATE_MODEL_OPTIONS } from "@carlnotes/models/privateModelOptions"
import { type BuiltPrompt, fetchPromptTemplate, promptTelemetry } from "@carlnotes/models/prompts/fetch"
import { writePrompt } from "@carlnotes/models/prompts/write"
import { runWithConcurrency } from "@carlnotes/server/concurrency"
import { generateText, NoObjectGeneratedError, Output } from "ai"
import { z } from "zod"
import {
	type ApplyTopicMemoryWriteOptions,
	type EmbeddedTopicMemoryWrite,
	loadTopicMemoryReplacementCandidate,
} from "./applyTopicMemoryWrite"
import type { TopicMemoryModelInput } from "./topicMemoryModelCall"
import { chargeTopicMemorySpend } from "./topicMemorySpend"

// a replacement that a write may make, a claim as the review reads it, and the earlier and newer claim of one type
type ReplacementCandidate = NonNullable<ApplyTopicMemoryWriteOptions["replacement"]>
type ReplacementClaim = { text: string; factDate: string | null; observedDay: string }
type ReplacementPair = {
	claimType: EmbeddedTopicMemoryWrite["claimType"]
	earlier: ReplacementClaim
	newer: ReplacementClaim
}
// the review's reply, how long one review may run, and the most pairs it reads
const replacementVerdicts = z.object({ confirmedIndexes: z.array(z.number().int().nonnegative()) })
const REPLACEMENT_REVIEW_TIMEOUT_MS = 20_000
const REPLACEMENT_REVIEW_LIMIT = 12

/** Reviews the possible replacements before the write takes the Topic lock. */
export async function reviewTopicMemoryReplacements({
	writes,
	topicId,
	scanStartedAt,
	litellmApiKey,
	signal,
	spend,
}: Pick<TopicMemoryModelInput, "litellmApiKey" | "signal" | "spend"> & {
	writes: EmbeddedTopicMemoryWrite[]
	topicId: string
	scanStartedAt: Date
}): Promise<Map<EmbeddedTopicMemoryWrite, ReplacementCandidate>> {
	// require a unique active candidate for a single-valued type and a newer observation
	const reviewed = await runWithConcurrency(writes, 4, async (write) => ({
		write,
		candidate: await loadTopicMemoryReplacementCandidate({ write, topicId, startedAt: scanStartedAt }),
	}))
	const candidates = reviewed
		.flatMap(({ write, candidate }) => (candidate ? [{ write, candidate }] : []))
		.slice(0, REPLACEMENT_REVIEW_LIMIT)
	if (!candidates.length) {
		return new Map()
	}

	// compare the content and both dates, keeping all proposals if review fails
	const pairs = candidates.map(({ write, candidate }) => ({
		claimType: write.claimType,
		earlier: { text: candidate.text, factDate: candidate.factDate, observedDay: toUtcDay(candidate.lastSeenAt) },
		newer: { text: write.text, factDate: write.factDate, observedDay: toUtcDay(scanStartedAt) },
	}))
	try {
		const prompt = await buildTopicMemoryReplacementPrompt(pairs)
		const { output, usage } = await generateText({
			model: cheapModel(litellmApiKey),
			prompt: prompt.prompt,
			output: Output.object({ schema: replacementVerdicts }),
			maxOutputTokens: 300,
			maxRetries: 0,
			abortSignal: AbortSignal.any([signal, AbortSignal.timeout(REPLACEMENT_REVIEW_TIMEOUT_MS)]),
			...promptTelemetry(prompt),
			...PRIVATE_MODEL_OPTIONS,
		})
		chargeTopicMemorySpend(spend, tokenCost(usage.totalTokens ?? 0, CHEAP_COST_PER_MILLION_TOKENS))
		if (output.confirmedIndexes.some((index) => !candidates[index])) {
			return new Map()
		}
		const confirmed = new Set(output.confirmedIndexes)
		return new Map(
			candidates.flatMap(({ write, candidate }, index) => (confirmed.has(index) ? [[write, candidate] as const] : [])),
		)
	} catch (error) {
		// a cancelled update and a rejected key end the review
		signal.throwIfAborted()
		if (isModelAuthenticationRejection(error)) {
			throw error
		}
		// an unreadable reply is billed, and any failure left confirms no replacement
		if (NoObjectGeneratedError.isInstance(error)) {
			chargeTopicMemorySpend(spend, tokenCost(error.usage?.totalTokens ?? 0, CHEAP_COST_PER_MILLION_TOKENS))
		}
		return new Map()
	}
}

/** Builds a fenced review of prior and proposed event claims. */
export async function buildTopicMemoryReplacementPrompt(pairs: ReplacementPair[]): Promise<BuiltPrompt> {
	const { template, name, registryPrompt } = await fetchPromptTemplate("confirm-topic-memory-replacements")
	return {
		prompt: writePrompt(template, { pairs: JSON.stringify(pairs.map((pair, index) => ({ index, ...pair }))) }),
		name,
		registryPrompt,
	}
}
