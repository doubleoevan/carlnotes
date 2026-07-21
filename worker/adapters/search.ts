// the search adapter. a model converts the topic's context into search queries, Exa runs them, and the results become "read" Resources
import { generateText, Output } from "ai"
import { z } from "zod"
import { buildTopicScanContext } from "../attachments"
import { cheapModel } from "../models.ts"
import type { NewResource, Source, SourceAdapter } from "./adapter"
import { fetchVideos, playlistIdFromUrl } from "./youtube"

// query and fetch limits
const MAX_QUERIES = 5
const RESULTS_PER_QUERY = 10
// cap the user-controlled context sent to the model so a huge context cannot inflate token spend
const MAX_CONTEXT_CHARS = 8000
const FETCH_TIMEOUT_MS = 10_000
// Exa is the current search provider and may be swapped later. EXA_ENDPOINT and EXA_API_KEY are the only Exa-specific names
const EXA_ENDPOINT = "https://api.exa.ai/search"

// read the topic's context, generate queries from it, search per query, and merge the deduped "read" Resources
export const searchAdapter: SourceAdapter = async (source: Source) => {
	// the context combines the topic's prompt with its attachments along with the topic name to be used for query generation
	const { name, context } = await buildTopicScanContext(source.topicId)

	// generate search queries from the context, then run them and keep whichever succeeds
	const searchQueries = await generateSearchQueries(context, name)
	const searchResponses = await runSearches(searchQueries)

	// merge search query results. sum the per-search cost and collect the Resources
	const resourceByUrl = new Map<string, NewResource>()
	let cost = 0
	for (const response of searchResponses) {
		const searchResults = parseResults(response)
		cost += searchResults.cost

		// dedupe Resources across queries by url, keeping the first seen
		for (const resource of searchResults.resources) {
			if (!resourceByUrl.has(resource.url)) {
				resourceByUrl.set(resource.url, resource)
			}
		}
	}

	// expand any YouTube playlist result into its videos. the YouTube API bills by quota, so the cost is unchanged
	const resources = await expandYouTubePlaylists([...resourceByUrl.values()])
	// search requires an API key, so fallbackMode stays unset
	return { resources, cost }
}

// the shape of Exa's search response
type SearchResponse = {
	results: { url?: string; title?: string | null; highlights?: string[] }[]
	costDollars?: { total?: number }
}

// build the search prompt from the context. an empty context falls back to the topic name
export function buildSearchPrompt(context: string, name: string): string {
	// fall back to the topic name when the context is empty and cap the context length to bound token spend
	const topicContext = (context.trim() || name).slice(0, MAX_CONTEXT_CHARS)
	return `You are a research scout. Given the topic below, write up to ${MAX_QUERIES} diverse web search queries that would surface fresh, high-quality articles worth reading and YouTube playlists worth watching. Return only the queries.\n\nTopic:\n${topicContext}`
}

// generate a capped list of search queries from the topic context using the cheap model
async function generateSearchQueries(context: string, name: string): Promise<string[]> {
	// generateText's output setting returns structured output
	const { output } = await generateText({
		model: cheapModel(),
		output: Output.object({ schema: z.object({ queries: z.array(z.string()) }) }),
		prompt: buildSearchPrompt(context, name),
	})

	// trim, drop blanks, and dedupe the model output, then cap it so a chatty model doesn't inflate the search call count
	const queries = [...new Set(output.queries.map((query) => query.trim()).filter(Boolean))]
	return queries.slice(0, MAX_QUERIES)
}

// turn a search response into deduped "read" Resources plus the dollar cost that the provider reported for the search
export function parseResults(response: SearchResponse): { resources: NewResource[]; cost: number } {
	// keep the first Resource seen per url so repeated results collapse to one
	const resourceByUrl = new Map<string, NewResource>()
	for (const result of response.results) {
		// skip results without a usable url. a url is required to dedupe and a null url would break the batch insert
		if (typeof result.url !== "string" || resourceByUrl.has(result.url)) {
			continue
		}

		// map to a "read" Resource. the snippet joins Exa's highlights together. the contentHash stays null for curation to fill
		resourceByUrl.set(result.url, {
			url: result.url,
			title: result.title ?? null,
			kind: "read",
			snippet: result.highlights?.join(" ") || null,
			contentHash: null,
		})
	}

	// a missing costDollars.total counts as 0, so the Scan cost tracking is best-effort. LiteLLM meters the authoritative spend
	return { resources: [...resourceByUrl.values()], cost: response.costDollars?.total ?? 0 }
}

// run every query in parallel and keep the responses that succeeded. one bad query must not discard the rest
async function runSearches(searchQueries: string[]): Promise<SearchResponse[]> {
	// settle every query so one rejection cannot cancel the others
	const outcomes = await Promise.allSettled(searchQueries.map(runSearch))

	// collect the responses that succeeded and log each query that failed
	const searchResponses: SearchResponse[] = []
	for (const outcome of outcomes) {
		if (outcome.status === "fulfilled") {
			searchResponses.push(outcome.value)
		} else {
			console.error("exa search query failed", outcome.reason)
		}
	}

	// every query failing means the search itself is broken, so fail the Source instead of reporting zero results
	if (outcomes.length > 0 && searchResponses.length === 0) {
		throw new Error(`all ${outcomes.length} exa search queries failed`)
	}
	return searchResponses
}

// run one query using Exa search. the API key is required, so a missing key or a failed response throws
async function runSearch(query: string): Promise<SearchResponse> {
	// Exa requires an API key. without one this Source cannot run at all, so throw
	const apiKey = Bun.env.EXA_API_KEY
	if (!apiKey) {
		throw new Error("EXA_API_KEY is not set")
	}

	// POST the query with the API key header, bounded by the fetch timeout
	const response = await fetch(EXA_ENDPOINT, {
		method: "POST",
		headers: { "x-api-key": apiKey, "content-type": "application/json" },
		body: JSON.stringify({ query, numResults: RESULTS_PER_QUERY, type: "auto", contents: { highlights: true } }),
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	})

	// a failed response throws. runSearches keeps the queries that succeeded
	if (!response.ok) {
		throw new Error(`exa search returned ${response.status}`)
	}
	return (await response.json()) as SearchResponse
}

// expand any YouTube playlist result into its videos. Resources that are not playlists pass through unchanged
async function expandYouTubePlaylists(resources: NewResource[]): Promise<NewResource[]> {
	// playlist expansion needs the YouTube API key. without it, the playlist keeps its plain "read" link
	const apiKey = Bun.env.YOUTUBE_API_KEY
	if (!apiKey) {
		return resources
	}

	// expand every playlist in parallel. anything that is not a playlist passes through untouched
	const playlistResources = (
		await Promise.all(resources.map((resource) => expandYouTubePlaylist(resource, apiKey)))
	).flat()
	// dedupe the flattened Resources by url again so two playlists that share a video collapse to one
	const resourceByUrl = new Map<string, NewResource>()
	for (const resource of playlistResources) {
		if (!resourceByUrl.has(resource.url)) {
			resourceByUrl.set(resource.url, resource)
		}
	}
	return [...resourceByUrl.values()]
}

// expand a single Resource into its playlist's videos when its url is a playlist page. return the original link if it fails
async function expandYouTubePlaylist(resource: NewResource, apiKey: string): Promise<NewResource[]> {
	// a non-playlist url has nothing to expand
	const playlistId = playlistIdFromUrl(resource.url)
	if (!playlistId) {
		return [resource]
	}

	// a private, deleted, or slow playlist degrades to its "read" link instead of failing the whole search batch
	try {
		return await fetchVideos(playlistId, apiKey)
	} catch (error) {
		console.error(`search playlist ${playlistId} expansion failed`, error)
		return [resource]
	}
}
