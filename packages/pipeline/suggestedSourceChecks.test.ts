// suggested source check tests: the advertised feed link, the show name match, and the temporary failure
import { expect, test } from "bun:test"
import { FetchStatusError } from "@carlnotes/server/publicFetch"
import { isSameShowName, isTemporaryFailure, toAdvertisedFeedHref } from "./suggestedSourceChecks"

test("a page's link tags advertise its rss or atom feed in either attribute order", () => {
	// an rss link, with its entity-encoded query decoded
	const rssPage = '<head><link rel="alternate" type="application/rss+xml" href="/feed.xml?a=1&amp;b=2"></head>'
	expect(toAdvertisedFeedHref(rssPage)).toBe("/feed.xml?a=1&b=2")

	// an atom link whose href comes first, after a stylesheet link
	const atomPage =
		'<link rel="stylesheet" href="/site.css"><link href="https://example.com/atom.xml" type="application/atom+xml" rel="alternate">'
	expect(toAdvertisedFeedHref(atomPage)).toBe("https://example.com/atom.xml")

	// a page whose links advertise no feed
	expect(toAdvertisedFeedHref('<link rel="icon" href="/favicon.ico">')).toBeUndefined()
})

test("a podcast suggestion matches a show if either name holds the other", () => {
	// either name may hold the other, no matter the case or the punctuation
	expect(isSameShowName({ suggestedName: "Voxwomen", showName: "Voxwomen Cycling Show" })).toBe(true)
	expect(isSameShowName({ suggestedName: "the cycling podcast", showName: "The Cycling Podcast" })).toBe(true)

	// a show of another name does not match, and neither does an empty name
	expect(
		isSameShowName({ suggestedName: "Women's Cycling Podcast", showName: "Star Trek The Next Conversation" }),
	).toBe(false)
	expect(isSameShowName({ suggestedName: "!!!", showName: "Voxwomen" })).toBe(false)
})

// reddit returns 403 to a blocked IP range and 404 to a subreddit that is not there
test("a reddit suggestion survives a blocked host but not a missing subreddit", () => {
	expect(isTemporaryFailure(new FetchStatusError("https://www.reddit.com/r/mcp/.rss", 403), "reddit")).toBe(true)
	expect(isTemporaryFailure(new FetchStatusError("https://www.reddit.com/r/nope/.rss", 404), "reddit")).toBe(false)
})

// every other source kind reads 403 as the host to show that the source is not readable
test("a 403 drops a suggestion for any other source kind", () => {
	expect(isTemporaryFailure(new FetchStatusError("https://a.test/feed", 403), "rss")).toBe(false)
	expect(isTemporaryFailure(new FetchStatusError("https://a.test/page", 403), "url")).toBe(false)
})

// a throttled or broken host is never returned as "no such source", whatever the source kind
test("a rate limit or a server error keeps a suggestion of any kind", () => {
	expect(isTemporaryFailure(new FetchStatusError("https://a.test/feed", 429), "rss")).toBe(true)
	expect(isTemporaryFailure(new FetchStatusError("https://a.test/feed", 503), "rss")).toBe(true)
})
