// source screening tests: which fetch failures a retry may pass, and which are the page's own rejection
import { expect, test } from "bun:test"
import { isRetryableFetchFailure, isTransientFetchError, TRANSIENT_FETCH_GRACE_MS } from "./screenSourceActivities"

// a rate limit, a server error, a timeout, and a dropped connection are retried
test("a rate limit, a server error, a timeout, and a dropped connection are transient", () => {
	expect(isTransientFetchError(new Error("firecrawl scrape https://a.test returned 429"))).toBe(true)
	expect(isTransientFetchError(new Error("firecrawl scrape https://a.test returned 503"))).toBe(true)
	expect(isTransientFetchError(Object.assign(new Error("The operation timed out"), { name: "TimeoutError" }))).toBe(
		true,
	)
	expect(isTransientFetchError(new Error("fetch failed"))).toBe(true)
	expect(isTransientFetchError(Object.assign(new Error("Unable to connect"), { code: "ConnectionRefused" }))).toBe(true)
})

// a client error, a missing key, and an empty page are not transient, and neither is a url that names a network
test("a client error, a missing key, and an empty page are not transient", () => {
	expect(isTransientFetchError(new Error("firecrawl scrape https://a.test returned 404"))).toBe(false)
	expect(isTransientFetchError(new Error("FIRECRAWL_API_KEY is not set"))).toBe(false)
	expect(isTransientFetchError(new Error("firecrawl scrape https://a.test returned no content"))).toBe(false)
	expect(isTransientFetchError(new Error("firecrawl scrape https://a.test/social-network/503 returned 404"))).toBe(
		false,
	)
})

// a transient failure leaves the Source pending for a day after its save, and past that it fails for the owner to see
test("a transient fetch failure is retried for a day after the save, and a client error never is", () => {
	const savedAt = new Date("2026-10-11T00:00:00Z")
	const rateLimitError = new Error("firecrawl scrape https://a.test returned 429")
	const hourAfterSave = new Date(savedAt.getTime() + 60 * 60 * 1000)
	const dayAfterSave = new Date(savedAt.getTime() + TRANSIENT_FETCH_GRACE_MS)
	expect(isRetryableFetchFailure(rateLimitError, savedAt, hourAfterSave)).toBe(true)
	expect(isRetryableFetchFailure(rateLimitError, savedAt, dayAfterSave)).toBe(false)
	expect(
		isRetryableFetchFailure(new Error("firecrawl scrape https://a.test returned 404"), savedAt, hourAfterSave),
	).toBe(false)
})
