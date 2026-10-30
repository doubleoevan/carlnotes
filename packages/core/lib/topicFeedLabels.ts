import {
	type TagMatchMode,
	TOPIC_FINDING_FILTERS,
	type TopicFindingFilter,
	type TopicFindingSort,
} from "@carlnotes/contracts/findings"
import type { TopicSectionKey } from "@carlnotes/contracts/topics"

// the feed's section titles and empty states
export const TOPIC_SECTION_TITLES: Record<TopicSectionKey, string> = {
	yours: "Your topics",
	subscribed: "Your subscribed topics",
	featured: "Featured topics",
	popular: "Popular topics",
	unknown: "More topics",
}
export const EMPTY_TOPIC_SECTION = "Give Carl a topic. You know the one."
export const EMPTY_FILTERED_FINDINGS = "Nothing new worth your time yet. Carl has standards."
export const EMPTY_TOPIC_FINDINGS = "Carl's getting started. The raccoon put a pot on..."

// the finding view and ordering labels
export const TOPIC_FINDING_SORT_LABELS: Record<TopicFindingSort, string> = {
	relevant: "Relevance",
	newest: "Newest",
	trending: "Trending",
}
export const TOPIC_FINDING_FILTER_LABELS: Record<TopicFindingFilter, string> = {
	all: "All",
	unread: "Unread",
	bookmarked: "Bookmarked",
}

// the tag menu's matching choices
export const TAG_MATCH_LABELS: Record<TagMatchMode, string> = {
	any: "Any Match",
	all: "All Match",
	none: "Exclude Tags",
	off: "Off",
}

// a Finding view can select either the user's or the team's bookmarks
type TopicFindingFilterOption = { filter: TopicFindingFilter; label: string; bookmarkScope?: "mine" | "team" }

/**
 * Returns the web and mobile Finding views, including direct Team bookmark choices.
 */
export function toTopicFindingFilterOptions({
	hasTeamBookmarks,
	isSignedIn,
}: {
	hasTeamBookmarks: boolean
	isSignedIn: boolean
}): TopicFindingFilterOption[] {
	return TOPIC_FINDING_FILTERS.flatMap((filter): TopicFindingFilterOption[] => {
		// every view but Bookmarked is one option, and Bookmarked needs an account
		if (filter !== "bookmarked") {
			return [{ filter, label: TOPIC_FINDING_FILTER_LABELS[filter] }]
		}
		if (!isSignedIn) {
			return []
		}

		// a team member chooses whose bookmarks
		return hasTeamBookmarks
			? [
					{ filter, label: "My bookmarked", bookmarkScope: "mine" },
					{ filter, label: "Team bookmarked", bookmarkScope: "team" },
				]
			: [{ filter, label: TOPIC_FINDING_FILTER_LABELS[filter] }]
	})
}
