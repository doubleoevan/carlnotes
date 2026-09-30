// rate limit tests: a request's limiter key, and the client address that a visitor resolves to behind Cloudflare
import { expect, test } from "bun:test"
import { getIp } from "better-auth/api"
import { auth } from "./auth"
import { toRateLimitKey } from "./rateLimit"
import { ipAddressOptions, resolveClientAddress } from "./trustedProxies"

// a few of Cloudflare's published ranges, read the way production reads TRUSTED_PROXIES
const CLOUDFLARE_IP_ADDRESS_OPTIONS = {
	...ipAddressOptions,
	trustedProxies: ["173.245.48.0/20", "172.64.0.0/13", "2606:4700::/32"],
}

// the client address that a request resolves to behind Cloudflare, for a given x-forwarded-for header
function toCloudflareClientAddress(forwardedFor: string): string | null {
	const request = new Request("http://localhost/mcp", { headers: { "x-forwarded-for": forwardedFor } })
	return resolveClientAddress(request, CLOUDFLARE_IP_ADDRESS_OPTIONS)
}

// a user is one tool caller, no matter what address the request also has
test("a user is keyed by their id ahead of any address", () => {
	expect(toRateLimitKey({ userId: "user-1", clientAddress: "203.0.113.7" })).toBe("user:user-1")
})

// a visitor is keyed by their address and uses the shared bucket only if no address can be trusted
test("a visitor is keyed by their address, else by the shared bucket", () => {
	expect(toRateLimitKey({ userId: null, clientAddress: "203.0.113.7" })).toBe("address:203.0.113.7")
	expect(toRateLimitKey({ userId: null, clientAddress: null })).toBe("shared")
})

// the header ends with the Cloudflare edge's address, which is trusted, so the visitor before it is the client
test("the visitor behind a Cloudflare hop is the client", () => {
	expect(toCloudflareClientAddress("203.0.113.7, 172.70.1.1")).toBe("203.0.113.7")
})

// the walk from the right stops at the visitor, so an entry that the visitor wrote to its left is never read
test("a forged left entry is ignored", () => {
	expect(toCloudflareClientAddress("198.51.100.9, 203.0.113.7, 172.70.1.1")).toBe("203.0.113.7")
})

// the header of a request sent straight to the origin ends with its untrusted sender, no matter what came before
test("a request that skips the edge resolves to its sender", () => {
	expect(toCloudflareClientAddress("172.70.1.1, 203.0.113.7")).toBe("203.0.113.7")
})

// Better Auth is configured with the limiter's own options object, so both always name the same client
test("Better Auth and the limiter resolve the same client address", () => {
	const request = new Request("http://localhost/mcp", { headers: { "x-forwarded-for": "203.0.113.7" } })
	expect(auth.options.advanced?.ipAddress).toBe(ipAddressOptions)
	expect(resolveClientAddress(request)).toBe(getIp(request, auth.options))
})
