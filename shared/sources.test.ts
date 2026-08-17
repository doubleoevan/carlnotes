// source registry tests: each source kind's summary, the Google News feed url and its publisher, and the picker's options
import { expect, test } from "bun:test"
import {
	CUSTOM_SOURCE_OPTIONS,
	toDefaultSource,
	toGoogleNewsFeedUrl,
	toGoogleNewsPublisher,
	toSourceSummary,
	toSourceValue,
	toUrlHost,
} from "./sources"

// the Google News option, which the source suggestions stage the same way the picker does
const googleNewsOption = CUSTOM_SOURCE_OPTIONS.find((option) => option.key === "googleNews")

// each source kind summarizes its own config field
test("toSourceSummary summarizes each source kind's config", () => {
	expect(toSourceSummary("rss", { url: "https://blog.langchain.dev/rss/" })).toBe("blog.langchain.dev")
	expect(toSourceSummary("reddit", { subreddit: "mcp" })).toBe("r/mcp")
	expect(toSourceSummary("youtube", { channelId: "UC123" })).toBe("UC123")
	expect(toSourceSummary("youtube", { playlistId: "PL456" })).toBe("PL456")
	expect(toSourceSummary("youtube", { channelId: "UC123", name: "Veritasium" })).toBe("Veritasium")
	expect(toSourceSummary("podcast", { podcastId: "1528594034", name: "Hard Fork" })).toBe("Hard Fork")
})

// a podcast source shows its id until its first scan writes the show's name back onto the config
test("toSourceSummary falls back to the podcast id before the show is named", () => {
	expect(toSourceSummary("podcast", { podcastId: "1528594034" })).toBe("1528594034")
	expect(toSourceSummary("podcast", { podcastId: "1528594034", name: "" })).toBe("1528594034")
})

// a bluesky account is named by its handle, shown with the @ whether it was typed with one or not
test("toSourceSummary strips a leading @ from a bluesky handle", () => {
	expect(toSourceSummary("bluesky", { handle: "alice.bsky.social" })).toBe("@alice.bsky.social")
	expect(toSourceSummary("bluesky", { handle: "@alice.bsky.social" })).toBe("@alice.bsky.social")
	expect(toSourceSummary("bluesky", {})).toBe("")
})

// the search ingester ignores its config and web search from the topic prompt, so the summary stays empty for the caller to fill
test("toSourceSummary is empty for the web search source even when a query is stored", () => {
	expect(toSourceSummary("search", { query: "production LLM agents" })).toBe("")
})

// an unparseable feed url falls back to the raw url instead of dropping the summary
test("toSourceSummary keeps a raw rss url that has no host", () => {
	expect(toSourceSummary("rss", { url: "not a url" })).toBe("not a url")
})

// a reddit source names whatever its config asked for, and a configless reddit source names nothing
test("toSourceSummary names a reddit source's subreddit, query, or both", () => {
	expect(toSourceSummary("reddit", { subreddit: "mcp", query: "agent memory" })).toBe("r/mcp · agent memory")
	expect(toSourceSummary("reddit", {})).toBe("")
})

// a missing config value or an unknown source kind summarize to an empty string
test("toSourceSummary is empty for missing values and unknown kinds", () => {
	expect(toSourceSummary("rss", {})).toBe("")
	expect(toSourceSummary("composio", { anything: true })).toBe("")
})

// toUrlHost extracts the url host or returns null for an unparseable url
test("toUrlHost returns the host or null", () => {
	expect(toUrlHost("https://www.example.com/x")).toBe("www.example.com")
	expect(toUrlHost("not a url")).toBeNull()
})

// a Google News feed covers one publisher, so it summarizes as that publisher instead of Google's own host
test("toSourceSummary names the publisher a google news feed covers", () => {
	const feedUrl = "https://news.google.com/rss/search?q=site%3Atechcrunch.com&hl=en-US&gl=US&ceid=US:en"
	expect(toSourceSummary("rss", { url: feedUrl })).toBe("techcrunch.com")
})

// a query becomes the feed's own query, encoded so spaces and reserved characters are embedded in the url
test("the feed url searches the query it is given", () => {
	expect(toGoogleNewsFeedUrl("AI agent tooling")).toBe(
		"https://news.google.com/rss/search?q=AI%20agent%20tooling&hl=en-US&gl=US&ceid=US:en",
	)
	expect(toGoogleNewsFeedUrl("R&D at 30,000 ft")).toContain("q=R%26D%20at%2030%2C000%20ft&")
})

// surrounding and repeated whitespace is collapsed, and a blank query has nothing to search for
test("the feed url trims its query, and a blank one builds nothing", () => {
	expect(toGoogleNewsFeedUrl("  espresso   machines\n")).toBe(toGoogleNewsFeedUrl("espresso machines"))
	expect(toGoogleNewsFeedUrl("")).toBeNull()
	expect(toGoogleNewsFeedUrl("   ")).toBeNull()
})

// the Google News option builds a publisher feed, taking the domain out of whatever form it was given in
test("the google news option builds a publisher feed from a domain", () => {
	const publisherFeed = { url: toGoogleNewsFeedUrl("site:techcrunch.com") }
	expect(googleNewsOption?.toConfig("techcrunch.com")).toEqual(publisherFeed)
	expect(googleNewsOption?.toConfig("https://www.TechCrunch.com/2026/01/02/some-article")).toEqual(publisherFeed)
})

// a value naming no domain would build a feed that finds nothing, so it builds none at all
test("the google news option needs a domain", () => {
	expect(googleNewsOption?.toConfig("TechCrunch")).toBeNull()
	expect(googleNewsOption?.toConfig("")).toBeNull()
})

// the publisher reads back out of the feed url, and a feed that names no publisher is not a publisher feed
test("a publisher feed names its publisher", () => {
	expect(toGoogleNewsPublisher(toGoogleNewsFeedUrl("site:techcrunch.com") ?? "")).toBe("techcrunch.com")
	expect(toGoogleNewsPublisher(toGoogleNewsFeedUrl("espresso machines") ?? "")).toBeNull()
	expect(toGoogleNewsPublisher("https://hamel.dev/rss.xml")).toBeNull()
	expect(toGoogleNewsPublisher("not a url")).toBeNull()
})

// Google News saves as an rss source, so it stays a custom source instead of matching the default set
test("a stored source matches only the default it belongs to", () => {
	expect(toDefaultSource("search")?.key).toBe("webSearch")
	expect(toDefaultSource("rss")).toBeNull()
	expect(toDefaultSource("reddit")).toBeNull()
})

// each option stores what its ingester reads, and the option that reads nothing has no picker entry at all
test("each custom option names its config field", () => {
	const toOptionConfig = (key: string, value: string): Record<string, unknown> | null | undefined =>
		CUSTOM_SOURCE_OPTIONS.find((option) => option.key === key)?.toConfig(value)
	expect(toOptionConfig("url", "https://a.test/page")).toEqual({ url: "https://a.test/page" })
	expect(toOptionConfig("rss", "https://a.test/feed")).toEqual({ url: "https://a.test/feed" })
	expect(toOptionConfig("reddit", "r/mcp")).toEqual({ subreddit: "mcp" })
	expect(toOptionConfig("youtube", "PL456")).toEqual({ playlistId: "PL456" })
	expect(toOptionConfig("youtube", "UC123")).toEqual({ channelId: "UC123" })
	expect(toOptionConfig("podcast", "1528594034")).toEqual({ podcastId: "1528594034" })
})

// a handle reads the same with or without its @, so the stored one never keeps it
test("the bluesky option stores a handle without its leading @", () => {
	const blueskyOption = CUSTOM_SOURCE_OPTIONS.find((option) => option.key === "bluesky")
	expect(blueskyOption?.toConfig("@alice.bsky.social")).toEqual({ handle: "alice.bsky.social" })
	expect(blueskyOption?.toConfig("alice.bsky.social")).toEqual({ handle: "alice.bsky.social" })
})

// a suggestion resolves a show name to its id before it is deduped, so the exclusion has to carry
// the id too. keying on the summary re-suggests a source the topic already follows once a scan names it
test("toSourceValue reads what the ingester stores, not the display name", () => {
	expect(toSourceValue("podcast", { podcastId: "1528594034", name: "Hard Fork" })).toBe("1528594034")
	expect(toSourceValue("youtube", { channelId: "UC123", name: "@veritasium" })).toBe("UC123")
	expect(toSourceValue("youtube", { playlistId: "PL456" })).toBe("PL456")

	// the kinds whose stored value is already what a suggestion resolves to
	expect(toSourceValue("reddit", { subreddit: "mcp", query: "agents" })).toBe("mcp")
	expect(toSourceValue("bluesky", { handle: "alice.bsky.social" })).toBe("alice.bsky.social")
	expect(toSourceValue("rss", { url: "https://a.test/feed" })).toBe("https://a.test/feed")

	// a config missing the field its kind reads has no value to exclude on
	expect(toSourceValue("podcast", {})).toBe("")
	expect(toSourceValue("search", {})).toBe("")
})
