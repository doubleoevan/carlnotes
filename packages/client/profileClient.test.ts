// profile client tests: a profile read answers null only for a user the api does not show, and throws on any other
// rejection so the profile screen shows its error state
import { afterEach, expect, test } from "bun:test"
import { stubFetch } from "./fetchTestFixtures"
import { fetchProfile } from "./profileClient"

// the real fetch to put back after each test
const originalFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = originalFetch
})

test("fetchProfile reads a 404 as no such user and throws on any other rejection", async () => {
	stubFetch(new Response(null, { status: 404 }))
	expect(await fetchProfile("user-1")).toBeNull()
	stubFetch(new Response(null, { status: 500 }))
	await expect(fetchProfile("user-1")).rejects.toThrow("profile load failed: 500")
})
