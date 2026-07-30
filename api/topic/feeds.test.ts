// feed tests for the rate-eligibility rule that the batched feed uses in place of a per-topic subscription query
import { expect, test } from "bun:test"
import { canRateInFeed } from "./feeds"

// a topic carrying just the fields canRateInFeed needs
function topic(ownerId: string, visibility: "public" | "invite" | "private"): Parameters<typeof canRateInFeed>[0] {
	return { id: "t1", ownerId, visibility }
}

// the owner can always rate their own topic, whatever its visibility or the subscriber set is
test("canRateInFeed lets the owner rate their own topic", () => {
	expect(canRateInFeed(topic("u1", "private"), "u1", new Set())).toBe(true)
	expect(canRateInFeed(topic("u1", "public"), "u1", new Set())).toBe(true)
})

// a non-owner can rate a public or invite topic only when the batched set marks them a subscriber
test("canRateInFeed lets a subscriber rate a public or invite topic", () => {
	// a direct or audience subscription lands the topic id in the set
	expect(canRateInFeed(topic("owner", "public"), "u2", new Set(["t1"]))).toBe(true)
	expect(canRateInFeed(topic("owner", "invite"), "u2", new Set(["t1"]))).toBe(true)
	// not subscribed: the set does not contain the topic id
	expect(canRateInFeed(topic("owner", "public"), "u2", new Set())).toBe(false)
})

// a private topic is never allowed to be rated by a non-owner, and a signed-out visitor is never allowed to rate
test("canRateInFeed refuses a private topic and a signed-out visitor", () => {
	// even if the subscriber set somehow has a user, a private topic is not rateable for a non-owner
	expect(canRateInFeed(topic("owner", "private"), "u2", new Set(["t1"]))).toBe(false)
	// a signed-out visitor can be neither an owner nor subscriber
	expect(canRateInFeed(topic("owner", "public"), null, new Set())).toBe(false)
})
