// what order a feed's topic findings read in
import type { TopicFinding } from "@shared/contracts"

// the feed sort modes. all three are read-side orderings of the delivered findings, never persisted
export const TOPIC_FINDING_SORTS = ["relevant", "newest", "trending"] as const

export type TopicFindingSort = (typeof TOPIC_FINDING_SORTS)[number]

/**
 * Order findings for display. Bookmarked findings are pinned above the unbookmarked ones in every mode,
 * and the current sort orders each group among itself, never interleaving the two.
 */
export function toSortedTopicFindings(findings: TopicFinding[], sort: TopicFindingSort): TopicFinding[] {
	const bookmarkedFindings = findings.filter((finding) => finding.isBookmarked)
	const unbookmarkedFindings = findings.filter((finding) => !finding.isBookmarked)
	return [...sortTopicFindings(bookmarkedFindings, sort), ...sortTopicFindings(unbookmarkedFindings, sort)]
}

// one group's ordering under the active sort mode
function sortTopicFindings(findings: TopicFinding[], sort: TopicFindingSort): TopicFinding[] {
	// relevance scores bunch at the top, so most of the first page ties and the tiebreak does the ordering
	if (sort === "relevant") {
		return [...findings].sort(
			(first, second) =>
				second.relevanceScore - first.relevanceScore ||
				byRecency(first, second) ||
				first.findingId.localeCompare(second.findingId),
		)
	}
	if (sort === "newest") {
		return [...findings].sort(byRecency)
	}
	// trending ranks engagement value first, and findings without one fall back to recency
	return [...findings].sort((first, second) => {
		if (first.engagement !== null && second.engagement !== null) {
			return second.engagement - first.engagement
		}
		// a finding with engagement outranks one without
		if (first.engagement !== null || second.engagement !== null) {
			return first.engagement !== null ? -1 : 1
		}
		return byRecency(first, second)
	})
}

// newest first, with the fetch time standing in when a finding has no publish date
function byRecency(a: TopicFinding, b: TopicFinding): number {
	return new Date(b.publishedAt ?? b.fetchedAt).getTime() - new Date(a.publishedAt ?? a.fetchedAt).getTime()
}
