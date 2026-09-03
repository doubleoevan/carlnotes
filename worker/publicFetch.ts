// fetch a user-supplied url safely: the address checks, the redirect-hop pinning, and the byte limit
import { lookup } from "node:dns/promises"
import { checkServerIdentity, type PeerCertificate } from "node:tls"

// a body read directly is dropped past this many bytes instead of buffered whole
const MAX_DIRECT_BYTES = 5_000_000
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

// the ipv4 ranges a fetched host may never resolve to, as [firstOctet, minSecond, maxSecond]:
// loopback, this-network, private, link-local, cgnat
const INTERNAL_V4_RANGES: [number, number, number][] = [
	[0, 0, 255],
	[10, 0, 255],
	[127, 0, 255],
	[169, 254, 254],
	[172, 16, 31],
	[192, 168, 168],
	[100, 64, 127],
]

// whether an address is one a fetched host may never resolve to
export function isInternalAddress(address: string): boolean {
	// an ipv6-mapped ipv4 address is checked as the ipv4 it wraps
	const ipv4 = address.startsWith("::ffff:") ? address.slice("::ffff:".length) : address
	if (/^\d+\.\d+\.\d+\.\d+$/.test(ipv4)) {
		// 224 and up is multicast, reserved, and broadcast space, which is never a page to fetch
		const [first = 0, second = 0] = ipv4.split(".").map(Number)
		if (first >= 224) {
			return true
		}
		return INTERNAL_V4_RANGES.some(([octet, min, max]) => first === octet && second >= min && second <= max)
	}

	// ipv6 loopback, unspecified, unique-local (fc00::/7), link-local (fe80::/10), and multicast (ff00::/8)
	const ipv6 = address.toLowerCase()
	return ipv6 === "::1" || ipv6 === "::" || /^f[cd]/.test(ipv6) || /^fe[89ab]/.test(ipv6) || /^ff/.test(ipv6)
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
	// the url names the address, the Host header names the site, and tls still validates the real hostname
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
		if (byteCount > MAX_DIRECT_BYTES) {
			await reader.cancel()
			throw new Error(`body of ${url} exceeds ${MAX_DIRECT_BYTES} bytes`)
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
