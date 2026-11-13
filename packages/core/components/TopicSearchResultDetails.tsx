import { isPublishedPodcastEpisode, type PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import { toCountLabel } from "@carlnotes/contracts/text"
import type { ComponentType } from "react"
import { DotSeparatedTexts, type DotSeparatedTextsElements } from "./DotSeparatedTexts"

export type TopicSearchResultDetailsProps = {
	viewerCount?: number | null
	subscriberCount?: number | null
	latestPodcastEpisode?: PodcastEpisodeSummary | null
}
export type TopicSearchResultDetailsElements = {
	Text: DotSeparatedTextsElements["Text"]
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
			<DotSeparatedTexts
				texts={[
					"Topic",
					viewerCount == null ? null : toCountLabel(viewerCount, "visitor"),
					subscriberCount == null ? null : toCountLabel(subscriberCount, "follower"),
				]}
				elements={{ Text }}
			/>
			{latestPodcastEpisode && isPublishedPodcastEpisode(latestPodcastEpisode) && (
				<PodcastPill podcastEpisode={latestPodcastEpisode} />
			)}
		</>
	)
}
