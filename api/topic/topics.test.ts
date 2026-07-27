// topic tests for the api

import { expect, test } from "bun:test"
import type { TopicScan } from "@shared/contracts"
import { toLastSucceededScan, toSourceSummary } from "./topics"

// a scan history row, varied only by the status and id each test needs
function scanRow(id: string, status: TopicScan["status"]): TopicScan {
	return {
		id,
		status,
		startedAt: "2026-07-24T12:00:00.000Z",
		finishedAt: "2026-07-24T12:01:00.000Z",
		// the counts, cost, recap, and failure reason the page reads
		foundCount: 0,
		keptCount: 0,
		filteredCount: 0,
		cost: null,
		scanSummary: null,
		error: null,
	}
}

// scheduling counts a failed scan as the window spent, but the page's baseline stays the last succeeded scan,
// so a failed day never rewrites the summary or hides the findings behind it
test("toLastSucceededScan skips a newer failed scan", () => {
	const history = [scanRow("newest-failed", "failed"), scanRow("succeeded", "succeeded"), scanRow("older", "succeeded")]
	expect(toLastSucceededScan(history)?.id).toBe("succeeded")
})

// a history with nothing succeeded yet has no baseline to report
test("toLastSucceededScan is undefined when no scan has succeeded", () => {
	expect(toLastSucceededScan([scanRow("failed", "failed"), scanRow("running", "running")])).toBeUndefined()
})

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
