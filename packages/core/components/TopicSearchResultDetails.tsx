import { isPublishedPodcastEpisode, type PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import { toDotSeparatedText } from "@carlnotes/contracts/text"
import type { ComponentType, ReactNode } from "react"
import { toCountLabel } from "../lib/labels"

export type TopicSearchResultDetailsProps = {
	viewerCount?: number | null
	subscriberCount?: number | null
	latestPodcastEpisode?: PodcastEpisodeSummary | null
}
export type TopicSearchResultDetailsElements = {
	Text: ComponentType<{ children: ReactNode }>
	PodcastPill: ComponentType<{ podcastEpisode: PodcastEpisodeSummary }>
}

/**
 * Shares a Topic search result's viewer and follower counts and published podcast pill.
 */
export function TopicSearchResultDetails({
	viewerCount,
	subscriberCount,
	latestPodcastEpisode,
	elements: { Text, PodcastPill },
}: TopicSearchResultDetailsProps & { elements: TopicSearchResultDetailsElements }) {
	return (
		<>
			{/* only supplied counts are displayed, including zero */}
			<Text>
				{toDotSeparatedText([
					"Topic",
					...(viewerCount == null ? [] : [toCountLabel(viewerCount, "viewer")]),
					...(subscriberCount == null ? [] : [toCountLabel(subscriberCount, "follower")]),
				])}
			</Text>
			{latestPodcastEpisode && isPublishedPodcastEpisode(latestPodcastEpisode) && (
				<PodcastPill podcastEpisode={latestPodcastEpisode} />
			)}
		</>
	)
}
