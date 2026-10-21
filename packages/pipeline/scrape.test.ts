// scrape tests for the conditional-refetch helpers, the episode skip, and the page favicon
import { expect, test } from "bun:test"
import { conditionalHeaders, fetchContent, revalidationOutcome, toPageFaviconUrl } from "./scrape"

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
