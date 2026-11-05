import {
	TopicSearchResultDetails as SharedTopicSearchResultDetails,
	type TopicSearchResultDetailsElements,
	type TopicSearchResultDetailsProps,
} from "@carlnotes/core/components/TopicSearchResultDetails"
import { PodcastEpisodeNumberPill } from "@/components/podcast/PodcastEpisodePill"

const elements: TopicSearchResultDetailsElements = {
	Text: ({ children }) => <>{children}</>,
	PodcastPill: PodcastEpisodeNumberPill,
}

/**
 * Adapts shared Topic search metadata to the web's existing podcast pill.
 */
export function TopicSearchResultDetails(props: TopicSearchResultDetailsProps) {
	return <SharedTopicSearchResultDetails {...props} elements={elements} />
}
