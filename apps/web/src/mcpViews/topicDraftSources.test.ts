import { expect, test } from "bun:test"
import { countMcpTopicDraftSources, toMcpTopicDraftSources } from "./topicDraftSources"

// explicit chat links precede recommendations and retain one canonical URL each
test("chat URLs seed editable Sources before deduplicated recommendations", () => {
	const sources = toMcpTopicDraftSources({
		links: ["https://example.com/a?utm_source=chat", "https://example.com/a"],
		suggestions: [
			{ sourceOption: "webSearch", value: "" },
			{ sourceOption: "url", value: "https://example.com/a" },
			{ sourceOption: "rss", value: "https://example.com/feed" },
		],
	})
	expect(sources).toEqual([
		{ sourceOption: "url", value: "https://example.com/a" },
		{ sourceOption: "rss", value: "https://example.com/feed" },
	])
	expect(countMcpTopicDraftSources(sources)).toBe(3)
})

test("ten chat links remain reviewable and expose the implicit-default limit", () => {
	const links = Array.from({ length: 10 }, (_, index) => `https://example.com/${index}`)
	const sources = toMcpTopicDraftSources({
		links,
		suggestions: [{ sourceOption: "rss", value: "https://example.com/feed" }],
	})
	expect(sources.map((source) => source.value)).toEqual(links)
	expect(countMcpTopicDraftSources(sources)).toBe(11)
})
