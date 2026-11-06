// the shared helper for feeds that don't require an API key

import { FetchStatusError, fetchPublicUrl, readLimitedBody } from "@carlnotes/server/publicFetch"
import Parser from "rss-parser"
import type { NewResource } from "./ingester"

// how long a feed fetch may run before it aborts. an oversized body is rejected by the shared read limit
const FETCH_TIMEOUT_MS = 10_000

// the transcript element a podcast feed publishes for an episode. rss-parser exposes an element's attributes under $
type FeedTranscript = { $?: { url?: string; type?: string } }

// the three places an entry item can name an address, in the order they are preferred
type FeedItemAddresses = { link?: string; guid?: string; enclosure?: { url?: string } }

// the transcript formats worth preferring, whose bytes are the words themselves
const READABLE_TRANSCRIPT_TYPES = ["text/plain", "text/vtt"]

// each part of an itunes:duration counts sixty of the part after it, as in 1:02:03
const SECONDS_PER_DURATION_PART = 60

// seconds, mm:ss, or hh:mm:ss, where a part may hold a decimal
const DURATION_PATTERN = /^\d+(\.\d+)?(:\d+(\.\d+)?){0,2}$/

// the most seconds the duration column holds
const MAX_DURATION_SECONDS = 2_147_483_647

// one reusable parser handles both RSS 2.0 and Atom, and reads a podcast item's itunes fields on its own
const parser = new Parser<unknown, { transcripts?: FeedTranscript[]; itunes?: { duration?: string } }>({
	customFields: { item: [["podcast:transcript", "transcripts", { keepArray: true }]] },
})

// fetch a feed url within the timeout, reject error responses and oversized bodies
export async function fetchFeed(
	url: string,
	options: { userAgent?: string; resourceKind?: NewResource["kind"] } = {},
): Promise<NewResource[]> {
	return (await fetchNamedFeed(url, options)).resources
}

/**
 * Fetch a feed keeping the feed's own name, which is the channel or show name its Source can be called by.
 */
export async function fetchNamedFeed(
	url: string,
	options: { userAgent?: string; resourceKind?: NewResource["kind"] } = {},
): Promise<{ feedName: string | null; resources: NewResource[] }> {
	// send a descriptive User-Agent when the caller provides one. reddit rejects generic or missing agents
	const headers = options.userAgent ? { "user-agent": options.userAgent } : undefined
	const response = await fetchPublicUrl(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })

	// reject error responses before reading the body
	if (!response.ok) {
		throw new FetchStatusError(url, response.status)
	}
	return parseNamedFeed(await readLimitedBody(response, url), options.resourceKind ?? "read")
}

// parsing is separate from fetching so it can be tested without a network
export async function parseFeed(xml: string, resourceKind: NewResource["kind"] = "read"): Promise<NewResource[]> {
	return (await parseNamedFeed(xml, resourceKind)).resources
}

// the parse itself, keeping the feed's title alongside its entries
async function parseNamedFeed(
	xml: string,
	resourceKind: NewResource["kind"],
): Promise<{ feedName: string | null; resources: NewResource[] }> {
	// parse RSS or Atom, then keep the first Resource seen per canonical url
	const feed = await parser.parseString(xml)
	const resourceByUrl = new Map<string, NewResource>()
	for (const feedItem of feed.items) {
		// skip entries with no usable canonical url. the url is the required, unique dedupe key
		const url = toFeedItemUrl(feedItem, feed.link)
		if (!url || resourceByUrl.has(url)) {
			continue
		}

		// map the url to a Resource. the snippet is the entry's own summary text. contentHash stays null for review to fill
		resourceByUrl.set(url, {
			url,
			title: feedItem.title ?? null,
			kind: resourceKind,
			snippet: feedItem.contentSnippet || feedItem.content || feedItem.summary || null,
			transcriptUrl: toTranscriptUrl(feedItem.transcripts),
			durationSeconds: toDurationSeconds(feedItem.itunes?.duration),
			contentHash: null,
		})
	}
	// the feed's own name and the deduped Resources, in feed order
	return { feedName: feed.title?.trim() || null, resources: [...resourceByUrl.values()] }
}

/**
 * Returns an itunes:duration in seconds, written as seconds, mm:ss, or hh:mm:ss. Null if it is missing, malformed,
 * zero, or past what the column holds.
 */
export function toDurationSeconds(duration: string | undefined): number | null {
	const trimmedDuration = duration?.trim() ?? ""
	if (!DURATION_PATTERN.test(trimmedDuration)) {
		return null
	}

	// add the parts up to whole seconds, and read a zero duration as unknown
	const durationParts = trimmedDuration.split(":").map(Number)
	const seconds = Math.round(durationParts.reduce((total, part) => total * SECONDS_PER_DURATION_PART + part, 0))
	return seconds > 0 && seconds <= MAX_DURATION_SECONDS ? seconds : null
}

/**
 * The transcript url to store for an entry, preferring a plain text or WebVTT one. Null if the entry names none.
 */
export function toTranscriptUrl(transcripts: FeedTranscript[] = []): string | null {
	// keep only the elements that name a url
	const namedTranscripts = transcripts.filter((transcript) => transcript.$?.url)
	const readableTranscript = namedTranscripts.find((transcript) =>
		READABLE_TRANSCRIPT_TYPES.includes(transcript.$?.type ?? ""),
	)

	// a readable format wins, and anything else is taken as the feed listed it
	return (readableTranscript ?? namedTranscripts[0])?.$?.url ?? null
}

/**
 * Select an entry's canonical url: its own link, an absolute guid, or the address of what it encloses.
 */
export function toFeedItemUrl(feedItem: FeedItemAddresses, feedLink?: string): string | undefined {
	// the address the entry names for itself. an absolute guid wins, and an enclosure names its audio file
	const guid = feedItem.guid?.trim()
	const entryUrl = guid?.startsWith("http") ? guid : feedItem.enclosure?.url?.trim()

	// a podcast feed often repeats the show's link on every episode
	const link = feedItem.link?.trim()
	if (link && link === feedLink?.trim() && entryUrl) {
		return entryUrl
	}

	// otherwise the entry's link wins, and an entry with no link falls back to the address it named
	return link || entryUrl
}
