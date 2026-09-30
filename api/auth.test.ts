// auth tests: a signup's default avatar, and the warning logged if TRUSTED_PROXIES is unset or misses a proxy hop
import { expect, test } from "bun:test"
import { toSignupAvatarSource, toTrustedProxiesWarning } from "./auth"

// an oauth signup defaults to the provider's photo, a password signup never has one
test("a signup with a provider photo defaults to it", () => {
	expect(toSignupAvatarSource("https://lh3.googleusercontent.com/a/photo.jpg")).toBe("oauth")
})

// no photo, empty string, or null all fall back to the generated initials
test("a signup with no provider photo falls back to generated initials", () => {
	expect(toSignupAvatarSource(null)).toBe("generated")
	expect(toSignupAvatarSource(undefined)).toBe("generated")
	expect(toSignupAvatarSource("")).toBe("generated")
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
	expect(unresolvedWarning).toContain("no address")
})
