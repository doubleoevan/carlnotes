// the bluesky ingester

import { FeedStatusError } from "./feed"
import type { IngestedResource, Source, SourceIngester } from "./ingester"
import { toResourceKind } from "./normalize"

// reads go to the AppView, the aggregated index the network is read through
const PUBLIC_APPVIEW_URL = "https://public.api.bsky.app"

// fetch limits. bluesky meters by points per hour (about 5000 for one account), so one Source is one call
const AUTHOR_FEED_LIMIT = 50
const FETCH_TIMEOUT_MS = 10_000

// how long to wait out a 429 that names no interval, and the limit on any interval it does name
const DEFAULT_BACKOFF_MS = 5_000
const MAX_BACKOFF_MS = 30_000

// the fields this ingester reads from a post. the link card is what holds the article
type BlueskyPost = {
	author?: { handle?: string }
	embed?: BlueskyEmbed
	likeCount?: number
}

// a post links to a page through an external embed, which a post with its own image nests under media instead
type BlueskyEmbed = {
	external?: { uri?: string; title?: string; description?: string }
	media?: { external?: { uri?: string; title?: string; description?: string } }
}

// getAuthorFeed wraps each post in a feed entry
type AuthorFeedResponse = { feed?: { post: BlueskyPost }[] }

// read one account's recent posts and return the articles they link to
export const blueskyIngester: SourceIngester = async (source: Source) => {
	// the Source names the account whose links to follow
	const configuredHandle = source.config.handle
	if (typeof configuredHandle !== "string" || !configuredHandle.trim()) {
		throw new Error(`bluesky source ${source.id} has no string config.handle`)
	}

	// the public appview serves an account's posts without any credential, and the api is free, so the Source charges nothing
	const handle = configuredHandle.trim().replace(/^@/, "")
	return { resources: parseLinks(await fetchAuthorFeed(handle)), costDollars: 0 }
}

/**
 * Maps the articles a set of posts link to into Resources, deduped by url. A post that links to nothing is skipped.
 */
export function parseLinks(posts: BlueskyPost[]): IngestedResource[] {
	// keep the first Resource per url so an account posting the same article twice collapses to one
	const resourceByUrl = new Map<string, IngestedResource>()
	for (const post of posts) {
		// a post has its link as an external embed, which sits under media when the post has its own image too
		const external = post.embed?.external ?? post.embed?.media?.external
		const url = external?.uri
		if (!url || resourceByUrl.has(url) || isInternalLink(url)) {
			continue
		}

		// the link card names and describes the page it points at, so the article titles and summarizes itself
		resourceByUrl.set(url, {
			url,
			title: external?.title?.trim() || null,
			kind: toResourceKind(url),
			snippet: external?.description?.trim() || null,
			contentHash: null,
			// the sharing post's likes are used as the article's engagement
			engagement: post.likeCount ?? null,
		})
	}
	// the deduped Resources, in the order they arrived
	return [...resourceByUrl.values()]
}

/**
 * How long to wait out a 429 "Too Many Requests" code:
 * the reset time the response names, otherwise its retry-after, otherwise the default. Always limited.
 */
export function toBackoffMs(headers: Headers): number {
	// ratelimit-reset is a unix time in seconds, while retry-after counts seconds from now
	const resetAt = Number(headers.get("ratelimit-reset"))
	const retryAfter = Number(headers.get("retry-after"))
	const waitMs = resetAt ? resetAt * 1000 - Date.now() : retryAfter * 1000

	// a missing, unreadable, or already-passed interval waits the default instead
	return Math.min(waitMs > 0 ? waitMs : DEFAULT_BACKOFF_MS, MAX_BACKOFF_MS)
}

/**
 * One account's recent posts from the public appview, which needs no session. The source suggestion flow confirms an
 * account exists through this same call, asking for a single post instead of an entire scan's worth.
 */
export async function fetchAuthorFeed(handle: string, limit: number = AUTHOR_FEED_LIMIT): Promise<BlueskyPost[]> {
	const url = `${PUBLIC_APPVIEW_URL}/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=${limit}`
	const response = await fetchWithBackoff(url)

	// each feed entry wraps the post it lists, and a reply or repost entry still holds a post whose link counts
	const authorFeed = await readJson<AuthorFeedResponse>(response, `getAuthorFeed ${handle}`)
	return (authorFeed.feed ?? []).map((entry) => entry.post)
}

// a link back into bluesky is a quote or a profile, not an article worth fetching
function isInternalLink(url: string): boolean {
	return url.startsWith("https://bsky.app/") || url.startsWith("https://go.bsky.app/")
}

// fetch an endpoint, waiting out one 429 before retrying it. a second 429 comes back and fails the Source
async function fetchWithBackoff(url: string): Promise<Response> {
	const response = await fetchXrpc(url)
	if (response.status !== 429) {
		return response
	}

	// wait for the interval the response itself named, then try only one more time
	await Bun.sleep(toBackoffMs(response.headers))
	return fetchXrpc(url)
}

// one bounded GET. the AppView needs no credential, so nothing is sent beyond the url
function fetchXrpc(url: string): Promise<Response> {
	return fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
}

// read a response body, failing the Source on any status the endpoint did not serve
async function readJson<T>(response: Response, label: string): Promise<T> {
	if (!response.ok) {
		throw new FeedStatusError(label, response.status)
	}
	return (await response.json()) as T
}
