// podcast episode plan tests: the order of the planned Findings
import { expect, test } from "bun:test"
import { MAX_PODCAST_EPISODE_FINDINGS, type TopicFindingRow, toPlannedFindings } from "./planPodcastEpisode"

// a user's rating of a Finding, and whether a user bookmarked it
type FindingRatingAndBookmark = Partial<Pick<TopicFindingRow, "rating" | "isBookmarked">>

// a Topic's Finding from the given Scan, with ids that follow from its name, and its rating and bookmark if it has them
function toFindingRow(
	name: string,
	scanId: string,
	findingRatingAndBookmark: FindingRatingAndBookmark = {},
): TopicFindingRow {
	return {
		findingId: `finding-${name}`,
		resourceId: `resource-${name}`,
		sourceUrl: `https://a.com/${name}`,
		scanId,
		rating: findingRatingAndBookmark.rating ?? null,
		isBookmarked: findingRatingAndBookmark.isBookmarked ?? false,
	}
}

// the planned Findings' names, which are their ids without the prefix
function toPlannedFindingNames(topicFindingRows: TopicFindingRow[], narratedFindingNames: string[] = []): string[] {
	const narratedResourceIds = new Set(narratedFindingNames.map((name) => `resource-${name}`))
	return toPlannedFindings({ topicFindingRows, narratedResourceIds, scanId: "scan-2" }).map((plannedFinding) =>
		plannedFinding.findingId.replace("finding-", ""),
	)
}

test("toPlannedFindings puts the Scan's Findings first, each group in score order", () => {
	// the rows arrive best first, alternating between an older Scan and this Scan
	const topicFindingRows = [
		toFindingRow("old-best", "scan-1"),
		toFindingRow("new-best", "scan-2"),
		toFindingRow("old-next", "scan-1"),
		toFindingRow("new-next", "scan-2"),
	]
	expect(toPlannedFindingNames(topicFindingRows)).toEqual(["new-best", "new-next", "old-best", "old-next"])
})

test("toPlannedFindings puts a narrated Finding last, even found again, and plans nothing if all were narrated", () => {
	// the Resource was narrated, then filtered out, and this Scan found it again as a new Finding
	const topicFindingRows = [
		toFindingRow("again", "scan-2"),
		toFindingRow("fresh", "scan-2"),
		toFindingRow("old", "scan-1"),
	]
	expect(toPlannedFindingNames(topicFindingRows, ["again", "old"])).toEqual(["fresh", "again", "old"])

	// a Topic whose every Finding was narrated plans nothing
	expect(toPlannedFindingNames(topicFindingRows, ["again", "fresh", "old"])).toEqual([])
})

test("toPlannedFindings stops at fifteen Findings", () => {
	// twenty Findings, the first four from this Scan
	const topicFindingRows = Array.from({ length: 20 }, (_, i) => toFindingRow(String(i), i < 4 ? "scan-2" : "scan-1"))
	const plannedFindingNames = toPlannedFindingNames(topicFindingRows)
	expect(plannedFindingNames).toHaveLength(MAX_PODCAST_EPISODE_FINDINGS)
	expect(plannedFindingNames.slice(0, 5)).toEqual(["0", "1", "2", "3", "4"])
})

test("toPlannedFindings never plans a Finding rated down, and puts liked and bookmarked ones after the Scan's own", () => {
	// a new Finding rated down, two older Findings never narrated, the lower-scored one bookmarked,
	// and three narrated Findings, the best-scored one unrated, one rated up, and one bookmarked
	const topicFindingRows = [
		toFindingRow("disliked", "scan-2", { rating: "down" }),
		toFindingRow("fresh", "scan-2"),
		toFindingRow("older", "scan-1"),
		toFindingRow("older-bookmarked", "scan-1", { isBookmarked: true }),
		toFindingRow("narrated-best", "scan-1"),
		toFindingRow("narrated-liked", "scan-1", { rating: "up" }),
		toFindingRow("narrated-bookmarked", "scan-1", { isBookmarked: true }),
	]
	const narratedFindingNames = ["narrated-best", "narrated-liked", "narrated-bookmarked"]
	expect(toPlannedFindingNames(topicFindingRows, narratedFindingNames)).toEqual([
		"fresh",
		"older-bookmarked",
		"narrated-liked",
		"narrated-bookmarked",
		"older",
		"narrated-best",
	])
})
