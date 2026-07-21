// the app's LLM model tiers, all routed through LiteLLM.
// each client is built lazily so a missing proxy config throws when a model is used
// instead of silently falling back to OpenAI
import { createOpenAI } from "@ai-sdk/openai"
import type { EmbeddingModel, LanguageModel } from "ai"

// the cheap model handles high-volume inference like query generation and first-pass scoring
export function cheapModel(): LanguageModel {
	return proxy().chat("cheap-model")
}

// the premium model re-scores promoted Resources and writes a why-summary
export function scoreModel(): LanguageModel {
	return proxy().chat("score-model")
}

// the embedding model produces the 768-dimension vectors curation stores on a Resource
// the dimension must match the schema
export function embedModel(): EmbeddingModel {
	return proxy().embeddingModel("embed-model")
}

// build the OpenAI-compatible client on demand
// the proxy env is required explicitly, so an unset base url cannot default the provider to api.openai.com
function proxy(): ReturnType<typeof createOpenAI> {
	// LiteLLM is OpenAI-compatible. the proxy url and key are both required
	const baseURL = Bun.env.LITELLM_BASE_URL
	const apiKey = Bun.env.LITELLM_MASTER_KEY
	if (!baseURL || !apiKey) {
		throw new Error("LITELLM_BASE_URL and LITELLM_MASTER_KEY must be set to route LLM calls through the proxy")
	}
	return createOpenAI({ baseURL, apiKey })
}
