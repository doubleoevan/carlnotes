// the shared helper for feeds that don't require an API key. it fetches an RSS or Atom url and parses it into deduped Resources
import Parser from "rss-parser"
import type { NewResource } from "./adapter"

// fetch limits used to bound slow feeds and reject oversized bodies
const FETCH_TIMEOUT_MS = 10_000
// cap the buffered body after reading. a streaming cap that aborts mid-download only if it matters
const MAX_FEED_BYTES = 5_000_000

// one reusable parser handles both RSS 2.0 and Atom
const parser = new Parser()

// fetch a feed url within the timeout, reject error responses and oversized bodies, then parse it into Resources of the given kind
export async function fetchFeed(
	url: string,
	options: { userAgent?: string; resourceKind?: NewResource["kind"] } = {},
): Promise<NewResource[]> {
	// send a descriptive User-Agent when the caller provides one. reddit rejects generic or missing agents
	const headers = options.userAgent ? { "user-agent": options.userAgent } : undefined
	const response = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })

	// reject error responses before reading the body
	if (!response.ok) {
		throw new Error(`feed ${url} returned ${response.status}`)
	}

	// content-length is often absent on feeds, so cap the actual body once read, then parse it
	const body = await response.text()
	if (body.length > MAX_FEED_BYTES) {
		throw new Error(`feed ${url} exceeds ${MAX_FEED_BYTES} bytes`)
	}
	return parseFeed(body, options.resourceKind)
}

// parsing is separate from fetching so it can be tested without a network. entries are deduped within the feed by canonical url
export async function parseFeed(xml: string, resourceKind: NewResource["kind"] = "read"): Promise<NewResource[]> {
	// parse RSS or Atom, then keep the first Resource seen per canonical url
	const feed = await parser.parseString(xml)
	const resourceByUrl = new Map<string, NewResource>()
	for (const feedItem of feed.items) {
		// skip entries with no usable canonical url. the url is the required, unique dedupe key
		const url = toFeedItemUrl(feedItem)
		if (!url || resourceByUrl.has(url)) {
			continue
		}
		// map the url to a Resource. the snippet is the entry's own summary text. contentHash stays null for curation to fill
		resourceByUrl.set(url, {
			url,
			title: feedItem.title ?? null,
			kind: resourceKind,
			snippet: feedItem.contentSnippet || feedItem.content || feedItem.summary || null,
			contentHash: null,
		})
	}
	// the deduped Resources, in feed order
	return [...resourceByUrl.values()]
}

// pick the canonical url. prefer the entry link and fall back to the guid only when it is an absolute url
function toFeedItemUrl(feedItem: { link?: string; guid?: string }): string | undefined {
	// a trimmed link wins. an absolute guid is the only accepted fallback
	const link = feedItem.link?.trim()
	if (link) {
		return link
	}
	const guid = feedItem.guid?.trim()
	return guid?.startsWith("http") ? guid : undefined
}
