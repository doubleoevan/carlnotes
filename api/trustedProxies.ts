// the proxies whose x-forwarded-for header entries are trusted, and how a client address is read through them
import { getIp } from "better-auth/api"

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
