// the Reddit adapter: app-only OAuth when credentials are set (sort modes), else keyless public subreddit rss
import type { NewResource, Source, SourceAdapter } from "./adapter"
import { fetchFeed } from "./feed"

// fetch knobs kept at the top per adapter-authoring
const LIMIT = 25
const DEFAULT_SORT = "hot"
const FETCH_TIMEOUT_MS = 10_000
// reddit rejects generic/absent User-Agents; send a descriptive one on every request (OAuth and rss)
const REDDIT_USER_AGENT = "carlnotes/0.1 (source-ingestion; +https://carlnotes.app)"

// fetch a subreddit's posts as read Resources: OAuth API when credentials are set, else keyless public rss
export const redditAdapter: SourceAdapter = async (source: Source) => {
	// the subreddit is required; sort is optional and only steers the OAuth path
	const subreddit = source.config.subreddit
	if (typeof subreddit !== "string") {
		throw new Error(`reddit source ${source.id} has no string config.subreddit`)
	}
	const sort = typeof source.config.sort === "string" ? source.config.sort : DEFAULT_SORT

	// use the app-only OAuth API only when both credentials are present; otherwise degrade to keyless rss
	const clientId = Bun.env.REDDIT_CLIENT_ID
	const clientSecret = Bun.env.REDDIT_CLIENT_SECRET
	if (clientId && clientSecret) {
		return { resources: await fetchPosts(subreddit, sort, clientId, clientSecret), cost: 0 }
	}
	// keyless fallback: the public subreddit .rss feed, tagged so the Scan records the degradation
	const rssUrl = `https://www.reddit.com/r/${subreddit}/.rss`
	return { resources: await fetchFeed(rssUrl, { userAgent: REDDIT_USER_AGENT }), cost: 0, fallbackMode: "reddit-rss" }
}

// the fields parsePosts reads from a reddit listing response
type RedditListing = { data: { children: { data: { permalink: string; title?: string } }[] } }

// pure listing→Resources: each post becomes a read Resource keyed by its comments permalink, deduped in-payload
export function parsePosts(json: RedditListing): NewResource[] {
	// keep the first Resource per permalink so a repeated post collapses to one
	const resourceByUrl = new Map<string, NewResource>()
	for (const child of json.data.children) {
		// the comments permalink is the canonical url in both modes, so a mode switch never re-keys a post
		const url = `https://www.reddit.com${child.data.permalink}`
		if (resourceByUrl.has(url)) {
			continue
		}
		// map to a read Resource; contentHash and embedding stay null for the curation pipeline to fill later
		resourceByUrl.set(url, { url, title: child.data.title ?? null, kind: "read", contentHash: null })
	}
	return [...resourceByUrl.values()]
}

// acquire an app-only token, fetch the sorted listing with the descriptive User-Agent, and parse it
async function fetchPosts(
	subreddit: string,
	sort: string,
	clientId: string,
	clientSecret: string,
): Promise<NewResource[]> {
	// client-credentials grant gives an app-only bearer token, no user context (integration_id stays null for MVP)
	const token = await fetchOauthToken(clientId, clientSecret)
	const url = `https://oauth.reddit.com/r/${subreddit}/${sort}?limit=${LIMIT}`
	const response = await fetch(url, {
		headers: { authorization: `Bearer ${token}`, "user-agent": REDDIT_USER_AGENT },
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	})
	// a non-ok listing degrades only this Source (isolated by runTopicScan)
	if (!response.ok) {
		throw new Error(`reddit listing r/${subreddit}/${sort} returned ${response.status}`)
	}
	return parsePosts((await response.json()) as RedditListing)
}

// exchange app credentials for an app-only bearer token via the client-credentials grant
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
	// ponytail: no token cache — a Scan touches a few reddit Sources; add a module cache only if it measures
	const token = ((await response.json()) as { access_token?: string }).access_token
	if (!token) {
		throw new Error("reddit token response had no access_token")
	}
	return token
}
