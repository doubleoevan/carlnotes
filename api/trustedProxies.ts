// the proxies whose x-forwarded-for header entries are trusted, how a client address is read through them, and the
// warning logged once if TRUSTED_PROXIES is unset or misses a hop
import { getIp } from "better-auth/api"
import { isInternalAddress } from "../worker"

// the proxies from TRUSTED_PROXIES, as comma-separated IPs or CIDR ranges. in production these are Cloudflare's ranges
export const trustedProxies = (Bun.env.TRUSTED_PROXIES ?? "")
	.split(",")
	.map((trustedProxy) => trustedProxy.trim())
	.filter(Boolean)

// how a client address is read, as the rightmost x-forwarded-for entry outside every trusted range
export const ipAddressOptions = { trustedProxies, ipAddressHeaders: ["x-forwarded-for"] }

/**
 * Resolves a request's client address exactly as Better Auth does, returning null if no entry can be trusted.
 */
export function resolveClientAddress(request: Request, ipAddress = ipAddressOptions): string | null {
	return getIp(request, { advanced: { ipAddress } })
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
	// the header's comma-separated hops, cleaned of padding and empties
	const hops = (forwardedFor ?? "")
		.split(",")
		.map((hop) => hop.trim())
		.filter(Boolean)

	// if TRUSTED_PROXIES is set, warn unless the header resolved to a public client.
	// no address or an internal one means the platform added a hop that TRUSTED_PROXIES lacks.
	// the warning names the proxy hops alone, never the visitor's own address at the head of the header
	if (trustedProxyCount > 0) {
		return clientAddress && !isInternalAddress(clientAddress)
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
