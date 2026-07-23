// registry-first prompt loading. each prompt is fetched from Langfuse by name and degrades to the fallback template
// when Langfuse is unreachable, times out, or keys are not set
// a topic scan can never fail or hang on the registry
import { LangfuseClient } from "@langfuse/client"
import attachContextTemplate from "./attach-context.md" with { type: "text" }
import searchTopicTemplate from "./search-topic.md" with { type: "text" }
import summarizeResourceTemplate from "./summarize-resource.md" with { type: "text" }
import summarizeTopicScanTemplate from "./summarize-topic-scan.md" with { type: "text" }

// the four prompts this app serves, and their fallback templates for when the registry can't serve them.
// sync.ts pushes these same bodies up to Langfuse, so runtime and sync can never drift
export const FALLBACK_PROMPT_TEMPLATES = {
	"summarize-resource": summarizeResourceTemplate,
	"summarize-topic-scan": summarizeTopicScanTemplate,
	"search-topic": searchTopicTemplate,
	"attach-context": attachContextTemplate,
} as const

export type PromptName = keyof typeof FALLBACK_PROMPT_TEMPLATES

// identifies the registry version that served a prompt
// shaped to fit whatever tracing backend telemetry.ts wires up
export type RegistryPromptVersion = { name: string; version: number; isFallback?: boolean }

// the prompt text that a builder hands to generateText,
// plus its own name and the registry version that served it.
// the prompt's name becomes its telemetry functionId
export type BuiltPrompt = { prompt: string; name: PromptName; registryPrompt?: RegistryPromptVersion }

// the generateText options that link an LLM call's trace to the registry prompt version that served it
type PromptTelemetryOptions = {
	runtimeContext: Record<string, RegistryPromptVersion | undefined>
	telemetry: { functionId: string; includeRuntimeContext: Record<string, true> }
}

// "langfusePrompt" is the one vendor-specific line in this file
// it's the literal runtimeContext key @langfuse/vercel-ai-sdk's integration reads to link a trace to its prompt version
// swapping tracing vendors later means changing this key and telemetry.ts nothing at any call site
const PROMPT_CONTEXT_KEY = "langfusePrompt"

/**
 * Builds the generateText options linking an LLM call's trace to the registry prompt version that served it if one did.
 */
export function promptTelemetry(builtPrompt: BuiltPrompt): PromptTelemetryOptions {
	// the same PROMPT_CONTEXT_KEY key both names the runtimeContext's field and tells includeRuntimeContext which field to export
	return {
		runtimeContext: { [PROMPT_CONTEXT_KEY]: builtPrompt.registryPrompt },
		telemetry: { functionId: builtPrompt.name, includeRuntimeContext: { [PROMPT_CONTEXT_KEY]: true } },
	}
}

// the network timeout for a registry fetch. short, so a slow Langfuse never stalls a scan
const FETCH_TIMEOUT_MS = 2500
// how long a fetched prompt is cached in memory before the next call re-fetches it
const CACHE_TTL_SECONDS = 300

// the client instance, built lazily so importing this module never requires Langfuse keys
let client: LangfuseClient | null = null

/**
 * Fetches a prompt's production template from Langfuse and degrades to the fallback template.
 */
export async function fetchPromptTemplate(
	name: PromptName,
): Promise<{ template: string; name: PromptName; registryPrompt?: RegistryPromptVersion }> {
	const fallbackPromptTemplate = FALLBACK_PROMPT_TEMPLATES[name]
	// no keys means no registry so return the fallback template directly
	if (!Bun.env.LANGFUSE_PUBLIC_KEY || !Bun.env.LANGFUSE_SECRET_KEY) {
		return { template: fallbackPromptTemplate, name }
	}

	try {
		// fetch the production prompt version, capped by a short timeout and a five-minute cache.
		// a cache miss with Langfuse unreachable degrades to the fallback template without throwing
		const prompt = await promptClient().prompt.get(name, {
			cacheTtlSeconds: CACHE_TTL_SECONDS,
			fallback: fallbackPromptTemplate,
			fetchTimeoutMs: FETCH_TIMEOUT_MS,
		})

		// link the served prompt template version (real or fallback) so that the trace can cite it
		return {
			template: prompt.prompt,
			name,
			registryPrompt: { name: prompt.name, version: prompt.version, isFallback: prompt.isFallback },
		}
	} catch (error) {
		// any other failure — network, bad keys, an SDK bug — degrades to the fallback prompt template, never throws
		console.error(`langfuse prompt fetch failed for ${name}`, error)
		return { template: fallbackPromptTemplate, name }
	}
}

// build the Langfuse client on demand. it reads LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, and LANGFUSE_BASE_URL from env
function promptClient(): LangfuseClient {
	if (!client) {
		client = new LangfuseClient()
	}
	return client
}
