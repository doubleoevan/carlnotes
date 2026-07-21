// topic feed tests for filter, new count, and url host extraction
import { expect, test } from "bun:test"
import type { TopicFinding } from "@shared/contracts"
import { filteredTopicFindings, newTopicFindingCount, toUrlHost } from "./topicFeed.ts"

// a topic finding with placeholder fields. the tests only care about isConsumed
function topicFinding(isConsumed: boolean): TopicFinding {
	return {
		// the ids and the resource metadata
		findingId: "f",
		resourceId: "r",
		url: "https://example.com/a",
		resourceKind: "read",
		title: null,
		source: null,
		publishedAt: null,
		fetchedAt: "2026-01-01T00:00:00.000Z",
		// the topic finding's metadata and the user's isConsumed flag
		viewCount: 0,
		relevanceScore: 0,
		relevanceExplanation: "",
		rating: null,
		isConsumed,
	}
}

// the default view hides consumed topic findings. the "All" view shows them
test("filteredTopicFindings hides consumed by default and shows them for the 'All' view", () => {
	// three topic findings, one consumed
	const topicFindings = [topicFinding(false), topicFinding(true), topicFinding(false)]
	expect(filteredTopicFindings(topicFindings, false)).toHaveLength(2)
	expect(filteredTopicFindings(topicFindings, true)).toHaveLength(3)
})

// "# new" counts unconsumed topic findings
test("newTopicFindingCount counts unconsumed topic findings", () => {
	expect(newTopicFindingCount([topicFinding(false), topicFinding(true), topicFinding(false)])).toBe(2)
})

// toUrlHost extracts the url host or returns null for an unparseable url
test("toUrlHost returns the host or null", () => {
	expect(toUrlHost("https://www.example.com/x")).toBe("www.example.com")
	expect(toUrlHost("not a url")).toBeNull()
})
