import { expect, test } from "bun:test"
import { toSortedSectionTopics, toTrendingTopics } from "./topicSorts"

// a topic with the fields the trending order reads
function trendingTopic(
	id: string,
	viewerCount: number,
	subscriberCount: number,
	feedUpdatedAt: string,
): { id: string; viewerCount: number; subscriberCount: number; feedUpdatedAt: string } {
	return { id, viewerCount, subscriberCount, feedUpdatedAt }
}

// viewers rank first, a tie on viewers falls to followers, and a tie on both falls to the newest finding
test("toTrendingTopics orders by viewers, then followers, then recency", () => {
	const mostViewedTopic = trendingTopic("most-viewed", 40, 0, "2026-01-01T00:00:00.000Z")
	const moreFollowedTopic = trendingTopic("more-followed", 10, 5, "2026-01-01T00:00:00.000Z")
	const newerTopic = trendingTopic("newer", 10, 2, "2026-03-01T00:00:00.000Z")
	const olderTopic = trendingTopic("older", 10, 2, "2026-02-01T00:00:00.000Z")
	const trendingTopics = toTrendingTopics([olderTopic, newerTopic, moreFollowedTopic, mostViewedTopic])
	expect(trendingTopics.map((topic) => topic.id)).toEqual(["most-viewed", "more-followed", "newer", "older"])
})

// a full tie falls to the id, so two renders of one section agree
test("toTrendingTopics breaks a full tie by id, whatever the input order", () => {
	const firstTopic = trendingTopic("a", 1, 1, "2026-01-01T00:00:00.000Z")
	const secondTopic = trendingTopic("b", 1, 1, "2026-01-01T00:00:00.000Z")
	expect(toTrendingTopics([secondTopic, firstTopic]).map((topic) => topic.id)).toEqual(["a", "b"])
	expect(toTrendingTopics([firstTopic, secondTopic]).map((topic) => topic.id)).toEqual(["a", "b"])
})

// trending reorders a section, Featured keeps the admin's order, and the other sorts keep the delivered order
test("toSortedSectionTopics reorders under trending, except Featured", () => {
	const lessViewedTopic = trendingTopic("less-viewed", 1, 0, "2026-01-01T00:00:00.000Z")
	const moreViewedTopic = trendingTopic("more-viewed", 9, 0, "2026-01-01T00:00:00.000Z")
	const deliveredTopics = [lessViewedTopic, moreViewedTopic]
	const toIds = (topics: { id: string }[]): string[] => topics.map((topic) => topic.id)

	// trending reorders Popular and leaves Featured, and the other sorts leave the order
	expect(toIds(toSortedSectionTopics("popular", deliveredTopics, "trending"))).toEqual(["more-viewed", "less-viewed"])
	expect(toIds(toSortedSectionTopics("featured", deliveredTopics, "trending"))).toEqual(["less-viewed", "more-viewed"])
	expect(toIds(toSortedSectionTopics("popular", deliveredTopics, "relevant"))).toEqual(["less-viewed", "more-viewed"])
	expect(toIds(toSortedSectionTopics("yours", deliveredTopics, "newest"))).toEqual(["less-viewed", "more-viewed"])
})
