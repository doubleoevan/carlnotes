// scrape a page's full content to Markdown through Firecrawl, plus a credit-free conditional GET that checks whether
// stored content changed. both are raw fetches: the scrape is keyed by FIRECRAWL_API_KEY, the check goes straight to the url
import { lookup as dnsLookup } from "node:dns/promises"

const FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v1/scrape"
// scraping a live page is slower than a feed fetch, so allow a longer timeout
const FETCH_TIMEOUT_MS = 30_000

// how long stored content stands in for a fetch. past it, content is revalidated or fetched again
// ingest and review both read this, so a page is fresh or stale to both of them
export const CONTENT_TTL_MS = toTtlMs(Bun.env.CONTENT_TTL_MS)

// the ttl that a setting names, or the one-day default when it names nothing usable,
// so stored content is reused until it's refetched after the ttl expires
function toTtlMs(setting: string | undefined): number {
	const ttlMs = Number(setting)
	return setting && Number.isFinite(ttlMs) && ttlMs >= 0 ? ttlMs : 24 * 60 * 60 * 1000
}

/**
 * Whether stored content has outlived the ttl window and needs revalidating or refetching before it is read again.
 */
export function isContentStale(fetchedAt: Date, now: Date, ttlMs: number): boolean {
	return now.getTime() - fetchedAt.getTime() >= ttlMs
}

// how long the revalidation request may run before it aborts, so a slow origin never holds up a scan
const REVALIDATE_TIMEOUT_MS = Number(Bun.env.REVALIDATE_TIMEOUT_MS ?? "5000")

// hosts that resolve to an internal address. a Source or attachment url is owner-supplied, so fetching one of
// these would let a Topic reach the cloud metadata service or anything else not exposed to the internet
const INTERNAL_HOST_PATTERN =
	/^(?:localhost|0\.0\.0\.0|\[?::1\]?|10\.\d+\.\d+\.\d+|127\.\d+\.\d+\.\d+|169\.254\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|.+\.(?:local|internal))$/i

/**
 * The url as a fetchable target. Throws an error when it is malformed, not http(s), or internal.
 * Every rejection names the url and its reason, so a caller is shown the message as it is.
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

	// this only catches a hostname that already looks internal by name or literal. fetchPublicUrl
	// resolves the host on every hop, so a name that merely resolves to a private address is still caught there
	if (INTERNAL_HOST_PATTERN.test(target.hostname)) {
		throw new Error(`url is an internal address: ${url}`)
	}
	return target
}

// the url parser and dns both write an IPv4-mapped address as two hex groups (::ffff:7f00:1),
// so the embedded address is decoded from hex, not read as the dotted form it started from
function embeddedIPv4(address: string): string | null {
	const hex = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i)
	const high = hex?.[1]
	const low = hex?.[2]
	if (!high || !low) {
		return null
	}

	// the two groups are the embedded address's high and low 16 bits
	const value = (Number.parseInt(high, 16) << 16) | Number.parseInt(low, 16)
	return [24, 16, 8, 0].map((shift) => (value >>> shift) & 0xff).join(".")
}

// address ranges that stay inside a private network: loopback, link-local, unique-local, and RFC1918.
// an IPv4-mapped IPv6 address carries an IPv4 address's rules, so it is unwrapped first
function isPrivateAddress(address: string, family: number): boolean {
	// an IPv4-mapped address judges by its embedded IPv4 address
	const mapped = family === 6 ? embeddedIPv4(address) : null
	if (mapped) {
		return isPrivateAddress(mapped, 4)
	}

	// loopback, this-network, link-local, and the two RFC1918 blocks
	if (family === 4) {
		const [a = -1, b = -1] = address.split(".").map(Number)
		const privateRanges = [
			a === 0,
			a === 10,
			a === 127,
			a === 169 && b === 254,
			a === 172 && b >= 16 && b <= 31,
			a === 192 && b === 168,
		]
		return privateRanges.some(Boolean)
	}

	// loopback, unspecified, link-local (fe80::/10), and unique-local (fc00::/7)
	const lower = address.toLowerCase()
	return lower === "::1" || lower === "::" || /^fe[89ab][0-9a-f]:/.test(lower) || /^f[cd][0-9a-f]{2}:/.test(lower)
}

/**
 * Resolves a hop's host and throws when any resolved address is private. Catches an IPv4 literal,
 * an IPv6 literal, and a DNS name that merely resolves inward, all with the one check.
 */
async function assertResolvesPublic(target: URL): Promise<void> {
	// a bracketed IPv6 literal carries its brackets in URL.hostname, strip them before resolving
	const host = target.hostname.replace(/^\[|\]$/g, "")

	// a host that fails to resolve at all is not reachable either, so it is rejected the same way
	let addresses: { address: string; family: number }[]
	try {
		addresses = await dnsLookup(host, { all: true })
	} catch {
		throw new Error(`url does not resolve: ${target}`)
	}

	// any resolved address landing inside a private network makes the whole host unreachable
	if (addresses.some((entry) => isPrivateAddress(entry.address, entry.family))) {
		throw new Error(`url is an internal address: ${target}`)
	}
}

// how many redirects a public fetch follows before it gives up
const MAX_REDIRECTS = 5

// the redirect statuses that carry a Location worth following
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

/**
 * Fetches an owner-supplied url, resolving and checking every redirect hop before it is fetched.
 * Throws an error when a hop is malformed, not http(s), internal, or the chain runs too long.
 */
export async function fetchPublicUrl(url: string, init: RequestInit = {}): Promise<Response> {
	// follow redirects by hand. letting fetch follow them would check the first url and then jump anywhere,
	// so a public page could bounce the worker to the cloud metadata service
	let target = toFetchableUrl(url)
	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		// resolve this hop's host before fetching it, so a name that only resolves to a private
		// address, or an IPv6 literal the pattern above missed, is caught the same way an IPv4 literal is
		await assertResolvesPublic(target)
		const response = await fetch(target, { ...init, redirect: "manual" })

		// anything that is not a redirect is the answer, and so is a redirect that names nowhere to go
		const location = response.headers.get("location")
		if (!REDIRECT_STATUSES.has(response.status) || !location) {
			return response
		}

		// resolve the next hop against the url that sent it, the way a browser would, and check it
		target = toFetchableUrl(new URL(location, target).toString())
	}
	throw new Error(`url redirected more than ${MAX_REDIRECTS} times: ${url}`)
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
