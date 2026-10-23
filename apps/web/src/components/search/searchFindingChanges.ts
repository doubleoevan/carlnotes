// a change to a finding the search lists: the search page with that finding changed, and the feed handlers that
// report each change so the row shows it
import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { SearchResultsPage } from "@carlnotes/contracts/search"
import type { TopicFeedHandlers } from "@/providers/TopicFeedProvider"

// a change to one finding, as its row shows it
export type FindingChange = { findingId: string; topicFindingChange: Partial<TopicFinding> }

/**
 * Returns the search page with one finding's row changed, and every other row as it was. A page with more on it, such
 * as a card's, keeps the rest.
 */
export function toSearchPageWithFindingChange<Page extends SearchResultsPage>(
	searchPage: Page,
	{ findingId, topicFindingChange }: FindingChange,
): Page {
	const rows = searchPage.rows.map((searchRow) =>
		searchRow.kind === "finding" && searchRow.finding.findingId === findingId
			? { ...searchRow, finding: { ...searchRow.finding, ...topicFindingChange } }
			: searchRow,
	)
	return { ...searchPage, rows }
}

/**
 * Returns the feed handlers with each change also reported, so a row outside the feed shows it. Opening a finding
 * marks it read, as the feed's open does.
 */
export function toReportingFindingHandlers(
	topicFeedHandlers: TopicFeedHandlers,
	onFindingChange: (findingChange: FindingChange) => void,
): TopicFeedHandlers {
	return {
		openTopicFinding: (findingId) => {
			topicFeedHandlers.openTopicFinding(findingId)
			onFindingChange({ findingId, topicFindingChange: { isConsumed: true } })
		},
		consumeTopicFinding: (findingId, isConsumed) => {
			topicFeedHandlers.consumeTopicFinding(findingId, isConsumed)
			onFindingChange({ findingId, topicFindingChange: { isConsumed } })
		},
		rateTopicFinding: (findingId, rating) => {
			topicFeedHandlers.rateTopicFinding(findingId, rating)
			onFindingChange({ findingId, topicFindingChange: { rating } })
		},
		bookmarkTopicFinding: (findingId, isBookmarked) => {
			topicFeedHandlers.bookmarkTopicFinding(findingId, isBookmarked)
			onFindingChange({ findingId, topicFindingChange: { isBookmarked } })
		},
	}
}
