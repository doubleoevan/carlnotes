// review pipeline export tests: labeling a fixture's Resources from the topic's ratings and bookmarks
import { expect, test } from "bun:test"
import { toLabeledResource } from "./reviewPipelineExport"

// a Resource row of one of the topic's Findings, built from the finding id and the rating that a case varies
const toTopicResourceRow = (
	findingId: string,
	rating: "up" | "down" | null,
): Parameters<typeof toLabeledResource>[0] => ({
	title: "A finding",
	url: `https://example.test/${findingId}`,
	snippet: null,
	kind: "read" as const,
	contentKey: null,
	findingId,
	rating,
})

test("a rating or a bookmark labels a Resource, and a thumbs down outweighs a bookmark", () => {
	const bookmarkedFindingIds = new Set(["bookmarked", "bookmarked-and-down"])

	// a thumbs up and a bookmark are relevant, each naming its source
	expect(toLabeledResource(toTopicResourceRow("liked", "up"), bookmarkedFindingIds)).toMatchObject({
		isRelevant: true,
		labelSource: "rating",
	})
	expect(toLabeledResource(toTopicResourceRow("bookmarked", null), bookmarkedFindingIds)).toMatchObject({
		isRelevant: true,
		labelSource: "bookmark",
	})

	// a thumbs down is not relevant, even on a bookmarked finding
	expect(toLabeledResource(toTopicResourceRow("bookmarked-and-down", "down"), bookmarkedFindingIds)).toMatchObject({
		isRelevant: false,
		labelSource: "rating",
	})

	// anything else waits for a person, and no Resource keeps its page text
	const unlabeledResource = toLabeledResource(toTopicResourceRow("unrated", null), bookmarkedFindingIds)
	expect(unlabeledResource.isRelevant).toBeNull()
	expect(unlabeledResource).not.toHaveProperty("snippet")
	expect(unlabeledResource).not.toHaveProperty("content")
})
