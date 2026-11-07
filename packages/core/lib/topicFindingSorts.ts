// what order a feed's topic findings read in
import type { TopicFinding, TopicFindingSort } from "@carlnotes/contracts/findings"

// how many views one comment counts for under the trending sort
const COMMENT_TRENDING_VIEWS = 5

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
	// trending ranks the most views and comments first, and a tie falls back to recency, then to the finding's id
	return [...findings].sort(
		(first, second) =>
			toTrendingScore(second) - toTrendingScore(first) ||
			byRecency(first, second) ||
			first.findingId.localeCompare(second.findingId),
	)
}

// a finding's views, with each comment counting for several
function toTrendingScore(finding: TopicFinding): number {
	return finding.viewCount + (finding.commentCount ?? 0) * COMMENT_TRENDING_VIEWS
}

// newest first, with the fetch time standing in when a finding has no publish date
function byRecency(a: TopicFinding, b: TopicFinding): number {
	return new Date(b.publishedAt ?? b.fetchedAt).getTime() - new Date(a.publishedAt ?? a.fetchedAt).getTime()
}
