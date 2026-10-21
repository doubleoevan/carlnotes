// podcast feed response tests: a 304 for a current copy, by its etag or by its modified time
import { expect, test } from "bun:test"
import { Hono } from "hono"
import { type RenderedPodcastFeed, toPodcastFeedResponse } from "./podcastFeedTokens"

// a rendered feed last changed at a fixed second, behind one route
const renderedPodcastFeed: RenderedPodcastFeed = {
	xml: "<rss/>",
	etag: '"abc"',
	lastModifiedMs: Date.UTC(2026, 9, 1, 9),
}
const app = new Hono().get("/feed.xml", (context) =>
	toPodcastFeedResponse({ context, renderedPodcastFeed, routeHeaders: { "X-Route": "kept" } }),
)

// request the feed with the given conditional headers
function requestFeed(headers: Record<string, string> = {}): Promise<Response> {
	return Promise.resolve(app.request("/feed.xml", { headers }))
}

test("an unconditional request gets the feed with its validators", async () => {
	// the feed's xml with a 200
	const response = await requestFeed()
	expect(response.status).toBe(200)
	expect(await response.text()).toBe("<rss/>")

	// the validators that the next request sends back, the feed's type, and the header that the route passed
	expect(response.headers.get("ETag")).toBe('"abc"')
	expect(response.headers.get("Last-Modified")).toBe("Thu, 01 Oct 2026 09:00:00 GMT")
	expect(response.headers.get("Content-Type")).toBe("application/rss+xml; charset=utf-8")
	expect(response.headers.get("X-Route")).toBe("kept")
})

test("a matching etag is a 304, and a stale etag gets the feed", async () => {
	// the matching etag gets no body
	const currentResponse = await requestFeed({ "If-None-Match": '"abc"' })
	expect(currentResponse.status).toBe(304)
	expect(await currentResponse.text()).toBe("")
	expect((await requestFeed({ "If-None-Match": '"old"' })).status).toBe(200)
})

test("a modified time at or after the feed's last change is a 304, and an earlier time gets the feed", async () => {
	// the second of the feed's last change is current, and the second before it is not
	expect((await requestFeed({ "If-Modified-Since": "Thu, 01 Oct 2026 09:00:00 GMT" })).status).toBe(304)
	expect((await requestFeed({ "If-Modified-Since": "Thu, 01 Oct 2026 08:59:59 GMT" })).status).toBe(200)

	// an etag decides alone if the request sent an etag
	const staleEtagHeaders = { "If-None-Match": '"old"', "If-Modified-Since": "Fri, 02 Oct 2026 09:00:00 GMT" }
	expect((await requestFeed(staleEtagHeaders)).status).toBe(200)
})
