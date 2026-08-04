// scrape a page's full content to Markdown through Firecrawl, plus a credit-free conditional GET that checks whether
// stored content changed. both are raw fetches: the scrape is keyed by FIRECRAWL_API_KEY, the check goes straight to the url
const FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v1/scrape"
// scraping a live page is slower than a feed fetch, so allow a longer timeout
const FETCH_TIMEOUT_MS = 30_000

// how long the revalidation request may run before it aborts, so a slow origin never holds up a scan
const REVALIDATE_TIMEOUT_MS = Number(Bun.env.REVALIDATE_TIMEOUT_MS ?? "5000")

// hosts that resolve inside our own network. a Source or attachment url is owner-supplied, so fetching one of
// these would let a Topic reach the cloud metadata service or anything else not exposed to the internet
const PRIVATE_HOST_PATTERN =
	/^(?:localhost|0\.0\.0\.0|\[?::1\]?|10\.\d+\.\d+\.\d+|127\.\d+\.\d+\.\d+|169\.254\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|.+\.(?:local|internal))$/i

/**
 * The url as a fetchable target. Throws when it is malformed, not http(s), or points inside our own network.
 * Every rejection names the url and its reason, so a caller can surface the message as it is.
 */
export function toFetchableUrl(url: string): URL {
	let target: URL
	try {
		target = new URL(url)
	} catch {
		throw new Error(`malformed url: ${url}`)
	}

	if (target.protocol !== "http:" && target.protocol !== "https:") {
		throw new Error(`url must be http or https: ${url}`)
	}

	// a hostname that still resolves privately through DNS gets refused by the network, not here
	if (PRIVATE_HOST_PATTERN.test(target.hostname)) {
		throw new Error(`url is not publicly routable: ${url}`)
	}
	return target
}

// a scrape's Markdown plus the etag and last-modified for a later conditional GET. either may be absent
export type FetchResult = { markdown: string; etag: string | null; lastModified: string | null }

// the stored etag and last-modified a conditional GET is built from. either may be null
export type FetchValidators = { etag: string | null; lastModified: string | null }

// scrape one url to Markdown via Firecrawl. a missing key or failed scrape throws, and review falls back to the Resource's native snippet
export async function fetchContent(url: string): Promise<FetchResult> {
	// Firecrawl requires a key. throw when it isn't set so the review can fall back to the snippet
	const apiKey = Bun.env.FIRECRAWL_API_KEY
	if (!apiKey) {
		throw new Error("FIRECRAWL_API_KEY is not set")
	}

	// request only the main-content Markdown of the page, bounded by the fetch timeout
	const response = await fetch(FIRECRAWL_ENDPOINT, {
		method: "POST",
		headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
		body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	})

	// a failed scrape throws an error. review catches the error and scores the snippet instead
	if (!response.ok) {
		throw new Error(`firecrawl scrape ${url} returned ${response.status}`)
	}

	// Firecrawl wraps the page under data.markdown. an empty or whitespace body means the scrape failed, so throw
	const payload = (await response.json()) as { data?: { markdown?: string; metadata?: Record<string, unknown> } }
	const markdown = payload.data?.markdown ?? ""
	if (!markdown.trim()) {
		throw new Error(`firecrawl scrape ${url} returned no content`)
	}

	// read the etag and last-modified from Firecrawl's page metadata when present, so a later scan can revalidate instead of re-scrape
	const metadata = payload.data?.metadata ?? {}
	const etag = typeof metadata.etag === "string" ? metadata.etag : null
	const lastModified = typeof metadata["last-modified"] === "string" ? metadata["last-modified"] : null
	return { markdown, etag, lastModified }
}

// check with a conditional GET whether the stored content is still current, bounded by its own timeout.
// it never throws: a non-304, a network error, or a timeout all report back "failed" so the caller can fetch instead
export async function revalidateContent(
	url: string,
	validators: FetchValidators,
): Promise<"not-modified" | "changed" | "failed"> {
	// a direct conditional GET does not go through Firecrawl, so a 304 spends no scrape credit
	try {
		const response = await fetch(url, {
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
	// If-None-Match carries the etag when it is stored
	const headers: Record<string, string> = {}
	if (validators.etag) {
		headers["If-None-Match"] = validators.etag
	}
	// If-Modified-Since carries the last-modified date when it is stored
	if (validators.lastModified) {
		headers["If-Modified-Since"] = validators.lastModified
	}
	return headers
}

// map a conditional-GET status to a reuse decision. only a 304 means the stored content is still current
export function revalidationOutcome(status: number): "not-modified" | "changed" {
	return status === 304 ? "not-modified" : "changed"
}
