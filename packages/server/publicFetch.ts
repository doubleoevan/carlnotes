// fetch a user-supplied url safely: the address checks, the redirect-hop pinning, and the byte limit
import { isInternalAddress } from "@carlnotes/contracts/networkAddress"

export { isInternalAddress } from "@carlnotes/contracts/networkAddress"

import { lookup } from "node:dns/promises"
import { checkServerIdentity, type PeerCertificate } from "node:tls"

// a body read directly is dropped past this many bytes instead of buffered whole
const MAX_DIRECT_BYTES = 5_000_000

// a response whose body ran past the limit, cancelled part way through. the host answered, so this is not a fault here
export class OversizedBodyError extends Error {
	constructor(
		url: string,
		readonly limitBytes: number,
	) {
		super(`body of ${url} exceeds ${limitBytes} bytes`)
	}
}

// a fetch the host answered with an error status. the label names what was fetched, a url or the call that fetched it
export class FetchStatusError extends Error {
	constructor(
		label: string,
		readonly status: number,
	) {
		super(`${label} returned ${status}`)
	}
}

/**
 * Whether an http status is one the next attempt may pass: a rate limit or a server error.
 */
export function isRetryableHttpStatus(status: number): boolean {
	return status === 429 || status >= 500
}

/**
 * Whether a fetch failure is the host rejecting the request, which the url's owner can fix, instead of a fault.
 */
export function isHostRejection(error: unknown): boolean {
	if (error instanceof OversizedBodyError) {
		return true
	}

	// a 5xx is the host failing instead of rejecting the request, and can be a request this code sent wrong
	return error instanceof FetchStatusError && error.status < 500
}

/**
 * Whether a fetch failure is one the next attempt may pass: a timeout, an abort, a rate limit, or a server error.
 */
export function isRetryableFetchFailure(error: unknown): boolean {
	// a timeout or an abort never reached a status at all
	if (!(error instanceof FetchStatusError)) {
		return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
	}
	return isRetryableHttpStatus(error.status)
}

// hostnames that name an internal address
const INTERNAL_HOST_PATTERN =
	/^(?:localhost|0\.0\.0\.0|\[?::1\]?|10\.\d+\.\d+\.\d+|127\.\d+\.\d+\.\d+|169\.254\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|.+\.(?:local|internal))$/i

/**
 * Parses a url into a fetchable URL, throwing when it is malformed, not http(s), or internal.
 */
export function toFetchableUrl(url: string): URL {
	let parsedUrl: URL
	try {
		parsedUrl = new URL(url)
	} catch {
		throw new Error(`malformed url: ${url}`)
	}

	if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
		throw new Error(`url must be http or https: ${url}`)
	}

	// reject a hostname that is itself a literal internal address. a dns name that points inward is caught by resolvePublicAddress
	if (INTERNAL_HOST_PATTERN.test(parsedUrl.hostname)) {
		throw new Error(`url is an internal address: ${url}`)
	}
	return parsedUrl
}

// the checked address to connect to, or null when the host does not resolve.
// the resolver reads shorthand ip spellings the same way fetch does
async function resolvePublicAddress(hostname: string): Promise<string | null> {
	// a bracketed ipv6 literal keeps its brackets in the hostname, which the resolver does not take
	const host = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname

	// a host that does not resolve returns null. only a resolved internal address is rejected here
	const addresses = await lookup(host, { all: true }).catch(() => [])
	if (addresses.some(({ address }) => isInternalAddress(address))) {
		throw new Error(`url resolves to an internal address: ${hostname}`)
	}
	return addresses[0]?.address ?? null
}

// how many redirects a public fetch follows before it gives up
const MAX_REDIRECTS = 5

// the redirect statuses that come with a Location worth following
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

/**
 * Fetches a url, vetting every redirect hop's host and connecting to the exact address that was vetted,
 * so a host that re-resolves between the check and the connect never reaches an internal address.
 */
export async function fetchPublicUrl(url: string, init: RequestInit = {}): Promise<Response> {
	// follow redirects by hand, checking each hop's host resolves to a public address before fetching it
	let parsedUrl = toFetchableUrl(url)
	for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
		// an unchecked address is never fetched, so a broken or hostile dns server cannot slip an address past the check
		const publicAddress = await resolvePublicAddress(parsedUrl.hostname)
		if (!publicAddress) {
			throw new Error(`url host did not resolve: ${parsedUrl.hostname}`)
		}
		const response = await fetchByAddress(parsedUrl, publicAddress, init)

		// anything that is not a redirect is the answer, and so is a redirect that names nowhere to go
		const location = response.headers.get("location")
		if (!REDIRECT_STATUSES.has(response.status) || !location) {
			return response
		}

		// drop the redirect's own body, which holds its connection open until something reads it
		await response.body?.cancel()

		// resolve the next hop against the url that sent it, the way a browser would, and check it
		parsedUrl = toFetchableUrl(new URL(location, parsedUrl).toString())
	}
	throw new Error(`url redirected more than ${MAX_REDIRECTS} times: ${url}`)
}

// connect to the checked address itself. fetch would look the host up a second time, and a hostile
// dns server could answer that second lookup with an internal address
async function fetchByAddress(parsedUrl: URL, publicAddress: string, init: RequestInit): Promise<Response> {
	// the url names the address, the Host header names the site, tls sends the site's name as the server name, and the
	// certificate is checked against the site's name. Bun 1.4 sends the url's host as the server name unless told
	// otherwise, and a server behind Cloudflare or Fastly refuses a handshake that names an address
	const pinnedUrl = new URL(parsedUrl)
	pinnedUrl.hostname = publicAddress.includes(":") ? `[${publicAddress}]` : publicAddress
	const headers = new Headers(init.headers)
	headers.set("Host", parsedUrl.host)
	const pinnedInit = {
		...init,
		headers,
		redirect: "manual",
		tls:
			parsedUrl.protocol === "https:"
				? {
						serverName: parsedUrl.hostname,
						checkServerIdentity: (_host: string, certificate: PeerCertificate) =>
							checkServerIdentity(parsedUrl.hostname, certificate),
					}
				: undefined,
	}
	return fetch(pinnedUrl, pinnedInit as RequestInit)
}

/**
 * Reads a response body up to the byte limit, cancelling anything longer so an endless response is dropped instead of buffered whole.
 */
export async function readLimitedBody(response: Response, url: string): Promise<string> {
	return readBoundedBody({ response, label: url, maxBytes: MAX_DIRECT_BYTES })
}

/**
 * Reads a streamed response up to the caller's byte limit and cancels an oversized body immediately.
 */
async function readBoundedBody({
	response,
	label,
	maxBytes,
}: {
	response: Response
	label: string
	maxBytes: number
}): Promise<string> {
	const reader = response.body?.getReader()
	if (!reader) {
		return ""
	}

	// chunks are collected instead of being decoded as they arrive. a character can span two of them
	const chunks: Uint8Array[] = []
	let byteCount = 0
	while (true) {
		const { done, value } = await reader.read()
		if (done) {
			break
		}

		// cancelling closes the connection, so an endless response stops costing us bandwidth
		byteCount += value.length
		if (byteCount > maxBytes) {
			await reader.cancel()
			throw new OversizedBodyError(label, maxBytes)
		}
		chunks.push(value)
	}

	// join the chunks once, which is what the decoder reads
	const body = new Uint8Array(byteCount)
	let offset = 0
	for (const chunk of chunks) {
		body.set(chunk, offset)
		offset += chunk.length
	}
	return new TextDecoder().decode(body)
}
