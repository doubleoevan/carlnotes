// the search adapter: the scout — an LLM turns a topic's context doc into queries, Exa runs them, results land as read Resources
import { generateText, Output } from "ai"
import { z } from "zod"
import { topicScanContext } from "../attachments"
import { cheapModel } from "../llm"
import type { NewResource, Source, SourceAdapter } from "./adapter"
import { fetchVideos, playlistIdFromUrl } from "./youtube"

// generation/fetch knobs kept at the top per adapter-authoring
const MAX_QUERIES = 5
const RESULTS_PER_QUERY = 10
// cap the user-controlled context doc sent to the LLM, to bound tokens/spend on a pathologically large doc
const MAX_CONTEXT_CHARS = 8000
const FETCH_TIMEOUT_MS = 10_000
// Exa is the current search provider (swappable per the tech-stack decision log); EXA_ENDPOINT + EXA_API_KEY are the only Exa-specific names
const EXA_ENDPOINT = "https://api.exa.ai/search"

// read the topic's effective context, generate queries from it, search Exa per query, and merge the deduped read Resources
export const searchAdapter: SourceAdapter = async (source: Source) => {
	// the scout reads its own topic's effective context (its context plus attachment contexts) and name to seed generation
	const { name, context } = await topicScanContext(source.topicId)
	// generate queries from the effective context, then run each search in parallel
	const queries = await generateQueries(context, name)
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
	// expand any youtube playlist result into its member videos (playlistItems is quota-metered, so cost is unchanged)
	const resources = await expandPlaylists([...resourceByUrl.values()])
	// search has no keyless mode, so fallbackMode stays unset; cost is the best-effort paid-Exa spend, unlike the keyless adapters' 0
	return { resources, cost }
}

// the fields parseResults reads from the search provider's response (Exa's shape today); the JSON is unvalidated, so url is optional at runtime
type SearchResponse = {
	results: { url?: string; title?: string | null; highlights?: string[] }[]
	costDollars?: { total?: number }
}

// build the query-generation prompt; an empty context falls back to the topic name so the model always has a seed
export function buildQueryPrompt(context: string, name: string): string {
	// an empty context gives the model nothing to scout from — fall back to the topic name; cap length to bound tokens/spend
	const capped = (context.trim() || name).slice(0, MAX_CONTEXT_CHARS)
	return `You are a research scout. Given the topic below, write up to ${MAX_QUERIES} diverse web search queries that would surface fresh, high-quality articles worth reading. Return only the queries.\n\nTopic:\n${capped}`
}

// generate a bounded list of search queries from the effective context via the LiteLLM-routed model, validated by Zod
async function generateQueries(context: string, name: string): Promise<string[]> {
	// structured output via generateText's output setting (generateObject is deprecated in ai@7); the schema forces a string array
	const { output } = await generateText({
		model: cheapModel(),
		output: Output.object({ schema: z.object({ queries: z.array(z.string()) }) }),
		prompt: buildQueryPrompt(context, name),
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
		// map to a read Resource; the native snippet is Exa's result highlights, contentHash/content stay null for curation to fill
		resourceByUrl.set(result.url, {
			url: result.url,
			title: result.title ?? null,
			kind: "read",
			snippet: result.highlights?.join(" ") || null,
			contentHash: null,
		})
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
		body: JSON.stringify({ query, numResults: RESULTS_PER_QUERY, type: "auto", contents: { highlights: true } }),
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	})
	// a non-ok response degrades only this Source (isolated by runTopicScan)
	if (!response.ok) {
		throw new Error(`exa search returned ${response.status}`)
	}
	return (await response.json()) as SearchResponse
}

// expand any youtube playlist result into its member videos; non-playlist Resources pass through unchanged
async function expandPlaylists(resources: NewResource[]): Promise<NewResource[]> {
	// playlist expansion needs the Data API key; without it every playlist keeps its opaque read link
	const apiKey = Bun.env.YOUTUBE_API_KEY
	if (!apiKey) {
		return resources
	}
	// expand every playlist in parallel (non-playlists pass through untouched)
	const playlistResources = (await Promise.all(resources.map((resource) => expandPlaylist(resource, apiKey)))).flat()
	// re-dedupe the flattened Resources by url: expanded watch?v= urls collapse against each other (and, at scan level, against youtube Sources)
	const resourceByUrl = new Map<string, NewResource>()
	for (const resource of playlistResources) {
		if (!resourceByUrl.has(resource.url)) {
			resourceByUrl.set(resource.url, resource)
		}
	}
	return [...resourceByUrl.values()]
}

// one Resource → its playlist's videos when its url is a youtube playlist, else the Resource unchanged; a failed expansion keeps the link
async function expandPlaylist(resource: NewResource, apiKey: string): Promise<NewResource[]> {
	// a non-playlist url has nothing to expand
	const playlistId = playlistIdFromUrl(resource.url)
	if (!playlistId) {
		return [resource]
	}
	// one playlist failing (private/404/timeout) degrades to its read link, never the whole search batch
	try {
		return await fetchVideos(playlistId, apiKey)
	} catch (error) {
		console.error(`search playlist ${playlistId} expansion failed`, error)
		return [resource]
	}
}
