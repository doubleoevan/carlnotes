// team client tests: a team avatar upload that never reaches the server fails with the generic rejection, and a rejected
// one returns the reason the server names
import { afterEach, expect, test } from "bun:test"
import { sendTeamAvatar } from "./teamClient"

// the real fetch to put back after each test
const originalFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = originalFetch
})

test("a team avatar upload fails on a network error and returns the server's reason on a rejection", async () => {
	// the request never reaches the server
	globalThis.fetch = (async () => {
		throw new TypeError("network down")
	}) as unknown as typeof fetch
	expect(await sendTeamAvatar("team-1", new File(["image"], "avatar.png"))).toBe("failed")

	// the server rejects the image and names why
	globalThis.fetch = (async () => Response.json({ error: "too-large" }, { status: 400 })) as unknown as typeof fetch
	expect(await sendTeamAvatar("team-1", new File(["image"], "avatar.png"))).toBe("too-large")
})
