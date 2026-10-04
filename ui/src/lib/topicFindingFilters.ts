// which topic findings a feed filter shows
import type { TopicFinding } from "@shared/contracts"

// the feed's filter views. bookmarked narrows to the user's bookmarked findings,
// and rated down shows the findings rated thumbs down, which every other view hides
export const TOPIC_FINDING_FILTERS = ["all", "unread", "bookmarked", "ratedDown"] as const

export type TopicFindingFilter = (typeof TOPIC_FINDING_FILTERS)[number]

/**
 * Whether a finding belongs in the given feed view.
 */
export function matchesTopicFindingFilter(
	finding: Pick<TopicFinding, "isConsumed" | "isBookmarked" | "teamBookmarks" | "rating">,
	view: TopicFindingFilter,
	bookmarkScope: "mine" | "team" = "mine",
): boolean {
	// a finding rated thumbs down shows only in the rated down view
	if (view === "ratedDown" || finding.rating === "down") {
		return view === "ratedDown" && finding.rating === "down"
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
