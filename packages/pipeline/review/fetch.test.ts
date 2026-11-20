// fetch tests for the content ttl, the tweet whose snippet is whole, the fields a fetch writes, the page title, and
// the snippet that a failed fetch leaves to score
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { DAY_MS } from "@carlnotes/contracts/time"
import { newBudget } from "@carlnotes/models/budget"
import * as firecrawlCredit from "../firecrawlCredit"
import * as scrape from "../scrape"
import { FirecrawlFaultError, isContentStale, UnreadablePageError } from "../scrape"
import { fetchResourceContent, isSnippetComplete, toFetchedContentFields, toPageTitleField } from "./fetch"
import type { Resource } from "./filter"

// put every spy back after each test
afterEach(() => {
	mock.restore()
})

// isContentStale sends stored content back for revalidation once it reaches the ttl window
test("isContentStale gates on the ttl window", () => {
	const now = new Date("2026-07-24T12:00:00Z")
	// an hour old is still reusable under a one-day ttl, two days old is stale, and the exact ttl boundary is stale
	expect(isContentStale(new Date("2026-07-24T11:00:00Z"), now, DAY_MS)).toBe(false)
	expect(isContentStale(new Date("2026-07-22T12:00:00Z"), now, DAY_MS)).toBe(true)
	expect(isContentStale(new Date("2026-07-23T12:00:00Z"), now, DAY_MS)).toBe(true)
})

// a tweet arrives with its entire text, so scoring it must never pay for a fetch that x.com would reject anyway
test("isSnippetComplete skips the fetch for a tweet and for nothing else", () => {
	expect(isSnippetComplete("https://x.com/sama/status/123")).toBe(true)

	// every other host still fetches, including one that merely ends in the same letters
	expect(isSnippetComplete("https://example.com/post")).toBe(false)
	expect(isSnippetComplete("https://notx.com/sama/status/123")).toBe(false)
	expect(isSnippetComplete("https://www.reddit.com/r/x/comments/a/first/")).toBe(false)
})

// an empty scrape and a failed object-storage write both leave no key, so the snippet becomes the text to score
test("toFetchedContentFields keeps the key and scores content when stored, otherwise falls back to the snippet", () => {
	// a successful store keeps the key and size and scores the in-memory content
	expect(toFetchedContentFields({ contentKey: "resources/r1/content.md", bytes: 12 }, "body", "snip")).toEqual({
		scoringText: "body",
		contentKey: "resources/r1/content.md",
		contentBytes: 12,
	})
	// a failed or skipped store keeps no key and scores the snippet, or leaves the content empty if there is no snippet
	expect(toFetchedContentFields(null, "body", "snip")).toEqual({
		scoringText: "snip",
		contentKey: null,
		contentBytes: null,
	})
	expect(toFetchedContentFields(null, "body", null)).toEqual({ scoringText: "", contentKey: null, contentBytes: null })
})

// the page's own title replaces a title that came from the url, and leaves every other title alone
test("toPageTitleField writes the page title only over a title from the url", () => {
	const urlFallbackResource = { title: "agent evals", url: "https://example.com/blog/agent-evals" }
	expect(toPageTitleField(urlFallbackResource, "Agent Evals Are Hard")).toEqual({ title: "Agent Evals Are Hard" })

	// a title that already names the page is kept, since a page's own title is often its site's name
	const alreadyNamedResource = { title: "Why agent evals are hard", url: "https://example.com/blog/agent-evals" }
	expect(toPageTitleField(alreadyNamedResource, "Example Blog")).toEqual({})

	// a fetch that read no page names no title, so the stored one stands
	expect(toPageTitleField(urlFallbackResource, null)).toEqual({})
})

// a page with a snippet and no stored content, so its content is fetched
const PAGE = {
	id: "page-1",
	url: "https://example.com/page",
	kind: "read",
	snippet: "The snippet.",
	contentKey: null,
	transcriptUrl: null,
} as Resource

// fetch the page's content with a scrape that fails with the given error, and return what the fetch returned with the
// error reports and spent credit marks it made
async function fetchPageWithFailedScrape(scrapeError: Error): Promise<{
	resourceContent: Awaited<ReturnType<typeof fetchResourceContent>>
	reportCount: number
	markCount: number
	waitDeadlineAt: unknown
}> {
	// the scrape fails, and the reports and marks are counted
	const fetchContentSpy = spyOn(scrape, "fetchContent").mockRejectedValue(scrapeError)
	const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
	const markSpy = spyOn(firecrawlCredit, "markFirecrawlCreditSpent").mockResolvedValue(undefined)
	const budget = { ...newBudget(), modelCallWaitDeadlineAt: 123_456 }
	const resourceContent = await fetchResourceContent(PAGE, budget)
	return {
		resourceContent,
		reportCount: consoleErrorSpy.mock.calls.length,
		markCount: markSpy.mock.calls.length,
		waitDeadlineAt: fetchContentSpy.mock.calls[0]?.[3],
	}
}

test("a scrape that fails on Firecrawl's side scores the snippet and marks the fault", async () => {
	const rateLimit = new FirecrawlFaultError(PAGE.url, 429)
	const { resourceContent, reportCount, markCount, waitDeadlineAt } = await fetchPageWithFailedScrape(rateLimit)
	expect(resourceContent).toEqual({ content: "The snippet.", fetchOutcome: "fetched", isPageReadAgain: true })

	// the failure is reported for the page, and the scrape waited inside the review attempt's wait deadline
	expect({ reportCount, markCount }).toEqual({ reportCount: 1, markCount: 0 })
	expect(waitDeadlineAt).toBe(123_456)
})

test("a spent credit is marked for the sweep and reported for no page", async () => {
	const spentCredit = new FirecrawlFaultError(PAGE.url, 402)
	const { resourceContent, reportCount, markCount } = await fetchPageWithFailedScrape(spentCredit)
	expect(resourceContent).toEqual({ content: "The snippet.", fetchOutcome: "fetched", isPageReadAgain: true })
	expect({ reportCount, markCount }).toEqual({ reportCount: 0, markCount: 1 })
})

test("a page that Firecrawl could not read scores the snippet with no fault marked", async () => {
	const unreadPage = new UnreadablePageError(PAGE.url, "returned 403")
	const { resourceContent, reportCount } = await fetchPageWithFailedScrape(unreadPage)
	expect(resourceContent).toEqual({ content: "The snippet.", fetchOutcome: "fetched", isPageReadAgain: false })
	expect(reportCount).toBe(1)
})

test("a fetch that timed out on this side scores the snippet and reads the page again", async () => {
	const timeout = new DOMException("The operation timed out.", "TimeoutError")
	const { resourceContent } = await fetchPageWithFailedScrape(timeout)
	expect(resourceContent).toEqual({ content: "The snippet.", fetchOutcome: "fetched", isPageReadAgain: true })
})
