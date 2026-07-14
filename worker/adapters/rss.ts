// the RSS adapter: turns a keyless RSS/Atom Source into canonical, deduped Resources (kind "read")
import Parser from "rss-parser"
import type { NewResource, Source, SourceAdapter } from "./adapter"

// fetch limits kept at the top per adapter-authoring: bound slow feeds and reject oversized bodies
const FETCH_TIMEOUT_MS = 10_000
// ponytail: naive byte cap read from content-length; a streaming cap only if hostile feeds become real
const MAX_FEED_BYTES = 5_000_000

// one reusable parser handles both RSS 2.0 and Atom
const parser = new Parser()

// read the feed url from the Source config, fetch it, and parse it into Resources; keyless, so cost is 0
export const rssAdapter: SourceAdapter = async (source: Source) => {
	// the feed url lives in the Source config; a non-string means a misconfigured Source (isolated by runTopicScan)
	const feedUrl = source.config.url
	if (typeof feedUrl !== "string") {
		throw new Error(`rss source ${source.id} has no string config.url`)
	}
	// fetch within a timeout, then reject error responses and oversized bodies before parsing
	const response = await fetch(feedUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
	if (!response.ok) {
		throw new Error(`rss feed ${feedUrl} returned ${response.status}`)
	}
	if (Number(response.headers.get("content-length")) > MAX_FEED_BYTES) {
		throw new Error(`rss feed ${feedUrl} exceeds ${MAX_FEED_BYTES} bytes`)
	}
	// parse the body into Resources
	const xml = await response.text()
	return { resources: await parseFeed(xml), cost: 0 }
}

// pure XML→Resources so it can be tested without a network; entries are deduped within the feed by canonical url
export async function parseFeed(xml: string): Promise<NewResource[]> {
	// parse RSS or Atom, then keep the first Resource seen per canonical url
	const feed = await parser.parseString(xml)
	const resourceByUrl = new Map<string, NewResource>()
	for (const item of feed.items) {
		// skip entries with no usable canonical url — url is the required, unique dedupe key
		const url = feedItemToUrl(item)
		if (!url || resourceByUrl.has(url)) {
			continue
		}
		// map the entry to a Resource; embedding stays null for the curation pipeline to fill later
		resourceByUrl.set(url, {
			url,
			title: item.title ?? null,
			kind: "read",
			contentHash: hashContent(item.title, item.content ?? item.contentSnippet),
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
