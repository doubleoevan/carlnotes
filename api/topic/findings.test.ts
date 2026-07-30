// topic findings tests for filter, new count, and url host extraction
import { expect, test } from "bun:test"
import type { TopicFinding } from "@shared/contracts"
import { filteredTopicFindings, newTopicFindingCount, toUrlHost } from "./findings"

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
		engagement: null,
		isConsumed,
		isBookmarked: false,
	}
}

// the default view hides consumed topic findings. the "All" view shows them
test("filteredTopicFindings hides consumed by default and shows them for the 'All' view", () => {
	// three topic findings, one consumed
	const topicFindings = [topicFinding(false), topicFinding(true), topicFinding(false)]
	// the default view keeps the two unconsumed findings, in order, and drops the consumed one
	const unconsumedTopicFindings = filteredTopicFindings(topicFindings, false)
	expect(unconsumedTopicFindings[0]).toBe(topicFindings[0])
	expect(unconsumedTopicFindings[1]).toBe(topicFindings[2])
	// the "All" view keeps all three in their original order
	expect(filteredTopicFindings(topicFindings, true)).toEqual(topicFindings)
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
