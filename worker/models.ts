// the app's LLM model tiers, all routed through LiteLLM.
// each client is built lazily so a missing proxy config throws when a model is used
// instead of silently falling back to OpenAI
import { createOpenAI } from "@ai-sdk/openai"
import { type EmbeddingModel, embed, type LanguageModel } from "ai"
import { EMBED_DIMENSIONS } from "../db/schema"

// litellmApiKey bills a scan to its topic owner's key. callers with no user context use the master key

// how long one model request may run before it aborts. without this a stalled proxy request never returns
// and pins its Scan in "running" forever, which reads as a scan that is still going rather than one that broke
const MODEL_TIMEOUT_MS = Number(Bun.env.MODEL_TIMEOUT_MS ?? "120000")

// the cheap model handles high-volume inference like query generation and first-pass scoring
export function cheapModel(litellmApiKey?: string): LanguageModel {
	return createModelProxyClient(litellmApiKey).chat("cheap-model")
}

// the premium model re-scores promoted Resources and writes the relevance explanation
export function scoreModel(litellmApiKey?: string): LanguageModel {
	return createModelProxyClient(litellmApiKey).chat("score-model")
}

// the embedding model routes through LiteLLM's embed-model alias (qwen3-embedding-8b).
// callers go through embedVector, which truncates the proxy's full-width vector to the schema dimension
export function embedModel(litellmApiKey?: string): EmbeddingModel {
	return createModelProxyClient(litellmApiKey).embeddingModel("embed-model")
}

// the single place raw embeddings are produced, so no caller can skip truncation. the proxy drops the dimensions param and
// returns qwen3's full 4096-wide vector, so keep the first EMBED_DIMENSIONS (MRL front-loads the important dims) and re-normalize, or cosine distance breaks
export async function embedVector(text: string, litellmApiKey?: string): Promise<number[]> {
	// embed through the proxy, then reduce to the schema's width
	const { embedding } = await embed({ model: embedModel(litellmApiKey), value: text })
	// a shorter vector than the target means a model or config change. fail loud instead of silently padding
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

// build the OpenAI-compatible LLM client on demand
// the proxy env is required explicitly, so an unset base url cannot default the provider to api.openai.com
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
