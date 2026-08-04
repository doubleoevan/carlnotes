// the shared helper for feeds that don't require an API key. it fetches an RSS or Atom url and parses it into deduped Resources
import Parser from "rss-parser"
import { toFetchableUrl } from "../scrape"
import type { NewResource } from "./ingester"

// fetch limits used to bound slow feeds and reject oversized bodies
const FETCH_TIMEOUT_MS = 10_000
// the cap applied while reading, so an oversized feed never lands in memory
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
	const response = await fetch(toFetchableUrl(url), { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })

	// reject error responses before reading the body
	if (!response.ok) {
		throw new Error(`feed ${url} returned ${response.status}`)
	}
	return parseFeed(await readCappedBody(response, url), options.resourceKind)
}

// read the body a chunk at a time and stop at the cap, so an endless response is dropped instead of buffered whole
async function readCappedBody(response: Response, url: string): Promise<string> {
	const reader = response.body?.getReader()
	if (!reader) {
		return ""
	}

	// chunks are collected instead of being decoded as they arrive, since a character can straddle two of them
	const chunks: Uint8Array[] = []
	let byteCount = 0
	while (true) {
		const { done, value } = await reader.read()
		if (done) {
			break
		}

		// cancelling closes the connection, so an endless response stops costing us bandwidth
		byteCount += value.length
		if (byteCount > MAX_FEED_BYTES) {
			await reader.cancel()
			throw new Error(`feed ${url} exceeds ${MAX_FEED_BYTES} bytes`)
		}
		chunks.push(value)
	}

	// join the chunks once, since a decoder cannot span them safely
	const body = new Uint8Array(byteCount)
	let offset = 0
	for (const chunk of chunks) {
		body.set(chunk, offset)
		offset += chunk.length
	}
	return new TextDecoder().decode(body)
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

		// map the url to a Resource. the snippet is the entry's own summary text. contentHash stays null for review to fill
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
