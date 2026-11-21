// the proxies whose x-forwarded-for header entries are trusted, how a client address is read through them, the header
// that gives Better Auth the same address, and the warning logged once if TRUSTED_PROXIES is unset or misses a hop

import { BlockList, isIP } from "node:net"
import { isInternalAddress } from "@carlnotes/server/publicFetch"
import { getIP } from "better-auth/api"

// the proxies from TRUSTED_PROXIES, as comma-separated IPs or CIDR ranges. in production these are Cloudflare's ranges
const trustedProxies = (Bun.env.TRUSTED_PROXIES ?? "")
	.split(",")
	.map((trustedProxy) => trustedProxy.trim())
	.filter(Boolean)

// how a client address is read, as the rightmost x-forwarded-for entry outside every trusted range
export const ipAddressOptions = { trustedProxies, ipAddressHeaders: ["x-forwarded-for"] }

// the header the api writes on a request it passes to Better Auth, holding the client address the limiters resolved
export const CLIENT_ADDRESS_HEADER = "x-carlnotes-client-address"

// how Better Auth reads a client address: the one header the api wrote, which holds a single address
export const authIpAddressOptions = { ipAddressHeaders: [CLIENT_ADDRESS_HEADER] }

// the header Cloudflare sets to the address that connected to its edge, which no sender can write through Cloudflare
const CLOUDFLARE_CLIENT_ADDRESS_HEADER = "cf-connecting-ip"

/**
 * Resolves a request's client address, returning null if no entry can be trusted. A request that a trusted Cloudflare
 * hop reported is the address in cf-connecting-ip, so a request a Cloudflare Worker relays is the Worker's address.
 * Any other request resolves exactly as Better Auth's getIP reads x-forwarded-for.
 */
export function resolveClientAddress(request: Request, ipAddress = ipAddressOptions): string | null {
	// the address Cloudflare connected from, if a trusted Cloudflare hop reported the client
	const cloudflareClientAddress = request.headers.get(CLOUDFLARE_CLIENT_ADDRESS_HEADER)?.trim() ?? ""
	if (isIP(cloudflareClientAddress) && isClientReportedByTrustedHop(request, ipAddress.trustedProxies)) {
		return getIP(new Headers({ [CLIENT_ADDRESS_HEADER]: cloudflareClientAddress }), {
			advanced: { ipAddress: authIpAddressOptions },
		})
	}
	return getIP(request, { advanced: { ipAddress } })
}

/**
 * Returns the request to pass to Better Auth, at the url given or the request's own, with the client address header
 * set to the address the limiters resolve. A sender's own copy of the header is never passed on.
 */
export function toAuthRequest(request: Request, url: URL | string = request.url): Request {
	// a copy of the request whose headers can be written
	const authRequest = new Request(url, request)
	authRequest.headers.delete(CLIENT_ADDRESS_HEADER)

	// set the resolved address, or none if no entry can be trusted
	const clientAddress = resolveClientAddress(request)
	if (clientAddress) {
		authRequest.headers.set(CLIENT_ADDRESS_HEADER, clientAddress)
	}
	return authRequest
}

/**
 * Returns whether a trusted public hop, which is Cloudflare's edge, reported the client: the x-forwarded-for entry
 * right of the client, or the leftmost entry if every entry is trusted, as a request a Cloudflare Worker relays has
 * it. A request sent straight to the origin ends in the sender's own address, and a private platform hop never counts
 * as Cloudflare.
 */
export function isClientReportedByTrustedHop(request: Request, trustedProxies: string[]): boolean {
	const trustedProxyList = toTrustedProxyList(trustedProxies)
	if (!trustedProxyList) {
		return false
	}

	// the client is the rightmost entry outside every trusted range, as Better Auth resolves it
	const hops = toForwardedForHops(request.headers.get("x-forwarded-for"))
	const clientIndex = hops.findLastIndex((hop) => !isTrustedHop(trustedProxyList, hop))
	const reportingHop = clientIndex >= 0 ? hops[clientIndex + 1] : hops[0]
	return reportingHop !== undefined && isExternalAddress(reportingHop)
}

// the trusted ranges as a list to match addresses against, or null if none is set
function toTrustedProxyList(trustedProxies: string[]): BlockList | null {
	const trustedProxyList = new BlockList()
	for (const trustedProxy of trustedProxies) {
		// an entry is an address or an address with a prefix length, and an entry that is neither is skipped
		const [address = "", prefixLength] = trustedProxy.split("/")
		const family = toAddressFamily(address)
		if (!family) {
			continue
		}
		// add a range with its prefix length, or a single address
		if (prefixLength) {
			trustedProxyList.addSubnet(address, Number(prefixLength), family)
		} else {
			trustedProxyList.addAddress(address, family)
		}
	}
	return trustedProxyList.rules.length > 0 ? trustedProxyList : null
}

// whether a hop is an address inside a trusted range. a hop that is no address is never trusted
function isTrustedHop(trustedProxyList: BlockList, hop: string): boolean {
	const family = toAddressFamily(hop)
	return family !== null && trustedProxyList.check(hop, family)
}

// the family of an address, or null for a string that is no address
function toAddressFamily(address: string): "ipv4" | "ipv6" | null {
	const version = isIP(address)
	return version === 4 ? "ipv4" : version === 6 ? "ipv6" : null
}

/**
 * Returns whether a resolved client address is a known address outside this network.
 */
export function isExternalAddress(clientAddress: string | null): boolean {
	return clientAddress ? !isInternalAddress(clientAddress) : false
}

/**
 * Returns an x-forwarded-for header's comma-separated hops in order, cleaned of padding and empties.
 */
export function toForwardedForHops(forwardedFor: string | null): string[] {
	return (forwardedFor ?? "")
		.split(",")
		.map((hop) => hop.trim())
		.filter(Boolean)
}

// whether this process has checked TRUSTED_PROXIES against a request. each process checks only one request
let hasCheckedTrustedProxies = false

/**
 * Logs a warning once per process if TRUSTED_PROXIES is unset or misses a hop behind Cloudflare.
 */
export function checkTrustedProxies(request: Request): void {
	// run the check once per process, on a request through Cloudflare if TRUSTED_PROXIES is set
	const isThroughCloudflare = request.headers.has("cf-ray")
	if (hasCheckedTrustedProxies || (trustedProxies.length > 0 && !isThroughCloudflare)) {
		return
	}
	hasCheckedTrustedProxies = true

	// log a warning if TRUSTED_PROXIES is unset or misses a hop in this request's x-forwarded-for header
	const trustedProxiesWarning = toTrustedProxiesWarning({
		forwardedFor: request.headers.get("x-forwarded-for"),
		clientAddress: resolveClientAddress(request),
		trustedProxyCount: trustedProxies.length,
	})
	if (trustedProxiesWarning) {
		console.warn(trustedProxiesWarning)
	}
}

// one request's x-forwarded-for header, the client address it resolved to, and how many proxies are in TRUSTED_PROXIES
type ToTrustedProxiesWarningOptions = {
	forwardedFor: string | null
	clientAddress: string | null
	trustedProxyCount: number
}

/**
 * Returns the warning to log for an x-forwarded-for header, or null if TRUSTED_PROXIES resolves it to a public client.
 */
export function toTrustedProxiesWarning({
	forwardedFor,
	clientAddress,
	trustedProxyCount,
}: ToTrustedProxiesWarningOptions): string | null {
	const hops = toForwardedForHops(forwardedFor)

	// if TRUSTED_PROXIES is set, warn unless the header resolved to a public client.
	// no address or an internal one means the platform added a hop that TRUSTED_PROXIES lacks.
	// the warning names the proxy hops alone, never the visitor's own address at the head of the header
	if (trustedProxyCount > 0) {
		return isExternalAddress(clientAddress)
			? null
			: `TRUSTED_PROXIES leaves x-forwarded-for's proxy hops "${hops.slice(1).join(", ")}" at ${clientAddress ?? "no address"}. ` +
					"Add the hop after Cloudflare's to TRUSTED_PROXIES"
	}

	// if TRUSTED_PROXIES is unset, a missing header means the platform is not forwarding, and there is no address to read
	if (hops.length === 0) {
		return "no x-forwarded-for on the first request, so no client address can be resolved at all"
	}
	// everything after the leading address is a proxy, and those are what TRUSTED_PROXIES names
	return (
		`TRUSTED_PROXIES is unset and x-forwarded-for arrived with ${hops.length} hop(s). ` +
		`Set it to the proxy hop(s) behind the user: ${hops.slice(1).join(", ") || "(none, the header has only the user)"}`
	)
}
