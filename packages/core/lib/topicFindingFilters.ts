// which topic findings a feed filter shows
import type { TopicFinding, TopicFindingFilter } from "@carlnotes/contracts/findings"

/**
 * Whether a finding is rated thumbs down, which takes it out of the feed and leaves it no reactions or comments.
 */
export function isFindingRatedDown(finding: Pick<TopicFinding, "rating">): boolean {
	return finding.rating === "down"
}

/**
 * Whether a finding belongs in the given feed view.
 */
export function matchesTopicFindingFilter(
	finding: Pick<TopicFinding, "isConsumed" | "isBookmarked" | "teamBookmarks" | "rating">,
	view: TopicFindingFilter,
	bookmarkScope: "mine" | "team" = "mine",
): boolean {
	// a finding rated thumbs down shows in no view
	if (isFindingRatedDown(finding)) {
		return false
	}
	if (view === "unread") {
		return !finding.isConsumed
	}
	// the team scope widens the bookmarked view to every member's saved findings
	if (view === "bookmarked" && bookmarkScope === "team") {
		return finding.isBookmarked || finding.teamBookmarks.length > 0
	}
	return view === "bookmarked" ? finding.isBookmarked : true
}
