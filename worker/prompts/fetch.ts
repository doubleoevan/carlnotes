// registry-first prompt loading. each prompt is fetched from Langfuse by name and falls back to the bundled template
// when Langfuse is unreachable, times out, or keys are not set
// a topic scan can never fail or hang on the registry
import { LangfuseClient } from "@langfuse/client"
import { reportError } from "@shared/monitoring"
import attachContextTemplate from "./attach-context.md" with { type: "text" }
import attachImageContextTemplate from "./attach-image-context.md" with { type: "text" }
import chatTopicTemplate from "./chat-topic.md" with { type: "text" }
import searchTopicTemplate from "./search-topic.md" with { type: "text" }
import summarizeResourceTemplate from "./summarize-resource.md" with { type: "text" }
import summarizeTopicScanTemplate from "./summarize-topic-scan.md" with { type: "text" }
import { stripFrontmatter } from "./write.ts"

// the prompts this app serves, and their fallback templates for when the registry can't serve them.
// sync.ts pushes these same bodies up to Langfuse, so runtime and sync can never drift
export const FALLBACK_PROMPT_TEMPLATES = {
	"summarize-resource": summarizeResourceTemplate,
	"summarize-topic-scan": summarizeTopicScanTemplate,
	"search-topic": searchTopicTemplate,
	"attach-context": attachContextTemplate,
	"attach-image-context": attachImageContextTemplate,
	"chat-topic": chatTopicTemplate,
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

// prompts already noted as worded differently this process, so a lagging prompt is logged once instead of per scan
const wordDriftPrompts = new Set<PromptName>()

/**
 * Fetches a prompt's production template from Langfuse, falling back to the bundled template.
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
		// a cache miss with Langfuse unreachable falls back to the bundled template without throwing
		const prompt = await promptClient().prompt.get(name, {
			cacheTtlSeconds: CACHE_TTL_SECONDS,
			fallback: fallbackPromptTemplate,
			fetchTimeoutMs: FETCH_TIMEOUT_MS,
		})

		// a registry template asking for different variables than the bundled one has drifted from the code that fills it,
		// and the code only knows how to fill the bundled one. the registry is for editing wording between deploys,
		// not for changing the contract, so on a mismatch the bundled template wins
		if (!hasSameVariables(prompt.prompt, fallbackPromptTemplate)) {
			console.error(`registry prompt ${name} v${prompt.version} names different variables, using the bundled template`)
			reportError(new Error(`registry prompt ${name} has drifted from the bundled template`), "prompt-registry", {
				prompt: name,
				registryVersion: String(prompt.version),
			})
			return { template: fallbackPromptTemplate, name }
		}

		// the registry's wording may lead or lag the bundled template on purpose, since a candidate is promoted by hand.
		// logged once per prompt per process, so a prompt left behind is visible instead of being assumed current
		if (!wordDriftPrompts.has(name) && prompt.prompt.trim() !== stripFrontmatter(fallbackPromptTemplate).trim()) {
			wordDriftPrompts.add(name)
			console.log(`prompt ${name} v${prompt.version} is worded differently from the bundled template`)
		}

		// link the served prompt template version (real or fallback) so that the trace can cite it
		return {
			template: prompt.prompt,
			name,
			registryPrompt: { name: prompt.name, version: prompt.version, isFallback: prompt.isFallback },
		}
	} catch (error) {
		// any other failure, whether network, bad keys, or an SDK bug, falls back to the bundled template and never throws
		console.error(`langfuse prompt fetch failed for ${name}`, error)
		return { template: fallbackPromptTemplate, name }
	}
}

/**
 * Whether two prompt templates ask for the same set of {{variables}}, which is the contract the code writes to.
 */
export function hasSameVariables(template: string, otherTemplate: string): boolean {
	return toVariableNames(template) === toVariableNames(otherTemplate)
}

// a template's variable names, deduped and sorted, so that reorders and repeats do not read as differences
function toVariableNames(template: string): string {
	const names = [...template.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1] as string)
	return [...new Set(names)].sort().join(",")
}

// build the Langfuse client on demand. it reads LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, and LANGFUSE_BASE_URL from env
function promptClient(): LangfuseClient {
	if (!client) {
		client = new LangfuseClient()
	}
	return client
}
