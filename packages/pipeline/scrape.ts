// fill a Resource's content: a published transcript or a video's caption track read straight from the origin,
// or any other page as Markdown through Firecrawl. a conditional GET checks whether stored content changed
import type { resourceKinds } from "@carlnotes/contracts/enums"
import { isSameSiteUrl } from "@carlnotes/contracts/sources"
import { DAY_MS, toJitteredBackoffMs } from "@carlnotes/contracts/time"
import { FIRECRAWL_COST_PER_FETCH } from "@carlnotes/models/budget"
import { toPositiveInteger } from "@carlnotes/server/envSettings"
import { fetchPublicUrl } from "@carlnotes/server/publicFetch"
import { runWithRetries } from "@carlnotes/server/retry"
import { fetchRedditThread, toRedditPostId } from "./ingest/reddit"
import { CAPTION_HOSTS, fetchDeclaredTranscript } from "./transcripts"

// the Firecrawl endpoint that scrapes a page to Markdown
const FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v2/scrape"

// Firecrawl's own statuses for a bad key, a spent credit, its scrape timeout, and its rate limit. a server error is its
// fault too
const FIRECRAWL_UNAUTHORIZED_STATUS = 401
const FIRECRAWL_CREDIT_SPENT_STATUS = 402
const FIRECRAWL_TIMEOUT_STATUS = 408
const FIRECRAWL_RATE_LIMIT_STATUS = 429

// a timeout, a rate limit, or a server error is tried again: four attempts, with a wait that starts near two seconds and doubles,
// or the wait that the response names, up to 30 seconds
const SCRAPE_ATTEMPTS = 4
const SCRAPE_BACKOFF_MS = 2000
const MAX_SCRAPE_WAIT_MS = 30_000

/**
 * A scrape that failed on Firecrawl's side: a bad key, a spent credit, a timeout, a rate limit, or a server error. It
 * says nothing about the page, which a later fetch may read.
 */
export class FirecrawlFaultError extends Error {
	readonly status: number
	readonly retryAfterMs: number | null

	constructor(url: string, status: number, retryAfterMs: number | null = null) {
		super(`firecrawl scrape ${url} failed on firecrawl's side: ${status}`)
		this.name = "FirecrawlFaultError"
		this.status = status
		this.retryAfterMs = retryAfterMs
	}
}

/**
 * Firecrawl's report that it could not read a page: a failed status that is no fault on its side, or a page with no
 * content. Another fetch of the same page would fail the same way.
 */
export class UnreadablePageError extends Error {
	constructor(url: string, reason: string) {
		super(`firecrawl scrape ${url} ${reason}`)
		this.name = "UnreadablePageError"
	}
}

/**
 * Returns whether a failed scrape found Firecrawl's credit spent, which no later attempt fixes.
 */
export function isFirecrawlCreditSpent(error: unknown): boolean {
	return error instanceof FirecrawlFaultError && error.status === FIRECRAWL_CREDIT_SPENT_STATUS
}

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
 * Fetch one Resource's content by the path its kind and url select. A transcript or caption path that produces no text
 * throws an error. A listen Resource that declares no transcript returns empty text at no cost. A scrape that Firecrawl
 * rate limits waits and tries again, and starts no wait that would end after the wait deadline.
 */
export async function fetchContent(
	url: string,
	resourceKind: ResourceKind,
	transcriptUrl: string | null = null,
	waitDeadlineAt: number | null = null,
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
		return fetchFirecrawlMarkdown(url, waitDeadlineAt)
	}

	// a video's words are published as its caption track, so the url selects which host to ask for it
	for (const captionHost of CAPTION_HOSTS) {
		const videoId = captionHost.toVideoId(url)
		if (videoId) {
			return captionHost.fetchTranscript(videoId)
		}
	}
	return fetchFirecrawlMarkdown(url, waitDeadlineAt)
}

// what Firecrawl returns for a scraped page: its Markdown and its metadata
type FirecrawlScrape = { data?: { markdown?: string; metadata?: Record<string, unknown> } }

// scrape one url to Markdown via Firecrawl
async function fetchFirecrawlMarkdown(url: string, waitDeadlineAt: number | null): Promise<FetchResult> {
	// Firecrawl requires a key. throw an error when it isn't set so the review can fall back to the snippet
	const apiKey = Bun.env.FIRECRAWL_API_KEY
	if (!apiKey) {
		throw new Error("FIRECRAWL_API_KEY is not set")
	}

	// a timeout, a rate limit, or a server error waits and tries again. a failed scrape throws an error, which the review catches to
	// score the snippet instead
	const payload = await runWithRetries({
		attempts: SCRAPE_ATTEMPTS,
		runAttempt: () => requestFirecrawlScrape(url, apiKey),
		isRetryable: isRetryableFirecrawlFault,
		toDelayMs: (error, attempt) => toScrapeDelayMs({ error, attempt, waitDeadlineAt }),
	})

	// Firecrawl wraps the page under data.markdown. an empty or whitespace body means the scrape failed, so throw an error
	const markdown = payload.data?.markdown ?? ""
	if (!markdown.trim()) {
		throw new UnreadablePageError(url, "returned no content")
	}

	// read the etag, last-modified, the page's own title, and its favicon from Firecrawl's page metadata when present
	const metadata = payload.data?.metadata ?? {}
	const etag = typeof metadata.etag === "string" ? metadata.etag : null
	const lastModified = typeof metadata["last-modified"] === "string" ? metadata["last-modified"] : null
	const title = typeof metadata.title === "string" ? metadata.title.trim() || null : null
	const faviconUrl = toPageFaviconUrl(metadata, url)
	return { text: markdown, cost: FIRECRAWL_COST_PER_FETCH, etag, lastModified, title, faviconUrl }
}

// ask Firecrawl for the main-content Markdown of one page, bounded by the fetch timeout
async function requestFirecrawlScrape(url: string, apiKey: string): Promise<FirecrawlScrape> {
	const response = await fetch(FIRECRAWL_ENDPOINT, {
		method: "POST",
		headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
		body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
		signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
	})

	// Firecrawl's unauthorized, payment required, timeout, rate limit, and server error statuses are faults on its
	// side, and any other failed status is its report about the page
	if (isFirecrawlFaultStatus(response.status)) {
		throw new FirecrawlFaultError(url, response.status, toRetryAfterMs(response.headers.get("retry-after")))
	}
	if (!response.ok) {
		throw new UnreadablePageError(url, `returned ${response.status}`)
	}
	return (await response.json()) as FirecrawlScrape
}

// whether a status is a fault on Firecrawl's side
function isFirecrawlFaultStatus(status: number): boolean {
	const isKeyOrCreditFault = status === FIRECRAWL_UNAUTHORIZED_STATUS || status === FIRECRAWL_CREDIT_SPENT_STATUS
	return isKeyOrCreditFault || isRetryableFirecrawlStatus(status)
}

// whether another attempt can fix a failed scrape: a timeout, a rate limit, or a server error, and never a bad key or a
// spent credit
function isRetryableFirecrawlFault(error: unknown): boolean {
	return error instanceof FirecrawlFaultError && isRetryableFirecrawlStatus(error.status)
}

// whether a status is one of Firecrawl's that the next attempt may pass: its timeout, its rate limit, or a server error
function isRetryableFirecrawlStatus(status: number): boolean {
	return status === FIRECRAWL_TIMEOUT_STATUS || status === FIRECRAWL_RATE_LIMIT_STATUS || status >= 500
}

// the wait that a retry-after header names in seconds, or null if the header is missing or names no wait
function toRetryAfterMs(retryAfter: string | null): number | null {
	const retryAfterSeconds = Number(retryAfter)
	return retryAfter && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : null
}

// a failed scrape, the number of the attempt that failed, the moment after which no wait may end, and the clock and
// the random source
type ScrapeDelayOptions = {
	error: unknown
	attempt: number
	waitDeadlineAt: number | null
	now?: number
	random?: () => number
}

/**
 * Returns the wait before the scrape's next attempt: the wait that the response named, or a backoff that doubles from
 * two seconds, scaled by a random 50 to 100 percent so scrapes that one rate limit failed together spread apart.
 * Returns null if the wait would end after the wait deadline, which ends the scrape with its failure.
 */
export function toScrapeDelayMs({
	error,
	attempt,
	waitDeadlineAt,
	now = Date.now(),
	random = Math.random,
}: ScrapeDelayOptions): number | null {
	const backoffMs = toJitteredBackoffMs({ firstWaitMs: SCRAPE_BACKOFF_MS, doublingCount: attempt - 1, random })
	const retryAfterMs = error instanceof FirecrawlFaultError ? error.retryAfterMs : null
	const delayMs = Math.min(retryAfterMs ?? backoffMs, MAX_SCRAPE_WAIT_MS)
	return waitDeadlineAt !== null && now + delayMs > waitDeadlineAt ? null : delayMs
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
