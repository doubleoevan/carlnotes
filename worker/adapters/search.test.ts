// search adapter tests for the pure result parser and prompt builder
import { expect, test } from "bun:test"
import { buildSearchPrompt, parseResults } from "./search"

// two distinct results plus a third repeating the first url, to exercise in-payload dedupe
const SEARCH_RESPONSE = {
	results: [
		{ url: "https://a.com/1", title: "One", highlights: ["hi one", "hi two"] },
		{ url: "https://b.com/2", title: "Two" },
		{ url: "https://a.com/1", title: "One again" },
	],
	costDollars: { total: 0.005 },
}

// each result becomes one "read" Resource mapped to its url, deduped within the payload. the provider's cost is also returned
test("parseResults maps search results to deduped read Resources and reports cost", () => {
	const { resources, cost } = parseResults(SEARCH_RESPONSE)
	expect(resources.map((resource) => resource.url)).toEqual(["https://a.com/1", "https://b.com/2"])

	// every Resource is a "read" kind, and the first result's title comes through
	expect(resources.every((resource) => resource.kind === "read")).toBe(true)
	expect(resources[0]?.title).toBe("One")

	// the native snippet is Exa's result highlights joined. a result without it leaves the snippet null
	expect(resources[0]?.snippet).toBe("hi one hi two")
	expect(resources[1]?.snippet).toBeNull()
	expect(cost).toBe(0.005)
})

// a response without cost still parses, default cost is 0
test("parseResults defaults cost to 0 when the provider omits costDollars", () => {
	expect(parseResults({ results: [] }).cost).toBe(0)
})

// an empty context falls back to the topic name, so the search always gets a prompt
test("buildSearchPrompt falls back to the topic name when the context is empty", () => {
	expect(buildSearchPrompt("   ", "Agent infra weekly")).toContain("Agent infra weekly")
})
