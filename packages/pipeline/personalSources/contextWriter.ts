import { PERSONAL_SOURCES_CONTEXT_OUTPUT_CHARS } from "@carlnotes/contracts/personalSources"
import { cheapModel } from "@carlnotes/models/models"
import { PRIVATE_MODEL_OPTIONS } from "@carlnotes/models/privateModelOptions"
import { generateText } from "ai"
import { buildPersonalSourcesContextPrompt } from "./contextPrompt"

type WritePersonalSourcesContextOptions = Parameters<typeof buildPersonalSourcesContextPrompt>[0] & {
	litellmApiKey?: string
	signal?: AbortSignal
}

/**
 * Writes one bounded private summary after the caller reserves its sender's budget.
 */
export async function writePersonalSourcesContext({
	litellmApiKey,
	signal,
	...input
}: WritePersonalSourcesContextOptions): Promise<{ text: string; totalTokens: number | undefined }> {
	// the same fenced prompt and private provider settings serve production and synthetic evaluations
	const prompt = await buildPersonalSourcesContextPrompt(input)
	const generated = await generateText({
		model: cheapModel(litellmApiKey),
		prompt: prompt.prompt,
		maxOutputTokens: 4096,
		maxRetries: 0,
		abortSignal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(180_000)]),
		...PRIVATE_MODEL_OPTIONS,
	})
	const text = generated.text.trim().slice(0, PERSONAL_SOURCES_CONTEXT_OUTPUT_CHARS)
	if (!text) {
		throw new Error("Empty Personal sources context")
	}
	signal?.throwIfAborted()
	return { text, totalTokens: generated.usage.totalTokens }
}
