// source screening tests: which fetch failures a retry may pass, which are the page's own rejection, and whose spend
// the page's fetch is
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { sources } from "@carlnotes/db/schema/topics"
import * as spendReservations from "@carlnotes/models/spendReservations"
import * as scrape from "@carlnotes/pipeline/scrape"
import { FetchStatusError } from "@carlnotes/server/publicFetch"
import { RETRYABLE_FETCH_GRACE_MS, screenSource, shouldRetrySourceFetch } from "./screenSourceActivities"

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// answer the screen's reads: the url Source of a Topic, and that Topic's owner
function stubSourceReads(): SentQuery[] {
	const sourceRow = toTableRow(sources, {
		id: "source-1",
		topicId: "topic-1",
		kind: "url",
		config: { url: "https://a.test/page" },
		createdAt: new Date(),
	})
	return stubConnectionPool(({ text }) => {
		if (text.includes('from "sources"')) {
			return [sourceRow]
		}
		return text.includes('from "topics"') ? [["owner-1"]] : []
	})
}

// the page's fetch is a paid call with no row of its own, so it is gated and recorded like a chat turn's spend
test("a url Source's fetch is its Topic owner's spend, and a spent budget fails the Source with no fetch", async () => {
	// an owner with budget left: the page is fetched, its cost is recorded for the owner, and the Source is ready
	const fetchContentSpy = spyOn(scrape, "fetchContent").mockResolvedValue({
		...{ text: "a page", cost: 0.001, etag: null },
		...{ lastModified: null, title: null, faviconUrl: null },
	})
	const reserveSpy = spyOn(spendReservations, "reserveUserSpend").mockResolvedValue({ release: mock(async () => {}) })
	const sentQueries = stubSourceReads()
	await screenSource("source-1")
	const spendWrite = sentQueries.find((sentQuery) => sentQuery.text.startsWith('insert into "spends"'))
	expect(spendWrite?.values).toEqual(expect.arrayContaining(["sourceScreenFetch", 0.001, "owner-1", "topic-1"]))
	expect(sentQueries.at(-1)?.values).toContain("ready")

	// an owner whose budget is spent: no fetch, and the Source is failed with the reason
	fetchContentSpy.mockClear()
	reserveSpy.mockResolvedValue("rejected")
	const spentBudgetQueries = stubSourceReads()
	await screenSource("source-1")
	expect(fetchContentSpy).not.toHaveBeenCalled()

	// the last write fails the Source, and its reason says that the page was not checked
	const failedWrite = spentBudgetQueries.at(-1)
	expect(failedWrite?.values).toContain("failed")
	expect(failedWrite?.values.some((value) => String(value).endsWith("This page was not checked."))).toBe(true)
})

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
