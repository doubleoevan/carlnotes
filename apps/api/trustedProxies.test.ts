// trusted proxies tests: an x-forwarded-for header's hops, the warning logged if TRUSTED_PROXIES is unset or misses
// a proxy hop, and the client address that a visitor resolves to behind Cloudflare
import { expect, test } from "bun:test"
import { getIP } from "better-auth/api"
import { auth } from "./auth"
import {
	CLOUDFLARE_TRUSTED_PROXIES,
	CLOUDFLARE_WORKER_ADDRESS,
	CLOUDFLARE_WORKER_CLIENT_ADDRESS,
	withCloudflareTrustedProxies,
} from "./rateLimitTestFixtures"
import {
	CLIENT_ADDRESS_HEADER,
	ipAddressOptions,
	isExternalAddress,
	resolveClientAddress,
	toAuthRequest,
	toForwardedForHops,
	toTrustedProxiesWarning,
} from "./trustedProxies"

// the address options with Cloudflare's ranges as the trusted proxies
const CLOUDFLARE_IP_ADDRESS_OPTIONS = { ...ipAddressOptions, trustedProxies: CLOUDFLARE_TRUSTED_PROXIES }

// a request with an x-forwarded-for header, and the cf-connecting-ip header Cloudflare sets if it has one
function toCloudflareRequest({
	forwardedFor,
	cloudflareClientAddress,
}: {
	forwardedFor: string
	cloudflareClientAddress?: string
}): Request {
	// the forwarded chain, and Cloudflare's own header if the request has one
	const headers = new Headers({ "x-forwarded-for": forwardedFor })
	if (cloudflareClientAddress) {
		headers.set("cf-connecting-ip", cloudflareClientAddress)
	}
	return new Request("http://localhost/api/search", { headers })
}

// the client address that a request resolves to behind Cloudflare, for a given x-forwarded-for header
function toCloudflareClientAddress(forwardedFor: string): string | null {
	const request = new Request("http://localhost/mcp", { headers: { "x-forwarded-for": forwardedFor } })
	return resolveClientAddress(request, CLOUDFLARE_IP_ADDRESS_OPTIONS)
}

// a header's hops keep their order without padding or empty entries, and a missing header has none
test("a header's hops are read in order, cleaned of padding and empties", () => {
	expect(toForwardedForHops(" 203.0.113.7 ,, 172.70.1.1 ,")).toEqual(["203.0.113.7", "172.70.1.1"])
	expect(toForwardedForHops(null)).toEqual([])
})

// if TRUSTED_PROXIES is unset, the warning suggests the proxy hops from the first request's x-forwarded-for header
test("an unset TRUSTED_PROXIES reports the hops behind the user", () => {
	const trustedProxiesWarning = toTrustedProxiesWarning({
		forwardedFor: "203.0.113.7, 172.70.1.1",
		clientAddress: null,
		trustedProxyCount: 0,
	})
	expect(trustedProxiesWarning).toContain("TRUSTED_PROXIES is unset")
	expect(trustedProxiesWarning).toContain("172.70.1.1")
})

// if TRUSTED_PROXIES lists every hop, a header through Cloudflare resolves to the visitor, and there is nothing to report
test("a header that resolves to a public client reports nothing", () => {
	const trustedProxiesWarning = toTrustedProxiesWarning({
		forwardedFor: "203.0.113.7, 172.70.1.1",
		clientAddress: "203.0.113.7",
		trustedProxyCount: 22,
	})
	expect(trustedProxiesWarning).toBeNull()
})

// if TRUSTED_PROXIES misses a hop, every caller would share that hop's address, or no address at all
test("a header that resolves to an internal address or none reports the missing hop", () => {
	const internalWarning = toTrustedProxiesWarning({
		forwardedFor: "203.0.113.7, 172.70.1.1, 10.0.0.5",
		clientAddress: "10.0.0.5",
		trustedProxyCount: 22,
	})
	const unresolvedWarning = toTrustedProxiesWarning({
		forwardedFor: "172.70.1.1",
		clientAddress: null,
		trustedProxyCount: 22,
	})
	expect(internalWarning).toContain("10.0.0.5")
	expect(internalWarning).not.toContain("203.0.113.7")
	expect(unresolvedWarning).toContain("no address")
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

// a request sent straight to the origin resolves to its sender, whatever cf-connecting-ip it forged
test("a direct request's forged cf-connecting-ip is ignored", () => {
	const request = toCloudflareRequest({
		forwardedFor: "172.70.1.1, 203.0.113.7",
		cloudflareClientAddress: "198.51.100.9",
	})
	expect(resolveClientAddress(request, CLOUDFLARE_IP_ADDRESS_OPTIONS)).toBe("203.0.113.7")
})

// a request through Cloudflare resolves to the address Cloudflare connected from, which is the visitor
test("a request through Cloudflare resolves to cf-connecting-ip", () => {
	const request = toCloudflareRequest({
		forwardedFor: "198.51.100.9, 203.0.113.7, 172.70.1.1",
		cloudflareClientAddress: "203.0.113.7",
	})
	expect(resolveClientAddress(request, CLOUDFLARE_IP_ADDRESS_OPTIONS)).toBe("203.0.113.7")
})

// a chain whose every entry is trusted, as a request a Cloudflare Worker relays has, resolves to the Workers address
// that cf-connecting-ip names, never to no address and never to an entry the Worker wrote
test("a request relayed through a Worker resolves to the Workers address", () => {
	const workerRequest = toCloudflareRequest({
		forwardedFor: "172.64.0.9, 2606:4700::1",
		cloudflareClientAddress: CLOUDFLARE_WORKER_ADDRESS,
	})
	expect(resolveClientAddress(workerRequest, CLOUDFLARE_IP_ADDRESS_OPTIONS)).toBe(CLOUDFLARE_WORKER_CLIENT_ADDRESS)

	// without cf-connecting-ip the same chain still resolves to no external address
	const unreportedRequest = toCloudflareRequest({ forwardedFor: "172.64.0.9, 2606:4700::1" })
	expect(isExternalAddress(resolveClientAddress(unreportedRequest, CLOUDFLARE_IP_ADDRESS_OPTIONS))).toBe(false)
})

// Better Auth reads the header the api writes on its request, so both name the same client, a Worker's included
test("Better Auth and the limiter resolve the same client address", async () => {
	await withCloudflareTrustedProxies(() => {
		// a direct request, a request through Cloudflare, and a request a Worker relays
		const requests = [
			toCloudflareRequest({ forwardedFor: "172.70.1.1, 203.0.113.7", cloudflareClientAddress: "198.51.100.9" }),
			toCloudflareRequest({ forwardedFor: "203.0.113.7, 172.70.1.1", cloudflareClientAddress: "203.0.113.7" }),
			toCloudflareRequest({
				forwardedFor: "172.64.0.9, 2606:4700::1",
				cloudflareClientAddress: CLOUDFLARE_WORKER_ADDRESS,
			}),
		]
		expect(requests.map((request) => getIP(toAuthRequest(request), auth.options))).toEqual([
			"203.0.113.7",
			"203.0.113.7",
			CLOUDFLARE_WORKER_CLIENT_ADDRESS,
		])
		expect(requests.map((request) => resolveClientAddress(request))).toEqual([
			"203.0.113.7",
			"203.0.113.7",
			CLOUDFLARE_WORKER_CLIENT_ADDRESS,
		])

		// a sender's own copy of the header never reaches Better Auth
		const forgedRequest = new Request("http://localhost/api/auth/sign-in/email", {
			headers: { "x-forwarded-for": "203.0.113.8", [CLIENT_ADDRESS_HEADER]: "198.51.100.1" },
		})
		expect(getIP(toAuthRequest(forgedRequest), auth.options)).toBe("203.0.113.8")
	})
})
