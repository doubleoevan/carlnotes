// fill a Resource's content: a published transcript or a video's caption track read straight from the origin,
// or any other page as Markdown through Firecrawl. a conditional GET checks whether stored content changed
import type { resourceKinds } from "@carlnotes/contracts/enums"
import { isSameSiteUrl } from "@carlnotes/contracts/sources"
import { DAY_MS } from "@carlnotes/contracts/time"
import { FIRECRAWL_COST_PER_FETCH } from "@carlnotes/models/budget"
import { toPositiveInteger } from "@carlnotes/server/envSettings"
import { FetchStatusError, fetchPublicUrl } from "@carlnotes/server/publicFetch"
import { fetchRedditThread, toRedditPostId } from "./ingest/reddit"
import { CAPTION_HOSTS, fetchDeclaredTranscript } from "./transcripts"

// the Firecrawl endpoint that scrapes a page to Markdown
const FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v1/scrape"

// how long a Firecrawl scrape may run before it aborts
const SCRAPE_TIMEOUT_MS = 30_000

// how long stored content is reused instead of a fetch
export const CONTENT_TTL_MS = toTtlMs(Bun.env.CONTENT_TTL_MS)

// the ttl that a setting names, or the one-day default when it names nothing usable
function toTtlMs(setting: string | undefined): number {
	const ttlMs = Number(setting)
	return setting && Number.isFinite(ttlMs) && ttlMs >= 0 ? ttlMs : DAY_MS
}

/**
 * Whether stored content has outlived the ttl window and needs revalidating or refetching before it is read again.
 */
export function isContentStale(fetchedAt: Date, now: Date, ttlMs: number): boolean {
	return now.getTime() - fetchedAt.getTime() >= ttlMs
}

// how long the revalidation request may run before it aborts, so a slow origin never holds up a scan
const REVALIDATE_TIMEOUT_MS = toPositiveInteger(Bun.env.REVALIDATE_TIMEOUT_MS, 5000)

// a fetch's text result and what it spent, plus the etag and last-modified for a later conditional GET,
// and the page's own title and favicon url if the fetch read a page
export type FetchResult = {
	text: string
	cost: number
	etag: string | null
	lastModified: string | null
	title: string | null
	faviconUrl: string | null
}

// the stored etag and last-modified a conditional GET is built from. either may be null
export type FetchValidators = { etag: string | null; lastModified: string | null }

// what a Resource is: read, watch, or listen
type ResourceKind = (typeof resourceKinds)[number]

/**
 * Fetch one Resource's content by the path its kind and url select. A transcript or caption path that produces no text throws an error.
 * An episode that declares no transcript returns empty text at no cost.
 */
export async function fetchContent(
	url: string,
	resourceKind: ResourceKind,
	transcriptUrl: string | null = null,
): Promise<FetchResult> {
	// a transcript that the publisher declared is the page's words without the page, whatever kind of Resource it is
	if (transcriptUrl) {
		return fetchDeclaredTranscript(transcriptUrl)
	}

	// an episode that declared none is a player and its show notes, and the notes are already in the snippet
	if (resourceKind === "listen") {
		return { text: "", cost: 0, etag: null, lastModified: null, title: null, faviconUrl: null }
	}

	// reddit rejects firecrawl, and its own api returns the replies where a thread's words are
	const redditPostId = toRedditPostId(url)
	if (redditPostId) {
		const text = await fetchRedditThread(redditPostId)
		return { text: text ?? "", cost: 0, etag: null, lastModified: null, title: null, faviconUrl: null }
	}

	// only a video publishes captions worth reading, so anything else is scraped
	if (resourceKind !== "watch") {
		return fetchFirecrawlMarkdown(url)
	}

	// a video's words are published as its caption track, so the url selects which host to ask for it
	for (const captionHost of CAPTION_HOSTS) {
		const videoId = captionHost.toVideoId(url)
		if (videoId) {
			return captionHost.fetchTranscript(videoId)
		}
	}
	return fetchFirecrawlMarkdown(url)
}

// scrape one url to Markdown via Firecrawl
async function fetchFirecrawlMarkdown(url: string): Promise<FetchResult> {
	// Firecrawl requires a key. throw an error when it isn't set so the review can fall back to the snippet
	const apiKey = Bun.env.FIRECRAWL_API_KEY
	if (!apiKey) {
		throw new Error("FIRECRAWL_API_KEY is not set")
	}

	// request only the main-content Markdown of the page, bounded by the fetch timeout
	const response = await fetch(FIRECRAWL_ENDPOINT, {
		method: "POST",
		headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
		body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
		signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
	})

	// a failed scrape throws an error. review catches the error and scores the snippet instead
	if (!response.ok) {
		throw new FetchStatusError(`firecrawl scrape ${url}`, response.status)
	}

	// Firecrawl wraps the page under data.markdown. an empty or whitespace body means the scrape failed, so throw an error
	const payload = (await response.json()) as { data?: { markdown?: string; metadata?: Record<string, unknown> } }
	const markdown = payload.data?.markdown ?? ""
	if (!markdown.trim()) {
		throw new Error(`firecrawl scrape ${url} returned no content`)
	}

	// read the etag, last-modified, the page's own title, and its favicon from Firecrawl's page metadata when present
	const metadata = payload.data?.metadata ?? {}
	const etag = typeof metadata.etag === "string" ? metadata.etag : null
	const lastModified = typeof metadata["last-modified"] === "string" ? metadata["last-modified"] : null
	const title = typeof metadata.title === "string" ? metadata.title.trim() || null : null
	const faviconUrl = toPageFaviconUrl(metadata, url)
	return { text: markdown, cost: FIRECRAWL_COST_PER_FETCH, etag, lastModified, title, faviconUrl }
}

// the icon the fetched page names, or null when the fetch landed on another site, whose icon is not this host's.
// a large site serves its icon from a cdn, so the page's own host is what decides, never the icon's host
export function toPageFaviconUrl(metadata: Record<string, unknown>, requestedUrl: string): string | null {
	// firecrawl reports where it landed, which is the publisher for a url that wraps a redirect
	const landedUrl = typeof metadata.url === "string" ? metadata.url : requestedUrl
	if (!isSameSiteUrl(landedUrl, requestedUrl)) {
		return null
	}
	return toAbsoluteFaviconUrl(typeof metadata.favicon === "string" ? metadata.favicon : null, landedUrl)
}

// a favicon url firecrawl names relative to its page, made absolute
function toAbsoluteFaviconUrl(faviconUrl: string | null, pageUrl: string): string | null {
	try {
		if (!faviconUrl) {
			return null
		}
		const absoluteUrl = new URL(faviconUrl, pageUrl)
		// keep only an http or https url
		return absoluteUrl.protocol === "http:" || absoluteUrl.protocol === "https:" ? absoluteUrl.href : null
	} catch {
		return null
	}
}

// check with a conditional GET whether the stored content is still current, bounded by its own timeout
export async function revalidateContent(
	url: string,
	validators: FetchValidators,
): Promise<"not-modified" | "changed" | "failed"> {
	// a direct conditional GET does not go through Firecrawl, so a 304 spends no scrape credit
	try {
		const response = await fetchPublicUrl(url, {
			headers: conditionalHeaders(validators),
			signal: AbortSignal.timeout(REVALIDATE_TIMEOUT_MS),
		})
		return revalidationOutcome(response.status)
	} catch (error) {
		// a thrown or timed-out check is not a resource failure. report it so the caller can fetch instead
		console.error(`conditional refetch failed for ${url}`, error)
		return "failed"
	}
}

// build the conditional-GET headers from whichever of etag and last-modified are stored
export function conditionalHeaders(validators: FetchValidators): Record<string, string> {
	// If-None-Match sends the etag when it is stored
	const headers: Record<string, string> = {}
	if (validators.etag) {
		headers["If-None-Match"] = validators.etag
	}
	// If-Modified-Since sends the last-modified date when it is stored
	if (validators.lastModified) {
		headers["If-Modified-Since"] = validators.lastModified
	}
	return headers
}

// map a conditional-GET status to a reuse decision. only a 304 means the stored content is still current
export function revalidationOutcome(status: number): "not-modified" | "changed" {
	return status === 304 ? "not-modified" : "changed"
}
