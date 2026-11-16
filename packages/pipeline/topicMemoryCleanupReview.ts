// asks the cleanup model to confirm the exact pairs that were flagged during storage
import { toChunks } from "@carlnotes/contracts/arrays"
import { CHEAP_COST_PER_MILLION_TOKENS, tokenCost } from "@carlnotes/models/budget"
import { cheapModel } from "@carlnotes/models/models"
import { loadCurrentDayContext } from "@carlnotes/models/prompts/currentDayContext"
import { type BuiltPrompt, fetchPromptTemplate, promptTelemetry } from "@carlnotes/models/prompts/fetch"
import { writePrompt } from "@carlnotes/models/prompts/write"
import { generateText, NoObjectGeneratedError, Output } from "ai"
import { z } from "zod"
import type { TopicMemoryCleanupPair, TopicMemoryCleanupReview } from "./topicMemoryCleanupPairs"
import { recordTopicMemorySpend } from "./topicMemoryWrites"

const REVIEW_BATCH_SIZE = 4
const CONCURRENT_REVIEWS = 2
const reviewSchema = z.object({
	reviews: z.array(
		z.object({
			id: z.string(),
			verdict: z.enum(["duplicate", "distinct", "uncertain"]),
		}),
	),
})

/** Returns only valid, explicit model judgments. Malformed output leaves the flag pending. */
export async function confirmTopicMemoryCleanupPairs({
	pairs,
	scanId,
	litellmApiKey,
	signal,
}: {
	pairs: TopicMemoryCleanupPair[]
	scanId: string
	litellmApiKey: string
	signal: AbortSignal
}): Promise<TopicMemoryCleanupReview[]> {
	const reviews: TopicMemoryCleanupReview[] = []
	for (const batches of toChunks(toChunks(pairs, REVIEW_BATCH_SIZE), CONCURRENT_REVIEWS)) {
		const results = await Promise.allSettled(batches.map(reviewBatch))
		for (const result of results) {
			if (result.status === "rejected") {
				throw result.reason
			}
			reviews.push(...result.value)
		}
	}
	return reviews

	async function reviewBatch(batch: TopicMemoryCleanupPair[]): Promise<TopicMemoryCleanupReview[]> {
		signal.throwIfAborted()
		const prompt = await buildTopicMemoryCleanupPrompt(batch)
		try {
			const result = await generateText({
				model: cheapModel(litellmApiKey),
				prompt: prompt.prompt,
				maxOutputTokens: 600,
				maxRetries: 0,
				abortSignal: signal,
				output: Output.object({ schema: reviewSchema }),
				...promptTelemetry(prompt),
			})
			await recordTopicMemorySpend(scanId, tokenCost(result.usage.totalTokens ?? 0, CHEAP_COST_PER_MILLION_TOKENS))
			const counts = new Map<string, number>()
			for (const { id } of result.output.reviews) {
				counts.set(id, (counts.get(id) ?? 0) + 1)
			}
			return result.output.reviews.flatMap(({ id, verdict }) => {
				const pair = batch[Number(id)]
				return pair && String(batch.indexOf(pair)) === id && counts.get(id) === 1
					? [{ id: pair.id, revision: pair.revision, verdict }]
					: []
			})
		} catch (error) {
			if (NoObjectGeneratedError.isInstance(error)) {
				await recordTopicMemorySpend(scanId, tokenCost(error.usage?.totalTokens ?? 0, CHEAP_COST_PER_MILLION_TOKENS))
				return []
			}
			throw error
		}
	}
}

/** Builds a bounded, fenced prompt from the dated public provenance of each side. */
export async function buildTopicMemoryCleanupPrompt(pairs: TopicMemoryCleanupPair[], now?: Date): Promise<BuiltPrompt> {
	// send opaque indexes rather than database ids or revision strings
	const [{ template, name, registryPrompt }, currentDayBlock] = await Promise.all([
		fetchPromptTemplate("confirm-topic-memory-pairs"),
		loadCurrentDayContext(now),
	])
	const input = pairs.map(({ takeaways }, index) => ({ id: String(index), takeaways }))
	return { prompt: writePrompt(template, { pairs: JSON.stringify(input) }, { currentDayBlock }), name, registryPrompt }
}
