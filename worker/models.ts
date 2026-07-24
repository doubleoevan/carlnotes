// the app's LLM model tiers, all routed through LiteLLM.
// each client is built lazily so a missing proxy config throws when a model is used
// instead of silently falling back to OpenAI
import { createOpenAI } from "@ai-sdk/openai"
import type { EmbeddingModel, LanguageModel } from "ai"

// litellmApiKey bills a scan to its topic owner's key. callers with no user context use the master key

// the cheap model handles high-volume inference like query generation and first-pass scoring
export function cheapModel(litellmApiKey?: string): LanguageModel {
	return proxy(litellmApiKey).chat("cheap-model")
}

// the premium model re-scores promoted Resources and writes the relevance explanation
export function scoreModel(litellmApiKey?: string): LanguageModel {
	return proxy(litellmApiKey).chat("score-model")
}

// the embedding model produces the 768-dimension vectors that review stores on a Resource,
// the dimension must match the schema
export function embedModel(litellmApiKey?: string): EmbeddingModel {
	return proxy(litellmApiKey).embeddingModel("embed-model")
}

// build the OpenAI-compatible client on demand
// the proxy env is required explicitly, so an unset base url cannot default the provider to api.openai.com
function proxy(litellmApiKey?: string): ReturnType<typeof createOpenAI> {
	// LiteLLM is OpenAI-compatible. the proxy url is always required
	const baseURL = Bun.env.LITELLM_BASE_URL
	const apiKey = litellmApiKey ?? Bun.env.LITELLM_MASTER_KEY
	if (!baseURL || !apiKey) {
		throw new Error("LITELLM_BASE_URL and LITELLM_MASTER_KEY must be set to route LLM calls through the proxy")
	}
	return createOpenAI({ baseURL, apiKey })
}
