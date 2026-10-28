import { expect, test } from "bun:test"
import { toStagedTopicSourceSummary } from "./topicSources"

test("staged sources retain their resolved name and otherwise use the registry summary", () => {
	expect(
		toStagedTopicSourceSummary({ optionKey: "rss", value: "https://example.com/feed", name: "Reader's journal" }),
	).toBe("Reader's journal")
	expect(toStagedTopicSourceSummary({ optionKey: "rss", value: "https://example.com/feed" })).toBe("example.com")
	expect(toStagedTopicSourceSummary({ optionKey: "url", value: "https://example.com/articles" })).toBe(
		"https://example.com/articles",
	)
	expect(toStagedTopicSourceSummary({ optionKey: "rss", value: "unfinished address" })).toBe("unfinished address")
})
