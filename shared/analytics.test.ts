// analytics tests for the fallback default without a key, the platform an event is attributed to, and the cta tag validation
import { expect, test } from "bun:test"
import { toPlatform, trackEvent } from "./analytics"
import { toCtaTag } from "./contracts"

// the funnel segments on this, so a phone must not be counted as a desktop
test("toPlatform reads a phone as mobile and everything else as desktop", () => {
	// the two mobile browsers that matter, one ios and one android
	expect(toPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148")).toBe(
		"mobile",
	)
	expect(
		toPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36"),
	).toBe("mobile")

	// a laptop browser, and a request with no user agent at all, both count as desktop
	expect(
		toPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"),
	).toBe("desktop")
	expect(toPlatform(null)).toBe("desktop")
	expect(toPlatform(undefined)).toBe("desktop")
})

// only a well-formed slug becomes an event property, so a tampered cookie never reaches analytics
test("toCtaTag admits slugs and rejects everything else", () => {
	// the tags the ui actually sets pass through
	expect(toCtaTag("subscribe")).toBe("subscribe")
	expect(toCtaTag("topic-quota")).toBe("topic-quota")

	// absence, junk, and anything a cookie editor could inject are dropped instead of being sent
	expect(toCtaTag(null)).toBe(null)
	expect(toCtaTag("")).toBe(null)
	expect(toCtaTag("has spaces")).toBe(null)
	expect(toCtaTag("<script>")).toBe(null)
	expect(toCtaTag("x".repeat(41))).toBe(null)
})

// without a key, nothing is sent
test("analytics is a no-op without its key", () => {
	// clear the key so the run is deterministic regardless of the calling shell's environment
	const originalApiKey = Bun.env.POSTHOG_API_KEY
	Bun.env.POSTHOG_API_KEY = undefined

	try {
		// a call without a key should not throw an error
		expect(() => trackEvent("signup_completed", "user-1")).not.toThrow()
	} finally {
		Bun.env.POSTHOG_API_KEY = originalApiKey
	}
})
