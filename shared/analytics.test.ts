// analytics tests for the fallback default without a key and the cta tag validation
import { expect, test } from "bun:test"
import { trackEvent } from "./analytics"
import { toCtaTag } from "./contracts"

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
