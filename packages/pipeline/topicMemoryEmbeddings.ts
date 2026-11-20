// embeds checked claims and fills missing vectors for grouping similar Findings
import { EMBED_COST_PER_MILLION_TOKENS, toEstimatedTokens, tokenCost } from "@carlnotes/models/budget"
import { embedVectors } from "@carlnotes/models/models"
import { runTopicMemoryModelCall, type TopicMemoryModelInput } from "./topicMemoryModelCall"
import { toTopicMemoryEmbeddingText } from "./topicMemoryOperations"
import { chargeTopicMemorySpend } from "./topicMemorySpend"

/**
 * Embeds claim wording alone in the same vector space as Resources.
 */
export function embedTopicMemoryClaims(claims: { text: string }[], input: TopicMemoryModelInput): Promise<number[][]> {
	return embedTopicMemoryTexts(
		claims.map(({ text }) => toTopicMemoryEmbeddingText(text)),
		input,
	)
}

/**
 * Embeds the supplied text and adds its cost to the update's spend.
 */
export async function embedTopicMemoryTexts(texts: string[], input: TopicMemoryModelInput): Promise<number[][]> {
	if (!texts.length) {
		return []
	}
	// the shape must remain one vector per input when the caller assigns the results
	const { spend, signal, litellmApiKey } = input
	signal.throwIfAborted()
	const embeddings = await runTopicMemoryModelCall(input, () =>
		embedVectors(texts, { litellmApiKey, maxRetries: 0, abortSignal: signal }),
	)
	const tokens = texts.reduce((sum, text) => sum + toEstimatedTokens(text.length), 0)
	chargeTopicMemorySpend(spend, tokenCost(tokens, EMBED_COST_PER_MILLION_TOKENS))
	return embeddings
}
