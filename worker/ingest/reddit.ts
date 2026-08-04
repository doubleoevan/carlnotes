// the Reddit ingester. it uses the app-only OAuth API when credentials are set, else the keyless public subreddit rss feed

import { fetchFeed } from "./feed"
import type { NewResource, Source, SourceIngester } from "./ingester"

// fetch limits
const MAX_POSTS = 25
const DEFAULT_SORT = "hot"

// reddit's own name and sort charsets. both land in a url path, so anything else is refused instead of being encoded
const SUBREDDIT_PATTERN = /^[A-Za-z0-9_]{1,21}$/
const SUBREDDIT_SORTS = ["hot", "new", "top", "rising"]
const FETCH_TIMEOUT_MS = 10_000

// reddit rejects generic or missing User-Agents. send a descriptive one on every request, both OAuth and rss
const REDDIT_USER_AGENT = "carlnotes/0.1 (source-ingestion; +https://carlnotes.com)"

// fetch a subreddit's posts as "read" Resources. use the OAuth API if credentials are set, else the keyless public rss feed
export const redditIngester: SourceIngester = async (source: Source) => {
	// the subreddit is required. sort is optional and only steers the OAuth path
	const subreddit = source.config.subreddit
	if (typeof subreddit !== "string" || !SUBREDDIT_PATTERN.test(subreddit)) {
		throw new Error(`reddit source ${source.id} has no valid config.subreddit`)
	}

	// an unrecognized sort falls back instead of throwing, since it only steers ordering
	const configuredSort = source.config.sort
	const sort =
		typeof configuredSort === "string" && SUBREDDIT_SORTS.includes(configuredSort) ? configuredSort : DEFAULT_SORT

	// use the app-only OAuth API only when both credentials are present. otherwise fall back to public rss
	const clientId = Bun.env.REDDIT_CLIENT_ID
	const clientSecret = Bun.env.REDDIT_CLIENT_SECRET
	if (clientId && clientSecret) {
		return { resources: await fetchPosts(subreddit, sort, clientId, clientSecret), cost: 0 }
	}

	// fall back to the public subreddit .rss feed, tagged so the Scan records the fallback
	const rssUrl = `https://www.reddit.com/r/${subreddit}/.rss`
	return { resources: await fetchFeed(rssUrl, { userAgent: REDDIT_USER_AGENT }), cost: 0, fallbackMode: "reddit-rss" }
}

// the fields parsePosts reads from a reddit listing response
type RedditListing = {
	data: { children: { data: { permalink: string; title?: string; selftext?: string; score?: number } }[] }
}

// map a reddit listing to "read" Resources. each post is keyed by its comments permalink and deduped within the payload
export function parsePosts(json: RedditListing): NewResource[] {
	// keep the first Resource per permalink so a repeated post collapses to one
	const resourceByUrl = new Map<string, NewResource>()
	for (const child of json.data.children) {
		// the comments permalink is the canonical url in both modes, so a mode switch never re-keys a post
		const url = `https://www.reddit.com${child.data.permalink}`
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

// acquire an app-only token, fetch the sorted listing with the descriptive User-Agent, and parse it
async function fetchPosts(
	subreddit: string,
	sort: string,
	clientId: string,
	clientSecret: string,
): Promise<NewResource[]> {
	// the client credentials grant gives an app-only bearer token with no user context, so no Integration row is involved yet
	const token = await fetchOauthToken(clientId, clientSecret)
	const url = `https://oauth.reddit.com/r/${subreddit}/${sort}?limit=${MAX_POSTS}`
	const response = await fetch(url, {
		headers: { authorization: `Bearer ${token}`, "user-agent": REDDIT_USER_AGENT },
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	})

	// a failed listing stops only this Source. the Scan isolates the failure
	if (!response.ok) {
		throw new Error(`reddit listing r/${subreddit}/${sort} returned ${response.status}`)
	}
	return parsePosts((await response.json()) as RedditListing)
}

// exchange app credentials for an app-only bearer token via the client credentials grant
async function fetchOauthToken(clientId: string, clientSecret: string): Promise<string> {
	// the body requests the app-only grant
	const response = await fetch("https://www.reddit.com/api/v1/access_token", {
		method: "POST",
		// http basic auth carries the app credentials, plus the required descriptive User-Agent
		headers: {
			authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
			"content-type": "application/x-www-form-urlencoded",
			"user-agent": REDDIT_USER_AGENT,
		},
		body: "grant_type=client_credentials",
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	})

	// reject a non-ok token response before reading the body
	if (!response.ok) {
		throw new Error(`reddit token request returned ${response.status}`)
	}

	// no token cache. a Scan only touches a few reddit Sources. add a module cache only if it measures
	const token = ((await response.json()) as { access_token?: string }).access_token
	if (!token) {
		throw new Error("reddit token response had no access_token")
	}
	return token
}
