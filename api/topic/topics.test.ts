// topic tests for the api
import { expect, test } from "bun:test"
import { toSourceSummary } from "./topics"

// each source kind summarizes its own config field
test("toSourceSummary summarizes each kind's config", () => {
	expect(toSourceSummary("rss", { url: "https://blog.langchain.dev/rss/" })).toBe("blog.langchain.dev")
	expect(toSourceSummary("reddit", { subreddit: "mcp" })).toBe("r/mcp")
	expect(toSourceSummary("youtube", { channelId: "UC123" })).toBe("UC123")
	expect(toSourceSummary("youtube", { playlistId: "PL456" })).toBe("PL456")
})

// the search adapter ignores its config and web search from the topic prompt, so the summary stays empty for the ui to fill
test("toSourceSummary is empty for the web search source even when a query is stored", () => {
	expect(toSourceSummary("search", { query: "production LLM agents" })).toBe("")
})

// an unparseable feed url falls back to the raw url instead of dropping the summary
test("toSourceSummary keeps a raw rss url that has no host", () => {
	expect(toSourceSummary("rss", { url: "not a url" })).toBe("not a url")
})

// a missing config value or an unknown source kind summarize to an empty string
test("toSourceSummary is empty for missing values and unknown kinds", () => {
	expect(toSourceSummary("rss", {})).toBe("")
	expect(toSourceSummary("composio", { anything: true })).toBe("")
})
