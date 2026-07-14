// search adapter self-check: the pure result parser and prompt builder, verified offline (no network, no LLM)
import { expect, test } from "bun:test"
import { buildQueryPrompt, parseResults } from "./search"

// two distinct results plus a third repeating the first url, to exercise in-payload dedupe
const SEARCH_RESPONSE = {
	results: [
		{ url: "https://a.com/1", title: "One" },
		{ url: "https://b.com/2", title: "Two" },
		{ url: "https://a.com/1", title: "One again" },
	],
	costDollars: { total: 0.005 },
}

// each result becomes one read Resource keyed by its url, deduped within the payload, and the provider's cost is surfaced
test("parseResults maps search results to deduped read Resources and reports cost", () => {
	const { resources, cost } = parseResults(SEARCH_RESPONSE)
	expect(resources.map((resource) => resource.url)).toEqual(["https://a.com/1", "https://b.com/2"])
	// every Resource is a read and the first result's title comes through
	expect(resources.every((resource) => resource.kind === "read")).toBe(true)
	expect(resources[0]?.title).toBe("One")
	expect(cost).toBe(0.005)
})

// a response without costDollars still parses, defaulting cost to 0
test("parseResults defaults cost to 0 when the provider omits costDollars", () => {
	expect(parseResults({ results: [] }).cost).toBe(0)
})

// an empty context doc falls back to the topic name so the model always has a seed
test("buildQueryPrompt falls back to the topic name when the context doc is empty", () => {
	expect(buildQueryPrompt("   ", "Agent infra weekly")).toContain("Agent infra weekly")
})
