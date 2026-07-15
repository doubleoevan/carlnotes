// the app's LLM seam: the LiteLLM-routed model tiers, built lazily so a missing proxy config throws inside a Scan (isolated), never silently falls back to OpenAI
import { createOpenAI } from "@ai-sdk/openai"
import type { EmbeddingModel, LanguageModel } from "ai"

// the cheap tier: high-volume app inference (query generation, first-pass scoring)
export function cheapModel(): LanguageModel {
	// .chat() forces Chat Completions, the endpoint LiteLLM proxies for every backend
	return proxy().chat("cheap-model")
}

// the premium tier: re-scores promoted Resources and writes the why-summary
export function scoreModel(): LanguageModel {
	// .chat() forces Chat Completions, the endpoint LiteLLM proxies for every backend
	return proxy().chat("score-model")
}

// the embedding tier: produces the 768-dim vectors curation stores on a Resource (dimension must match the schema)
export function embedModel(): EmbeddingModel {
	// .embeddingModel() routes to LiteLLM's /embeddings endpoint
	return proxy().embeddingModel("embed-model")
}

// build the OpenAI-compatible client on demand; require the proxy env explicitly so an unset base url can't default the provider to api.openai.com
function proxy(): ReturnType<typeof createOpenAI> {
	// LiteLLM is OpenAI-compatible; both the proxy url and its key must be present (per-user virtual keys land at launch)
	const baseURL = Bun.env.LITELLM_BASE_URL
	const apiKey = Bun.env.LITELLM_MASTER_KEY
	if (!baseURL || !apiKey) {
		throw new Error("LITELLM_BASE_URL and LITELLM_MASTER_KEY must be set to route LLM calls through the proxy")
	}
	return createOpenAI({ baseURL, apiKey })
}
