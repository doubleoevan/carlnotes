// the app's LLM model tiers, all routed through LiteLLM. litellmApiKey bills a call to the key of the call's user.
// a call with no litellmApiKey, such as the search Source's query generation, uses the master key
import { createOpenAI } from "@ai-sdk/openai"
import { type EmbeddingModel, embed, embedMany, type LanguageModel } from "ai"
import { EMBED_DIMENSIONS } from "../db/schema"

// how long a model request may run before the request aborts. the default sits above twice the proxy's longest model timeout
const MODEL_TIMEOUT_MS = Number(Bun.env.MODEL_TIMEOUT_MS ?? "360000")

// what a spent budget tells the user, whether the gate caught it up front or the proxy rejected the call partway through a chat turn
export const SPENT_BUDGET_REJECTION = "Carl is staring at an empty mug. Top up to keep chatting."

// what carl posts if his chat turn broke for any other reason
export const MODEL_CHAT_TURN_FAILED_REJECTION = "Carl couldn't answer that one. Mention him again to retry."

/**
 * Returns whether the proxy rejected this call because the caller's key has spent its budget.
 */
export function isBudgetRejection(error: unknown): boolean {
	// read the whole error chain. the AI SDK wraps the proxy's response, and a retry wrapper may wrap the AI SDK's
	// error again
	for (const errorCause of toErrorCause(error)) {
		const { statusCode, responseBody } = errorCause as { statusCode?: unknown; responseBody?: unknown }
		if (statusCode !== 429) {
			continue
		}
		// only a budget rejection named in the body counts. LiteLLM sends one on every tier as a 429.
		// any other 429 stays a plain rate limit
		const body = typeof responseBody === "string" ? responseBody : ""
		if (body.includes("budget_exceeded") || body.includes("Budget has been exceeded")) {
			return true
		}
	}
	return false
}

// the error itself, whatever it wraps, and whatever a retry collected. a nested rejection is still found
function toErrorCause(error: unknown, seenErrors = new Set<unknown>()): unknown[] {
	if (typeof error !== "object" || error === null || seenErrors.has(error)) {
		return []
	}
	seenErrors.add(error)
	// the error cause follows cause and fans out through an AggregateError's list
	const { cause, errors } = error as { cause?: unknown; errors?: unknown }
	const nestedErrors = Array.isArray(errors) ? errors : []
	return [
		error,
		...toErrorCause(cause, seenErrors),
		...nestedErrors.flatMap((nestedError) => toErrorCause(nestedError, seenErrors)),
	]
}

/**
 * Returns the cheap model, which handles high-volume inference like query generation and first-pass scoring.
 */
export function cheapModel(litellmApiKey?: string): LanguageModel {
	return createModelProxyClient(litellmApiKey).chat("cheap-model")
}

/**
 * Returns the premium model, which re-scores promoted Resources and writes relevance explanations and podcast scripts.
 */
export function scoreModel(litellmApiKey?: string): LanguageModel {
	return createModelProxyClient(litellmApiKey).chat("score-model")
}

/**
 * Returns the chat model, which writes every chat reply and describes the images that a user attaches.
 */
export function chatModel(litellmApiKey?: string): LanguageModel {
	return createModelProxyClient(litellmApiKey).chat("chat-model")
}

/**
 * Returns the embedding model behind LiteLLM's embed-model alias, qwen3-embedding-8b.
 */
export function embedModel(litellmApiKey?: string): EmbeddingModel {
	return createModelProxyClient(litellmApiKey).embeddingModel("embed-model")
}

/**
 * Embeds one text and returns its vector, cut to the schema's width and scaled to unit length.
 */
export async function embedVector(text: string, litellmApiKey?: string): Promise<number[]> {
	// embed through the proxy, then reduce to the schema's width
	const { embedding } = await embed({ model: embedModel(litellmApiKey), value: text })
	return toSchemaVector(embedding)
}

/**
 * Embeds many texts in one embedMany call and returns each vector reduced like embedVector's, in the input order.
 */
export async function embedVectors(texts: string[], litellmApiKey?: string): Promise<number[][]> {
	// embed through the proxy, then reduce each vector to the schema's width
	const { embeddings } = await embedMany({ model: embedModel(litellmApiKey), values: texts })
	return embeddings.map(toSchemaVector)
}

// reduce one raw proxy vector to the schema's width
function toSchemaVector(embedding: number[]): number[] {
	// a vector shorter than the schema's width means a model or config change. fail loud instead of silently padding
	if (embedding.length < EMBED_DIMENSIONS) {
		throw new Error(`embedding model returned ${embedding.length} dimensions, need at least ${EMBED_DIMENSIONS}`)
	}
	return toUnitVector(embedding.slice(0, EMBED_DIMENSIONS))
}

// scale a vector to unit length so cosine distance stays correct after truncation
function toUnitVector(vector: number[]): number[] {
	// calculate the magnitude, then scale each component by it. a zero vector has no direction to normalize
	const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
	if (magnitude === 0) {
		return vector
	}
	return vector.map((value) => value / magnitude)
}

// build the OpenAI-compatible LLM client on demand, from the proxy url in the env and the user's key or the master key
function createModelProxyClient(litellmApiKey?: string): ReturnType<typeof createOpenAI> {
	// LiteLLM is OpenAI-compatible. the proxy url is always required
	const baseURL = Bun.env.LITELLM_BASE_URL
	const apiKey = litellmApiKey ?? Bun.env.LITELLM_MASTER_KEY
	if (!baseURL || !apiKey) {
		throw new Error("LITELLM_BASE_URL and LITELLM_MASTER_KEY must be set to route LLM calls through the proxy")
	}
	return createOpenAI({ baseURL, apiKey, fetch: fetchWithTimeout as typeof fetch })
}

// the model proxy's fetch, bounded by the model timeout. a request that outlives it aborts and surfaces as failed
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	// honor the caller's own abort signal too, so whichever fires first wins
	const timeoutSignal = AbortSignal.timeout(MODEL_TIMEOUT_MS)
	const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal
	return fetch(input, { ...init, signal })
}
