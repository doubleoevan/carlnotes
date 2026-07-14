// parseFeed self-checks: RSS and Atom both map to deduped read Resources, verified without a network
import { expect, test } from "bun:test"
import { parseFeed } from "./rss"

// a minimal RSS 2.0 feed whose third item repeats the first link, to exercise within-feed dedupe
const RSS_FEED = `<?xml version="1.0"?><rss version="2.0"><channel>
<title>Example</title>
<item><title>First</title><link>https://example.com/a</link></item>
<item><title>Second</title><link>https://example.com/b</link></item>
<item><title>Dup</title><link>https://example.com/a</link></item>
</channel></rss>`

// a minimal Atom feed, to prove the same adapter parses Atom <link href> entries
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
})

// Atom <link href> resolves to the canonical url just like an RSS <link>
test("parseFeed parses Atom entries", async () => {
	const resources = await parseFeed(ATOM_FEED)
	expect(resources.map((resource) => resource.url)).toEqual(["https://example.com/x"])
})
