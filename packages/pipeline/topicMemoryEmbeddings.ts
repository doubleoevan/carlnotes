// embeds checked claims and fills missing vectors for grouping similar Findings
import { EMBED_COST_PER_MILLION_TOKENS, toEstimatedTokens, tokenCost } from "@carlnotes/models/budget"
import { embedVectors } from "@carlnotes/models/models"
import { toTopicMemoryEmbeddingText } from "./topicMemoryOperations"
import { recordTopicMemorySpend } from "./topicMemorySpend"

type EmbedInput = { scanId?: string; litellmApiKey: string; signal: AbortSignal }

/**
 * Embeds claim wording alone in the same vector space as Resources.
 */
export function embedTopicMemoryClaims(claims: { text: string }[], input: EmbedInput): Promise<number[][]> {
	return embedTopicMemoryTexts(
		claims.map(({ text }) => toTopicMemoryEmbeddingText(text)),
		input,
	)
}

/**
 * Embeds the supplied text and accounts for work done on behalf of a Scan.
 */
export async function embedTopicMemoryTexts(
	texts: string[],
	{ scanId, signal, litellmApiKey }: EmbedInput,
): Promise<number[][]> {
	if (!texts.length) {
		return []
	}
	// the shape must remain one vector per input when the caller assigns the results
	signal.throwIfAborted()
	const embeddings = await embedVectors(texts, { litellmApiKey, maxRetries: 0, abortSignal: signal })
	if (scanId) {
		const tokens = texts.reduce((sum, text) => sum + toEstimatedTokens(text.length), 0)
		await recordTopicMemorySpend(scanId, tokenCost(tokens, EMBED_COST_PER_MILLION_TOKENS))
	}
	return embeddings
}
