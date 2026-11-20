// scrape tests for the conditional-refetch helpers, the episode skip, the page scrape, its retries after a fault on
// Firecrawl's side, and the page favicon
import { expect, spyOn, test } from "bun:test"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import {
	conditionalHeaders,
	FirecrawlFaultError,
	fetchContent,
	isFirecrawlCreditSpent,
	revalidationOutcome,
	toPageFaviconUrl,
	toScrapeDelayMs,
	UnreadablePageError,
} from "./scrape"

// conditionalHeaders sends only the validators that are stored, omitting an absent one
test("conditionalHeaders builds from whichever validators are stored", () => {
	// test only the etag, only the last-modified date, both, and neither headers are built
	expect(conditionalHeaders({ etag: '"abc"', lastModified: null })).toEqual({ "If-None-Match": '"abc"' })
	expect(conditionalHeaders({ etag: null, lastModified: "Wed, 21 Oct 2026 07:28:00 GMT" })).toEqual({
		"If-Modified-Since": "Wed, 21 Oct 2026 07:28:00 GMT",
	})
	expect(conditionalHeaders({ etag: '"abc"', lastModified: "Wed, 21 Oct 2026 07:28:00 GMT" })).toEqual({
		"If-None-Match": '"abc"',
		"If-Modified-Since": "Wed, 21 Oct 2026 07:28:00 GMT",
	})
	expect(conditionalHeaders({ etag: null, lastModified: null })).toEqual({})
})

// only a 304 means the stored content still stands. any other status is a change to refetch
test("revalidationOutcome maps 304 to not-modified and anything else to changed", () => {
	expect(revalidationOutcome(304)).toBe("not-modified")
	expect(revalidationOutcome(200)).toBe("changed")
	expect(revalidationOutcome(500)).toBe("changed")
})

// an episode that declared no transcript is scored on its show notes, so the router spends no scrape credit on it
test("fetchContent skips the fetch for an episode with no transcript", async () => {
	const fetchResult = await fetchContent("https://example.com/episode", "listen")
	expect(fetchResult).toEqual({ text: "", cost: 0, etag: null, lastModified: null, title: null, faviconUrl: null })
})

// a page is scraped through Firecrawl's v2 endpoint, which returns the Markdown and the page's metadata
test("fetchContent scrapes a page through the v2 endpoint and reads its markdown and metadata", async () => {
	// stub the key and the scrape response
	const storedApiKey = Bun.env.FIRECRAWL_API_KEY
	Bun.env.FIRECRAWL_API_KEY = "test-key"
	const metadata = { title: " A page ", favicon: "/icon.ico", url: "https://example.com/page", etag: '"abc"' }
	const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
		Response.json({ success: true, data: { markdown: "# A page", metadata } }),
	)
	try {
		const fetchResult = await fetchContent("https://example.com/page", "read")

		// the request goes to v2 with the main-content Markdown body
		const [requestUrl, requestInit] = fetchSpy.mock.calls[0] ?? []
		expect(requestUrl).toBe("https://api.firecrawl.dev/v2/scrape")
		expect(JSON.parse(String(requestInit?.body))).toEqual({
			url: "https://example.com/page",
			formats: ["markdown"],
			onlyMainContent: true,
		})

		// the result holds the Markdown, the fetch's cost, and what the metadata named
		expect(fetchResult).toEqual({
			text: "# A page",
			cost: 0.001,
			etag: '"abc"',
			lastModified: null,
			title: "A page",
			faviconUrl: "https://example.com/icon.ico",
		})
	} finally {
		// restore the request and the key for the tests that follow
		fetchSpy.mockRestore()
		if (storedApiKey === undefined) {
			delete Bun.env.FIRECRAWL_API_KEY
		} else {
			Bun.env.FIRECRAWL_API_KEY = storedApiKey
		}
	}
})

// a url that wraps a redirect lands on the publisher, whose icon is not the requested host's
test("toPageFaviconUrl keeps an icon only for a page that stayed on the requested host", () => {
	const wrappedMetadata = {
		url: "https://www.cbssports.com/ufc/news/ufc-330",
		favicon: "https://www.cbssports.com/favicon-32x32.png",
	}
	expect(toPageFaviconUrl(wrappedMetadata, "https://news.google.com/rss/articles/CBMinAF")).toBeNull()

	// a large site serves its icon from a cdn, which is still its own icon
	const cdnMetadata = {
		url: "https://news.google.com/home?hl=en-US",
		favicon: "https://www.gstatic.com/gnews/logo/google_news_192.png",
	}
	expect(toPageFaviconUrl(cdnMetadata, "https://news.google.com/")).toBe(
		"https://www.gstatic.com/gnews/logo/google_news_192.png",
	)

	// a host and its variant are one site, and a relative icon resolves against where the page landed
	expect(
		toPageFaviconUrl({ url: "https://www.news.example/story", favicon: "/icon.png" }, "https://news.example/story"),
	).toBe("https://www.news.example/icon.png")

	// no landing url reported means the fetch stayed put, and a page naming no icon has none
	expect(toPageFaviconUrl({ favicon: "/icon.png" }, "https://news.example/story")).toBe("https://news.example/icon.png")
	expect(toPageFaviconUrl({ url: "https://news.example/story" }, "https://news.example/story")).toBeNull()
})

// scrape a page against the given Firecrawl replies, with instant waits, and return the scrape's result or its error
// with how many requests and waits it made
async function scrapeWithReplies(
	replies: Response[],
	waitDeadlineAt: number | null = null,
): Promise<{ scrapeResult: unknown; requestCount: number; waitCount: number }> {
	// the key, the replies in order with the last one repeated, and waits that end at once
	const restoreEnvSettings = saveEnvSettings(["FIRECRAWL_API_KEY"])
	Bun.env.FIRECRAWL_API_KEY = "test-key"
	const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
		(async () => (replies.length > 1 ? replies.shift() : replies[0]?.clone()) as Response) as unknown as typeof fetch,
	)
	const sleepSpy = spyOn(Bun, "sleep").mockResolvedValue(undefined)
	try {
		const scrapeResult = await fetchContent("https://example.com/page", "read", null, waitDeadlineAt).catch(
			(error: unknown) => error,
		)
		return { scrapeResult, requestCount: fetchSpy.mock.calls.length, waitCount: sleepSpy.mock.calls.length }
	} finally {
		// restore the request, the waits, and the key for the tests that follow
		fetchSpy.mockRestore()
		sleepSpy.mockRestore()
		restoreEnvSettings()
	}
}

// a scraped page as Firecrawl returns it
function toScrapedPage(): Response {
	return Response.json({ success: true, data: { markdown: "# A page", metadata: {} } })
}

test("a rate-limited scrape and a server error are tried again until the page is read", async () => {
	const replies = [new Response("", { status: 429 }), new Response("", { status: 503 }), toScrapedPage()]
	const { scrapeResult, requestCount, waitCount } = await scrapeWithReplies(replies)
	expect(scrapeResult).toMatchObject({ text: "# A page", cost: 0.001 })
	expect({ requestCount, waitCount }).toEqual({ requestCount: 3, waitCount: 2 })
})

test("a rate limit that outlasts four attempts fails as a fault on Firecrawl's side", async () => {
	const { scrapeResult, requestCount, waitCount } = await scrapeWithReplies([new Response("", { status: 429 })])
	expect(scrapeResult).toBeInstanceOf(FirecrawlFaultError)
	expect((scrapeResult as FirecrawlFaultError).status).toBe(429)
	expect({ requestCount, waitCount }).toEqual({ requestCount: 4, waitCount: 3 })
})

test("a spent credit, a bad key, and a page that Firecrawl could not read are not tried again", async () => {
	// a spent credit is a fault on Firecrawl's side that no attempt fixes
	const spentCredit = await scrapeWithReplies([new Response("", { status: 402 })])
	expect(isFirecrawlCreditSpent(spentCredit.scrapeResult)).toBe(true)
	expect(spentCredit).toMatchObject({ requestCount: 1, waitCount: 0 })

	// a bad key is a fault too, and not a spent credit
	const badKey = await scrapeWithReplies([new Response("", { status: 401 })])
	expect(badKey.scrapeResult).toBeInstanceOf(FirecrawlFaultError)
	expect(isFirecrawlCreditSpent(badKey.scrapeResult)).toBe(false)
	expect(badKey).toMatchObject({ requestCount: 1, waitCount: 0 })

	// any other failed status is Firecrawl's report about the page
	const unreadPage = await scrapeWithReplies([new Response("", { status: 404 })])
	expect(unreadPage.scrapeResult).toBeInstanceOf(UnreadablePageError)
	expect(unreadPage).toMatchObject({ requestCount: 1, waitCount: 0 })

	// Firecrawl's own scrape timeout is a fault that the next attempt may pass
	const timedOut = await scrapeWithReplies([new Response("", { status: 408 }), new Response("", { status: 408 })])
	expect(timedOut.scrapeResult).toBeInstanceOf(FirecrawlFaultError)
	expect(timedOut.requestCount).toBeGreaterThan(1)
})

test("a scrape starts no wait that would end after the wait deadline", async () => {
	// the deadline has passed, so the first rate limit ends the scrape
	const { scrapeResult, requestCount, waitCount } = await scrapeWithReplies(
		[new Response("", { status: 429 })],
		Date.now() - 1,
	)
	expect(scrapeResult).toBeInstanceOf(FirecrawlFaultError)
	expect({ requestCount, waitCount }).toEqual({ requestCount: 1, waitCount: 0 })
})

test("the wait before a scrape's next attempt doubles, follows the response, and stops at the deadline", () => {
	// the backoff doubles from two seconds, scaled by the random share
	const rateLimit = new FirecrawlFaultError("https://example.com/page", 429)
	const toDelayMs = (attempt: number, random: number): number | null =>
		toScrapeDelayMs({ error: rateLimit, attempt, waitDeadlineAt: null, random: () => random })
	expect([toDelayMs(1, 1), toDelayMs(2, 1), toDelayMs(3, 1)]).toEqual([2000, 4000, 8000])
	expect(toDelayMs(1, 0)).toBe(1000)

	// a wait that the response named replaces the backoff, up to 30 seconds
	const namedWait = new FirecrawlFaultError("https://example.com/page", 429, 7000)
	expect(toScrapeDelayMs({ error: namedWait, attempt: 1, waitDeadlineAt: null })).toBe(7000)
	const longWait = new FirecrawlFaultError("https://example.com/page", 429, 120_000)
	expect(toScrapeDelayMs({ error: longWait, attempt: 1, waitDeadlineAt: null })).toBe(30_000)

	// a wait that ends at the deadline is taken, and one that ends after it is not
	const deadlineOptions = { error: namedWait, attempt: 1, now: 1000 }
	expect(toScrapeDelayMs({ ...deadlineOptions, waitDeadlineAt: 8000 })).toBe(7000)
	expect(toScrapeDelayMs({ ...deadlineOptions, waitDeadlineAt: 7999 })).toBeNull()
})
