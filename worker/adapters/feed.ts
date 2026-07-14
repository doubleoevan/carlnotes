// the shared keyless-feed path: fetch an RSS/Atom url (optional User-Agent) and parse it into deduped Resources
import Parser from "rss-parser"
import type { NewResource } from "./adapter"

// fetch limits kept at the top per adapter-authoring: bound slow feeds and reject oversized bodies
const FETCH_TIMEOUT_MS = 10_000
// ponytail: cap the buffered body after reading; a streaming cap that aborts mid-download only if it matters
const MAX_FEED_BYTES = 5_000_000

// one reusable parser handles both RSS 2.0 and Atom
const parser = new Parser()

// fetch a feed url within a timeout, reject errors/oversized bodies, then parse it into Resources of the given kind
export async function fetchFeed(
	url: string,
	options: { userAgent?: string; kind?: NewResource["kind"] } = {},
): Promise<NewResource[]> {
	// send a descriptive User-Agent when given (reddit rejects generic/absent agents); otherwise send none
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
	return parseFeed(body, options.kind)
}

// pure XML→Resources so it can be tested without a network; entries are deduped within the feed by canonical url
export async function parseFeed(xml: string, kind: NewResource["kind"] = "read"): Promise<NewResource[]> {
	// parse RSS or Atom, then keep the first Resource seen per canonical url
	const feed = await parser.parseString(xml)
	const resourceByUrl = new Map<string, NewResource>()
	for (const feedItem of feed.items) {
		// skip entries with no usable canonical url — url is the required, unique dedupe key
		const url = feedItemToUrl(feedItem)
		if (!url || resourceByUrl.has(url)) {
			continue
		}
		// map the entry to a Resource; embedding stays null for the curation pipeline to fill later
		resourceByUrl.set(url, {
			url,
			title: feedItem.title ?? null,
			kind,
			contentHash: hashContent(feedItem.title, feedItem.content ?? feedItem.contentSnippet),
		})
	}
	// the deduped Resources, in feed order
	return [...resourceByUrl.values()]
}

// canonical url: prefer the entry link, fall back to guid only when it is an absolute url
function feedItemToUrl(feedItem: { link?: string; guid?: string }): string | undefined {
	// a trimmed link is canonical; an absolute guid is the only accepted fallback
	const link = feedItem.link?.trim()
	if (link) {
		return link
	}
	const guid = feedItem.guid?.trim()
	return guid?.startsWith("http") ? guid : undefined
}

// stable sha256 over title+body so content-level duplicates can be caught later (url stays the live dedupe key)
function hashContent(title: string | undefined, body: string | undefined): string {
	// hash the concatenated text; empty parts are fine, this only needs to be deterministic
	return new Bun.CryptoHasher("sha256").update(`${title ?? ""}\n${body ?? ""}`).digest("hex")
}
