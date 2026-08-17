// the Reddit ingester. it reads a subreddit listing or a search, preferring the app-only OAuth API and falling back
// to the keyless public feeds. reddit refuses its keyless .json endpoints outright while still serving the rss feeds,
// so the fallback reads those, at the cost of the post score and the configured sort

import { fetchFeed } from "./feed"
import type { NewResource, Source, SourceIngester } from "./ingester"

// fetch limits. the post cap is sent as the OAuth call's limit parameter,
// since an rss feed returns whatever length reddit serves
const MAX_POSTS = 25
const DEFAULT_SORT = "hot"
const FETCH_TIMEOUT_MS = 10_000

// reddit's own name and sort charsets. both land in a url path, so anything else is rejected instead of being encoded
const SUBREDDIT_PATTERN = /^[A-Za-z0-9_]{1,21}$/
const SUBREDDIT_SORTS = ["hot", "new", "top", "rising"]

// reddit rejects generic or missing User-Agents. send a descriptive one on every request, both OAuth and keyless
const REDDIT_USER_AGENT = "carlnotes/0.1 (source-ingestion; +https://carlnotes.com)"

// the OAuth host takes the token and returns the full listing JSON. the public host needs no credentials
// and serves the rss feeds, which is the only keyless reading that reddit still allows
const OAUTH_HOST = "https://oauth.reddit.com"
const PUBLIC_HOST = "https://www.reddit.com"

// what the Scan records for a Source the keyless feeds served
const RSS_FALLBACK_MODE = "reddit-rss"

// reddit refuses a burst from one address, and a Scan runs its Sources at once, so two reddit Sources would
// otherwise fetch in the same instant, and the second would be throttled. every request waits out its gap
// behind the one before it. the keyless gap is measured: 30 seconds apart is served, 15 seconds apart is refused.
// an authorized app has far more headroom, so the OAuth gap only keeps a Scan's Sources from arriving together.
const MIN_REQUEST_GAP_MS = { oauth: 1_000, rss: 30_000 }
let lastRequest: Promise<unknown> = Promise.resolve()

// which type of access an ingest attempt uses. OAuth sends a token, rss sends nothing
type AccessMode = "oauth" | "rss"

// what a Source fetches: a subreddit's listing with a sort, or a search that may be restricted to a subreddit
export type RedditRequest =
	| { kind: "listing"; subreddit: string; sort: string }
	| { kind: "search"; subreddit: string; query: string }

/**
 * Fetch a subreddit listing or a Reddit search as "read" Resources, preferring OAuth and falling back to the
 * keyless endpoints. A Source that every access mode refuses fails with the reason each one gave.
 */
export const redditIngester: SourceIngester = async (source: Source) => {
	// what the Source asked for, which is a subreddit it must name and a query it may add
	const request = toRedditRequest(source)

	// try each access mode in order and keep the first that answers, recording the keyless feeds as a fallback
	const clientId = Bun.env.REDDIT_CLIENT_ID
	const clientSecret = Bun.env.REDDIT_CLIENT_SECRET
	const failures: string[] = []
	for (const accessMode of toRedditAccessModes(Boolean(clientId && clientSecret))) {
		try {
			const resources = await fetchPosts(accessMode, request, clientId, clientSecret)

			// reddit charges nothing either way. only the keyless feeds record a fallback mode
			return accessMode === "oauth"
				? { resources, costDollars: 0 }
				: { resources, costDollars: 0, fallbackMode: RSS_FALLBACK_MODE }
		} catch (error) {
			// a refused access mode is not the Source's failure while another is left to try
			failures.push(`${accessMode} ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	// every access mode was refused, so the Source fails with what each one said. the Scan traces this and the report names it
	throw new Error(`reddit ${toRequestLabel(request)} failed in every access mode: ${failures.join("; ")}`)
}

// how a request reads in a failure message. it names what the Source asked for instead of one access mode's url,
// since the access modes that refused it are listed after it
function toRequestLabel(request: RedditRequest): string {
	if (request.kind === "listing") {
		return `r/${request.subreddit}/${request.sort}`
	}
	return request.subreddit ? `r/${request.subreddit} search "${request.query}"` : `search "${request.query}"`
}

/**
 * The subreddit a written value names, with any leading `r/` dropped, or null when reddit itself would not
 * accept the name. Source config and suggested subreddits both come through here, so what a Scan will read and
 * what a suggestion offers can never disagree.
 */
export function toSubredditName(value: unknown): string | null {
	// the subreddit name lands in a url path, so anything outside reddit's own charset is rejected instead of encoded
	const subredditName = typeof value === "string" ? value.trim().replace(/^r\//, "") : ""
	return SUBREDDIT_PATTERN.test(subredditName) ? subredditName : null
}

/**
 * Read a subreddit's keyless rss feed, the access mode a Scan falls back to, so that confirming a subreddit exercises
 * the same address the ingester will. It skips the request queue on purpose: suggestion runs in the api process
 * while ingestion runs in the worker, so the queue would never space these against a Scan. It would only add
 * its keyless gap to a reply someone is waiting on.
 */
export function fetchSubredditFeed(subreddit: string): Promise<NewResource[]> {
	return fetchFeed(toRssUrl({ kind: "listing", subreddit, sort: DEFAULT_SORT }), { userAgent: REDDIT_USER_AGENT })
}

/**
 * What a Source fetches, from its config: the listing of the subreddit it names,
 * or when it also has a query, a search inside that subreddit.
 */
export function toRedditRequest(source: Source): RedditRequest {
	// the subreddit is required, so a missing one or a name reddit would not accept fails the Source here
	const subreddit = toSubredditName(source.config.subreddit)
	if (!subreddit) {
		throw new Error(`reddit source ${source.id} needs a valid config.subreddit`)
	}

	// an unrecognized sort falls back instead of throwing, since it only sets the order posts come back in
	const configuredSort = source.config.sort
	const sort =
		typeof configuredSort === "string" && SUBREDDIT_SORTS.includes(configuredSort) ? configuredSort : DEFAULT_SORT

	// a query searches inside the subreddit, and no query reads its listing at the configured sort
	const configuredQuery = source.config.query
	const query = typeof configuredQuery === "string" ? configuredQuery.trim() : ""
	return query ? { kind: "search", subreddit, query } : { kind: "listing", subreddit, sort }
}

/**
 * The access modes to attempt, in order. OAuth is preferred wherever credentials are configured,
 * and the keyless rss feeds are the fallback, which is also the only access mode when no credentials are set.
 */
export function toRedditAccessModes(hasCredentials: boolean): AccessMode[] {
	return hasCredentials ? ["oauth", "rss"] : ["rss"]
}

/**
 * The OAuth url for a request, which returns the listing JSON including each post's selftext and score.
 * A search with no subreddit is the site-wide one: no Source builds that, since a Source must name a subreddit,
 * but searching reddit at large is how a subreddit is found in the first place, so both forms are built here.
 */
export function toOauthUrl(request: RedditRequest): string {
	// a listing reads the subreddit with its sort
	if (request.kind === "listing") {
		return `${OAUTH_HOST}/r/${request.subreddit}/${request.sort}?limit=${MAX_POSTS}`
	}

	// a search restricted to a subreddit is appended to that subreddit's path, and a site-wide search is at the root
	const searchQuery = new URLSearchParams({ q: request.query, limit: String(MAX_POSTS) })
	if (!request.subreddit) {
		return `${OAUTH_HOST}/search?${searchQuery}`
	}
	searchQuery.set("restrict_sr", "1")
	return `${OAUTH_HOST}/r/${request.subreddit}/search?${searchQuery}`
}

/**
 * The keyless url for a request. Reddit refuses its public `.json` endpoints but still serves these rss feeds,
 * which have no post-score and only the subreddit's default ordering. That loss is what the fallback records.
 * Like the OAuth builder, it also builds the site-wide search form that finding a subreddit needs.
 */
export function toRssUrl(request: RedditRequest): string {
	// the feed serves the subreddit's own default ordering, so the configured sort is lost in this access mode
	if (request.kind === "listing") {
		return `${PUBLIC_HOST}/r/${request.subreddit}/.rss`
	}

	// a search feed takes the query, restricted to the subreddit when the Source names one
	const searchQuery = new URLSearchParams({ q: request.query })
	if (!request.subreddit) {
		return `${PUBLIC_HOST}/search.rss?${searchQuery}`
	}
	searchQuery.set("restrict_sr", "1")
	return `${PUBLIC_HOST}/r/${request.subreddit}/search.rss?${searchQuery}`
}

// the fields parsePosts reads from a reddit listing response. a search returns this same shape
type RedditListing = {
	data: { children: { data: { permalink: string; title?: string; selftext?: string; score?: number } }[] }
}

/**
 * Map a reddit listing or search response to "read" Resources, each keyed by its comments permalink and deduped.
 */
export function parsePosts(json: RedditListing): NewResource[] {
	// keep the first Resource per permalink so a repeated post collapses to one
	const resourceByUrl = new Map<string, NewResource>()
	for (const child of json.data.children) {
		// the comments permalink is the canonical url in both OAuth and fallback access modes,
		// so an access mode switch never re-keys a post
		const url = `${PUBLIC_HOST}${child.data.permalink}`
		if (resourceByUrl.has(url)) {
			continue
		}

		// map the url to a "read" Resource. the snippet is the post selftext and the score is the engagement field.
		// contentHash stays null for review to fill
		resourceByUrl.set(url, {
			url,
			title: child.data.title ?? null,
			kind: "read",
			snippet: child.data.selftext || null,
			contentHash: null,
			engagement: child.data.score ?? null,
		})
	}
	// the deduped "read" Resources, in listing order
	return [...resourceByUrl.values()]
}

/**
 * Queue one reddit request behind the last one, leaving its access mode's gap between them whether the request succeeded or not
 */
export function queueRedditRequest<T>(accessMode: AccessMode, sendRequest: () => Promise<T>): Promise<T> {
	const queuedRequest = lastRequest.then(sendRequest)
	const waitOutGap = (): Promise<void> => Bun.sleep(MIN_REQUEST_GAP_MS[accessMode])
	lastRequest = queuedRequest.then(waitOutGap, waitOutGap)
	return queuedRequest
}

// fetch the request in one access mode and parse what it returns. the rss access mode goes through the shared feed parser,
// which already dedupes a feed by canonical url and returns "read" Resources
async function fetchPosts(
	accessMode: AccessMode,
	request: RedditRequest,
	clientId?: string,
	clientSecret?: string,
): Promise<NewResource[]> {
	if (accessMode === "rss") {
		return queueRedditRequest(accessMode, () => fetchFeed(toRssUrl(request), { userAgent: REDDIT_USER_AGENT }))
	}

	// the client credentials grant gives an app-only bearer token with no user context, so no Integration row is involved
	const token = clientId && clientSecret ? await fetchOauthToken(clientId, clientSecret) : undefined
	const response = await queueRedditRequest(accessMode, () =>
		fetch(toOauthUrl(request), {
			headers: { authorization: `Bearer ${token}`, "user-agent": REDDIT_USER_AGENT },
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		}),
	)

	// a refused listing ends this access mode
	if (!response.ok) {
		throw new Error(`listing returned ${response.status}`)
	}
	return parsePosts((await response.json()) as RedditListing)
}

// exchange app credentials for an app-only bearer token via the client credentials grant
async function fetchOauthToken(clientId: string, clientSecret: string): Promise<string> {
	// the body requests the app-only grant. the token call is queued like every other request reddit sees
	const response = await queueRedditRequest("oauth", () =>
		fetch(`${PUBLIC_HOST}/api/v1/access_token`, {
			method: "POST",
			// http basic auth sends the app credentials, plus the required descriptive User-Agent
			headers: {
				authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
				"content-type": "application/x-www-form-urlencoded",
				"user-agent": REDDIT_USER_AGENT,
			},
			body: "grant_type=client_credentials",
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		}),
	)

	// reject a non-ok token response before reading the body
	if (!response.ok) {
		throw new Error(`token request returned ${response.status}`)
	}

	// no token cache. one Source makes one token request per Scan, which is already the low request rate reddit asks for
	const token = ((await response.json()) as { access_token?: string }).access_token
	if (!token) {
		throw new Error("token response had no access_token")
	}
	return token
}
