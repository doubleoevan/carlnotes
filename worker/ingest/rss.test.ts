// RSS parseFeed tests. RSS and Atom both map to deduped "read" Resources
import { expect, test } from "bun:test"
import { parseFeed } from "./feed"

// a minimal RSS 2.0 feed whose third entry repeats the first link, to exercise the shared feed dedupe
const RSS_FEED = `<?xml version="1.0"?><rss version="2.0"><channel>
<title>Example</title>
<item><title>First</title><link>https://example.com/a</link><description>First body</description></item>
<item><title>Second</title><link>https://example.com/b</link></item>
<item><title>Dup</title><link>https://example.com/a</link></item>
</channel></rss>`

// a minimal Atom feed, to prove the same parser handles Atom <link href> entries
const ATOM_FEED = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<title>Example</title>
<entry><title>Atom One</title><link href="https://example.com/x"/></entry>
</feed>`

// RSS entries become one Resource each, deduped by canonical url, all kind "read"
test("parseFeed maps RSS entries to deduped read Resources", async () => {
	const resources = await parseFeed(RSS_FEED)
	expect(resources.map((resource) => resource.url)).toEqual(["https://example.com/a", "https://example.com/b"])
	expect(resources.every((resource) => resource.kind === "read")).toBe(true)
	expect(resources[0]?.title).toBe("First")

	// the native snippet is the entry description. an entry without one leaves the snippet null
	expect(resources[0]?.snippet).toBe("First body")
	expect(resources[1]?.snippet).toBeNull()
})

// Atom <link href> resolves to the canonical url just like an RSS <link>
test("parseFeed parses Atom entries", async () => {
	const resources = await parseFeed(ATOM_FEED)
	expect(resources.map((resource) => resource.url)).toEqual(["https://example.com/x"])
})
