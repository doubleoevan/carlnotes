// the app's LLM seam: the LiteLLM-routed cheap-tier model, built lazily so a missing proxy config throws inside a Scan (isolated), never silently falls back to OpenAI
import { createOpenAI } from "@ai-sdk/openai"
import type { LanguageModel } from "ai"

// build the cheap-tier model on demand; require the proxy env explicitly so an unset base url can't default the provider to api.openai.com
export function cheapModel(): LanguageModel {
	// LiteLLM is OpenAI-compatible; both the proxy url and its key must be present (per-user virtual keys land at launch)
	const baseURL = Bun.env.LITELLM_BASE_URL
	const apiKey = Bun.env.LITELLM_MASTER_KEY
	if (!baseURL || !apiKey) {
		throw new Error("LITELLM_BASE_URL and LITELLM_MASTER_KEY must be set to route LLM calls through the proxy")
	}
	// .chat() forces Chat Completions, the endpoint LiteLLM proxies for every backend
	return createOpenAI({ baseURL, apiKey }).chat("cheap-model")
}
