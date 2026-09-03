// the X ingester
import { X_COST_MINIMUM_PER_REQUEST, X_COST_PER_READ } from "../budget"
import { FeedStatusError } from "./feed"
import type { IngestResult, NewResource, Source, SourceIngester } from "./ingester"

// an x handle is up to fifteen letters, digits, or underscores
const HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/

// how far back a query looks. a Scan wants the current conversation, and an unbounded window spends reads on stale posts
const RECENCY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

// how long one provider request may run before it aborts
const FETCH_TIMEOUT_MS = 10_000

// one retry after this pause when the provider rate-limits a query
const RATE_LIMIT_RETRY_MS = 5500

// the shortened links X rewrites every url into. they say nothing on their own, so they come out of the snippet
const SHORTENED_LINK_PATTERN = /https:\/\/t\.co\/\w+/g

// TwitterAPI.io is the current provider and may be swapped later
const ADVANCED_SEARCH_ENDPOINT = "https://api.twitterapi.io/twitter/tweet/advanced_search"
const USER_INFO_ENDPOINT = "https://api.twitterapi.io/twitter/user/info"

// read one handle's recent tweets as Resources. an x Source names the account to follow
export const xIngester: SourceIngester = async (source: Source) => {
	// the handle is required
	const handle = toSourceHandle(source.config)
	if (!handle) {
		throw new Error(`x source ${source.id} has no valid config.handle`)
	}

	// one request for that account's recent tweets. X needs a key, so fallbackMode stays unset
	const searchResponses = await runSearches([`from:${handle}`])
	return mergeSearchResponses(searchResponses)
}

/**
 * The handle an x Source follows, or null if the config names none that X would accept.
 * A leading @ is how people write a handle, so it is dropped.
 */
export function toSourceHandle(config: Record<string, unknown>): string | null {
	const configuredHandle = config.handle
	if (typeof configuredHandle !== "string") {
		return null
	}

	// the cleaned handle only counts if X would resolve it. it goes straight into a query operator
	const handle = configuredHandle.trim().replace(/^@/, "")
	return HANDLE_PATTERN.test(handle) ? handle : null
}

/**
 * Confirms X that knows the handle, for the suggestion flow that has to drop an account that the model invented.
 * Throws a FeedStatusError when the provider would not answer, so a rate limit reads as "not now" instead of "no such account".
 */
export async function readHandle(handle: string): Promise<void> {
	// a handle X would never resolve is invented, whatever the provider would say about it
	if (!HANDLE_PATTERN.test(handle.trim().replace(/^@/, ""))) {
		throw new Error(`x handle ${handle} is not a handle X could resolve`)
	}

	// look the account up instead of reading its tweets, so an account that posts rarely still confirms
	const username = handle.trim().replace(/^@/, "")
	const response = await requestProvider(`${USER_INFO_ENDPOINT}?userName=${encodeURIComponent(username)}`)

	// a rejected request is the provider saying "not now", which the caller keeps instead of dropping
	if (!response.ok) {
		throw new FeedStatusError(USER_INFO_ENDPOINT, response.status)
	}

	// the lookup returns 200 for a missing account too, so the body decides, not the status
	const userInfo = (await response.json()) as { status?: string; data?: { statusesCount?: number } | null }
	if (userInfo.status !== "success" || !userInfo.data) {
		throw new Error(`x has no account @${username}`)
	}

	// a handle a model invented often matches a real but dormant account that someone registered and left
	if (userInfo.data.statusesCount === 0) {
		throw new Error(`x account @${username} has never posted`)
	}
}

// the fields this ingester reads from an advanced search response
type SearchResponse = {
	tweets: { id?: string; text?: string; likeCount?: number; author?: { userName?: string } }[]
}

/**
 * One query with the filters the caller owns: no retweets, and only the recent window.
 * A retweet duplicates a tweet the account's own timeline already returns, so reading it is spending money on nothing.
 */
export function toBoundedQuery(query: string, nowMs: number): string {
	const sinceSeconds = Math.floor((nowMs - RECENCY_WINDOW_MS) / 1000)
	return `${query} -filter:retweets since_time:${sinceSeconds}`
}

/**
 * The Resources and the cost across every response, deduped by url.
 */
export function mergeSearchResponses(responses: SearchResponse[]): IngestResult {
	// sum what the reads cost and collect the Resources, keeping the first seen per url
	const resourceByUrl = new Map<string, NewResource>()
	let costDollars = 0
	for (const response of responses) {
		costDollars += toRequestCost(response)

		// merge this response's Resources into the deduped set
		for (const resource of toResources(response)) {
			if (!resourceByUrl.has(resource.url)) {
				resourceByUrl.set(resource.url, resource)
			}
		}
	}

	// the deduped Resources and what their reads cost
	return { resources: [...resourceByUrl.values()], costDollars }
}

/**
 * The deduped "read" Resources in one advanced search response, keyed by the tweet's canonical url.
 */
export function toResources(response: SearchResponse): NewResource[] {
	// keep the first Resource seen per url so a tweet repeated within one response collapses to one
	const resourceByUrl = new Map<string, NewResource>()
	for (const tweet of response.tweets) {
		// a tweet missing its id or its author handle has no url to key on, and a null url would break the batch insert
		const handle = tweet.author?.userName
		if (!tweet.id || !handle) {
			continue
		}

		// the url is built from the handle and the id instead of the one the provider echoes back
		const url = `https://x.com/${handle}/status/${tweet.id}`
		if (!resourceByUrl.has(url)) {
			resourceByUrl.set(url, {
				url,
				title: `@${handle} on X`,
				kind: "read",
				snippet: toSnippet(tweet.text),
				contentHash: null,
				engagement: tweet.likeCount ?? null,
			})
		}
	}
	return [...resourceByUrl.values()]
}

/**
 * A tweet's text as the Resource's snippet, with the shortened links stripped out.
 * A tweet that was only a link leaves nothing to score, so it reads as no snippet instead of as a bare url.
 */
export function toSnippet(text: string | undefined): string | null {
	return text?.replace(SHORTENED_LINK_PATTERN, "").trim() || null
}

/**
 * What one request's reads cost, floored at the provider's per-request minimum, so an empty response still reports what it cost.
 */
export function toRequestCost(response: SearchResponse): number {
	return Math.max(response.tweets.length * X_COST_PER_READ, X_COST_MINIMUM_PER_REQUEST)
}

// run the queries one at a time and keep the responses that succeeded
async function runSearches(searchQueries: string[]): Promise<SearchResponse[]> {
	// collect the responses that succeeded and log each query that failed
	const searchResponses: SearchResponse[] = []
	for (const query of searchQueries) {
		try {
			searchResponses.push(await runSearch(query))
		} catch (error) {
			console.error("x search query failed", error)
		}
	}

	// every query failing means the search itself is broken, so fail the Source instead of reporting zero results
	if (searchQueries.length > 0 && searchResponses.length === 0) {
		throw new Error(`all ${searchQueries.length} x search queries failed`)
	}
	return searchResponses
}

// run one query through advanced search. the API key is required, so a missing key or a failed response throws an error
async function runSearch(query: string): Promise<SearchResponse> {
	// this ingest runs as a Temporal activity, so reading the clock here is fine
	const searchParameters = new URLSearchParams({ query: toBoundedQuery(query, Date.now()), queryType: "Latest" })
	return toSearchResponse(await requestProvider(`${ADVANCED_SEARCH_ENDPOINT}?${searchParameters}`))
}

// request the provider with the operator key, retrying once when it rate-limits the call
async function requestProvider(url: string): Promise<Response> {
	// the provider requires an operator-level key. without one nothing here can run at all, so throw an error
	const apiKey = Bun.env.TWITTERAPI_IO_API_KEY
	if (!apiKey) {
		throw new Error("TWITTERAPI_IO_API_KEY is not set")
	}

	// the first attempt, then one more after the rate-limit window has passed
	const response = await fetchProvider(url, apiKey)
	if (response.status !== 429) {
		return response
	}
	await Bun.sleep(RATE_LIMIT_RETRY_MS)
	return fetchProvider(url, apiKey)
}

// one provider request with the operator key, bounded by the fetch timeout
function fetchProvider(url: string, apiKey: string): Promise<Response> {
	return fetch(url, { headers: { "x-api-key": apiKey }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
}

// read the tweets out of a response. a failed response throws an error, and runSearches keeps the queries that succeeded
async function toSearchResponse(response: Response): Promise<SearchResponse> {
	// the body names which limit or rejection it was, which the status alone leaves to guesswork
	if (!response.ok) {
		throw new Error(`x advanced search returned ${response.status}: ${await response.text()}`)
	}

	// a response without a tweets array would break the merge, so it reads as an empty one
	const searchResponse = (await response.json()) as Partial<SearchResponse>
	return { tweets: searchResponse.tweets ?? [] }
}
