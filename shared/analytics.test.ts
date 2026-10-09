// analytics tests for the fallback default without a key, a bot capture's shape, and the cta tag validation
import { expect, test } from "bun:test"
import { toBotCapture, trackBotEvent, trackEvent } from "./analytics"
import { toCtaTag } from "./contracts"

// a bot's capture is keyed to the bot's name and never creates a person profile
test("toBotCapture keys the event to the bot and turns the person profile off", () => {
	expect(toBotCapture("crawler_fetched", "googlebot", { routeShape: "/topics/:id/:slug", status: 200 })).toEqual({
		distinctId: "googlebot",
		event: "crawler_fetched",
		properties: { routeShape: "/topics/:id/:slug", status: 200, $process_person_profile: false },
	})
	expect(toBotCapture("mcp_connected", "claude").properties).toEqual({ $process_person_profile: false })
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
		// a call without a key should not throw an error, for a user's event or a bot's
		expect(() => trackEvent("signup_completed", "user-1")).not.toThrow()
		expect(() => trackBotEvent("crawler_fetched", "googlebot")).not.toThrow()
	} finally {
		Bun.env.POSTHOG_API_KEY = originalApiKey
	}
})
