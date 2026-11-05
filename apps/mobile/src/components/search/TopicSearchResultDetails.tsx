import {
	TopicSearchResultDetails as SharedTopicSearchResultDetails,
	type TopicSearchResultDetailsElements,
	type TopicSearchResultDetailsProps,
} from "@carlnotes/core/components/TopicSearchResultDetails"
import { PodcastEpisodeNumberPill } from "@/components/podcast/PodcastEpisodePill"
import { Text } from "@/components/primitives/text"

const elements: TopicSearchResultDetailsElements = {
	Text: ({ children }) => <Text className="text-xs text-muted-foreground">{children}</Text>,
	PodcastPill: PodcastEpisodeNumberPill,
}

/**
 * Adapts shared Topic search metadata to the native podcast pill.
 */
export function TopicSearchResultDetails(props: TopicSearchResultDetailsProps) {
	return <SharedTopicSearchResultDetails {...props} elements={elements} />
}
