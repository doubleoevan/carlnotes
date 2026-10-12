// source screening tests: which fetch failures a retry may pass, and which are the page's own rejection
import { expect, test } from "bun:test"
import { FetchStatusError } from "../publicFetch"
import { RETRYABLE_FETCH_GRACE_MS, shouldRetrySourceFetch } from "./screenSourceActivities"

// a Source saved an hour before the check, well inside the grace period
const savedAt = new Date("2026-10-11T00:00:00Z")
const hourAfterSave = new Date(savedAt.getTime() + 60 * 60 * 1000)

// a rate limit, a server error, a timeout, and a dropped connection are retried
test("a rate limit, a server error, a timeout, and a dropped connection are retried", () => {
	const retryableErrors = [
		new FetchStatusError("firecrawl scrape https://a.test", 429),
		new FetchStatusError("firecrawl scrape https://a.test", 503),
		Object.assign(new Error("The operation timed out"), { name: "TimeoutError" }),
		new Error("fetch failed"),
		Object.assign(new Error("Unable to connect"), { code: "ConnectionRefused" }),
	]
	for (const retryableError of retryableErrors) {
		expect(shouldRetrySourceFetch({ error: retryableError, savedAt, now: hourAfterSave })).toBe(true)
	}
})

// a client error, a missing key, and an empty page are never retried, and neither is a url that names a server error
test("a client error, a missing key, and an empty page are never retried", () => {
	const rejectionErrors = [
		new FetchStatusError("firecrawl scrape https://a.test", 404),
		new Error("FIRECRAWL_API_KEY is not set"),
		new Error("firecrawl scrape https://a.test returned no content"),
		new FetchStatusError("firecrawl scrape https://a.test/social-network/503", 404),
	]
	for (const rejectionError of rejectionErrors) {
		expect(shouldRetrySourceFetch({ error: rejectionError, savedAt, now: hourAfterSave })).toBe(false)
	}
})

// a retryable failure leaves the Source pending for a day after its save, and past that it fails for the owner to see
test("a retryable fetch failure is retried for a day after the save", () => {
	const rateLimitError = new FetchStatusError("firecrawl scrape https://a.test", 429)
	const dayAfterSave = new Date(savedAt.getTime() + RETRYABLE_FETCH_GRACE_MS)
	expect(shouldRetrySourceFetch({ error: rateLimitError, savedAt, now: hourAfterSave })).toBe(true)
	expect(shouldRetrySourceFetch({ error: rateLimitError, savedAt, now: dayAfterSave })).toBe(false)
})
