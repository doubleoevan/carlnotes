// the Filters menu's options, which the search page and its rows share: each finding view's label, and each kind of
// result's label and icon
import type { SearchResultKind } from "@carlnotes/contracts/search"
import { CircleUserRound, Coffee, Globe, type LucideIcon, Mic, NotebookPen, Users } from "lucide-react"

export { TOPIC_FINDING_FILTER_LABELS } from "@carlnotes/core/lib/topicFeedLabels"

// each kind of result's label
export const SEARCH_RESULT_KIND_LABELS: Record<SearchResultKind, string> = {
	topics: "Topics",
	podcastEpisodes: "Podcasts",
	topicPosts: "Posts",
	findings: "Findings",
	teams: "Teams",
	users: "Cafés",
}

// each kind of result's icon
export const SEARCH_RESULT_KIND_ICON: Record<SearchResultKind, LucideIcon> = {
	topics: Coffee,
	podcastEpisodes: Mic,
	topicPosts: NotebookPen,
	findings: Globe,
	teams: Users,
	users: CircleUserRound,
}
