// trusted proxies tests: the warning logged if TRUSTED_PROXIES is unset or misses a proxy hop
import { expect, test } from "bun:test"
import { toTrustedProxiesWarning } from "./trustedProxies"

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
