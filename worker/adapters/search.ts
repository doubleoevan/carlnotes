// the search adapter: the scout — an LLM turns a topic's context doc into queries, Exa runs them, results land as read Resources
import { generateText, Output } from "ai"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "../../db"
import { topics } from "../../db/schema"
import { cheapModel } from "../llm"
import type { NewResource, Source, SourceAdapter } from "./adapter"

// generation/fetch knobs kept at the top per adapter-authoring
const MAX_QUERIES = 5
const RESULTS_PER_QUERY = 10
// cap the user-controlled context doc sent to the LLM, to bound tokens/spend on a pathologically large doc
const MAX_CONTEXT_CHARS = 8000
const FETCH_TIMEOUT_MS = 10_000
// Exa is the current search provider (swappable per the tech-stack decision log); EXA_ENDPOINT + EXA_API_KEY are the only Exa-specific names
const EXA_ENDPOINT = "https://api.exa.ai/search"

// read the topic's context doc, generate queries from it, search Exa per query, and merge the deduped read Resources
export const searchAdapter: SourceAdapter = async (source: Source) => {
	// the scout reads its own topic (unlike the other adapters) for the context doc and name that seed query generation
	const [topic] = await db
		.select({ contextDoc: topics.contextDoc, name: topics.name })
		.from(topics)
		.where(eq(topics.id, source.topicId))
	if (!topic) {
		throw new Error(`search source ${source.id} has no topic ${source.topicId}`)
	}
	// generate queries from the context doc, then run each search in parallel
	const queries = await generateQueries(topic.contextDoc, topic.name)
	const responses = await Promise.all(queries.map(runSearch))

	// merge every query's results: sum the per-search Exa cost and collect the Resources
	const resourceByUrl = new Map<string, NewResource>()
	let cost = 0
	for (const response of responses) {
		const parsed = parseResults(response)
		cost += parsed.cost
		// dedupe Resources across queries by url, keeping the first seen
		for (const resource of parsed.resources) {
			if (!resourceByUrl.has(resource.url)) {
				resourceByUrl.set(resource.url, resource)
			}
		}
	}
	// search has no keyless mode, so fallbackMode stays unset; cost is the best-effort paid-Exa spend, unlike the keyless adapters' 0
	return { resources: [...resourceByUrl.values()], cost }
}

// the fields parseResults reads from the search provider's response (Exa's shape today); the JSON is unvalidated, so url is optional at runtime
type SearchResponse = { results: { url?: string; title?: string | null }[]; costDollars?: { total?: number } }

// build the query-generation prompt; an empty context doc falls back to the topic name so the model always has a seed
export function buildQueryPrompt(contextDoc: string, name: string): string {
	// an empty context doc gives the model nothing to scout from — fall back to the topic name; cap length to bound tokens/spend
	const context = (contextDoc.trim() || name).slice(0, MAX_CONTEXT_CHARS)
	return `You are a research scout. Given the topic below, write up to ${MAX_QUERIES} diverse web search queries that would surface fresh, high-quality articles worth reading. Return only the queries.\n\nTopic:\n${context}`
}

// generate a bounded list of search queries from the context doc via the LiteLLM-routed model, validated by Zod
async function generateQueries(contextDoc: string, name: string): Promise<string[]> {
	// structured output via generateText's output setting (generateObject is deprecated in ai@7); the schema forces a string array
	const { output } = await generateText({
		model: cheapModel(),
		output: Output.object({ schema: z.object({ queries: z.array(z.string()) }) }),
		prompt: buildQueryPrompt(contextDoc, name),
	})
	// sanitize model output — trim, drop blanks, dedupe — then cap so a chatty model can't inflate the Exa call count
	const queries = [...new Set(output.queries.map((query) => query.trim()).filter(Boolean))]
	return queries.slice(0, MAX_QUERIES)
}

// pure search response → deduped read Resources plus the dollar cost the provider reported for the search
export function parseResults(response: SearchResponse): { resources: NewResource[]; cost: number } {
	// keep the first Resource per url so repeated results collapse to one
	const resourceByUrl = new Map<string, NewResource>()
	for (const result of response.results) {
		// skip results without a usable url — url is the required, unique dedupe key, and a null url would poison the batch insert
		if (typeof result.url !== "string" || resourceByUrl.has(result.url)) {
			continue
		}
		// map to a read Resource; contentHash and embedding stay null for the curation pipeline to fill later
		resourceByUrl.set(result.url, { url: result.url, title: result.title ?? null, kind: "read", contentHash: null })
	}
	// Exa reports the search's dollar cost in costDollars.total; absent → 0, so Scan.cost is best-effort (LiteLLM meters authoritative spend)
	return { resources: [...resourceByUrl.values()], cost: response.costDollars?.total ?? 0 }
}

// run one query against the search provider (Exa); there is no keyless mode, so a missing key or non-ok response throws (isolated per Source)
async function runSearch(query: string): Promise<SearchResponse> {
	// Exa requires a key — unset means this Source cannot run, so throw and degrade only this Source
	const apiKey = Bun.env.EXA_API_KEY
	if (!apiKey) {
		throw new Error("EXA_API_KEY is not set")
	}
	// POST the query with the key header, bounded by the fetch timeout
	const response = await fetch(EXA_ENDPOINT, {
		method: "POST",
		headers: { "x-api-key": apiKey, "content-type": "application/json" },
		body: JSON.stringify({ query, numResults: RESULTS_PER_QUERY, type: "auto" }),
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	})
	// a non-ok response degrades only this Source (isolated by runTopicScan)
	if (!response.ok) {
		throw new Error(`exa search returned ${response.status}`)
	}
	return (await response.json()) as SearchResponse
}
