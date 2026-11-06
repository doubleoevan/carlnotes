// RSS parseFeed tests. RSS and Atom both map to deduped "read" Resources, and a podcast entry includes its transcript
import { expect, test } from "bun:test"
import { parseFeed, toDurationSeconds, toFeedItemUrl, toTranscriptUrl } from "./feed"

// a minimal RSS 2.0 feed whose third entry repeats the first link, to exercise the shared feed dedupe
const RSS_FEED = `<?xml version="1.0"?><rss version="2.0"><channel>
<title>Example</title>
<item><title>First</title><link>https://example.com/a</link><description>First body</description></item>
<item><title>Second</title><link>https://example.com/b</link></item>
<item><title>Dup</title><link>https://example.com/a</link></item>
</channel></rss>`

// a minimal podcast feed whose first episode publishes a transcript in two formats and whose second publishes none
const PODCAST_FEED = `<?xml version="1.0"?><rss version="2.0" xmlns:podcast="https://podcastindex.org/namespace/1.0"><channel>
<title>Example Show</title>
<item><title>Episode A</title><link>https://example.com/a</link><description>Show notes</description>
<podcast:transcript url="https://example.com/a.html" type="text/html"/>
<podcast:transcript url="https://example.com/a.vtt" type="text/vtt"/></item>
<item><title>Episode B</title><link>https://example.com/b</link></item>
</channel></rss>`

// a show that puts its own link on every episode, which real podcast feeds commonly do
const SHOW_LINK_FEED = `<?xml version="1.0"?><rss version="2.0"><channel>
<title>Example Show</title><link>https://example.com/show</link>
<item><title>Episode A</title><link>https://example.com/show</link><guid>tag:example,1</guid>
<enclosure url="https://audio.example.com/1.mp3" type="audio/mpeg"/></item>
<item><title>Episode B</title><link>https://example.com/show</link><guid>tag:example,2</guid>
<enclosure url="https://audio.example.com/2.mp3" type="audio/mpeg"/></item>
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

// a show that repeats its own link on every episode identifies each one by its enclosure instead
test("parseFeed keeps episodes apart when a feed repeats the show link", async () => {
	const resources = await parseFeed(SHOW_LINK_FEED, "listen")
	expect(resources.map((resource) => resource.url)).toEqual([
		"https://audio.example.com/1.mp3",
		"https://audio.example.com/2.mp3",
	])
})

// the entry's own link wins, the show's repeated link falls through, and an entry with neither still resolves
test("toFeedItemUrl prefers a per-entry address over a repeated show link", () => {
	const showLink = "https://example.com/show"
	expect(toFeedItemUrl({ link: "https://example.com/ep1" }, showLink)).toBe("https://example.com/ep1")
	expect(toFeedItemUrl({ link: showLink, enclosure: { url: "https://audio.example.com/1.mp3" } }, showLink)).toBe(
		"https://audio.example.com/1.mp3",
	)
	expect(toFeedItemUrl({ link: showLink, guid: "https://example.com/ep1" }, showLink)).toBe("https://example.com/ep1")

	// a show link with nothing else named is kept
	expect(toFeedItemUrl({ link: showLink, guid: "tag:example,1" }, showLink)).toBe(showLink)
	expect(toFeedItemUrl({ guid: "tag:example,1" }, showLink)).toBeUndefined()
})

// a podcast entry's transcript element is included on the Resource, and an entry without one leaves the field null
test("parseFeed captures a podcast entry's transcript url", async () => {
	const resources = await parseFeed(PODCAST_FEED, "listen")
	expect(resources[0]?.transcriptUrl).toBe("https://example.com/a.vtt")
	expect(resources[1]?.transcriptUrl).toBeNull()
})

// a plain text or WebVTT transcript is preferred, whose bytes are the words themselves
test("toTranscriptUrl prefers a readable transcript format", () => {
	const transcripts = [
		{ $: { url: "https://example.com/a.html", type: "text/html" } },
		{ $: { url: "https://example.com/a.vtt", type: "text/vtt" } },
	]
	expect(toTranscriptUrl(transcripts)).toBe("https://example.com/a.vtt")

	// with no readable format listed, the first one that names a url is taken as the feed listed it
	expect(toTranscriptUrl([transcripts[0] as (typeof transcripts)[number]])).toBe("https://example.com/a.html")
	expect(toTranscriptUrl([{ $: { type: "text/vtt" } }])).toBeNull()
	expect(toTranscriptUrl()).toBeNull()
})

// a podcast item's itunes:duration reaches its Resource, and an item without one stays unknown
test("parseFeed reads a podcast entry's duration", async () => {
	const durationFeed = `<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
		<channel><title>Show</title>
			<item><title>One</title><link>https://show.test/1</link><itunes:duration>1:02:03</itunes:duration></item>
			<item><title>Two</title><link>https://show.test/2</link></item>
		</channel></rss>`
	// the first item has a duration and the second item has none
	const resources = await parseFeed(durationFeed, "listen")
	expect(resources.map((resource) => resource.durationSeconds)).toEqual([3723, null])
})

// the three written forms read as seconds, and anything else reads as unknown
test("toDurationSeconds reads seconds, mm:ss, and hh:mm:ss", () => {
	expect(toDurationSeconds("95")).toBe(95)
	expect(toDurationSeconds("12:30")).toBe(750)
	expect(toDurationSeconds("01:00:00")).toBe(3600)
	expect(toDurationSeconds("0")).toBeNull()
	expect(toDurationSeconds("about an hour")).toBeNull()
	expect(toDurationSeconds(undefined)).toBeNull()

	// a minutes field past 59 is how a feed writes a long podcast episode
	expect(toDurationSeconds("90:00")).toBe(5400)

	// an empty or extra part is malformed
	for (const malformedDuration of ["", ":30", "30:", "1::2", "1:2:3:4"]) {
		expect(toDurationSeconds(malformedDuration)).toBeNull()
	}

	// a duration past what the column holds reads as unknown
	expect(toDurationSeconds("2147483647")).toBe(2147483647)
	expect(toDurationSeconds("2147483648")).toBeNull()
})
