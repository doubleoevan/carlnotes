import {
	TopicSearchResultDetails as SharedTopicSearchResultDetails,
	type TopicSearchResultDetailsElements,
	type TopicSearchResultDetailsProps,
} from "@carlnotes/core/components/TopicSearchResultDetails"
import { DOT_SEPARATED_TEXTS_ELEMENTS } from "@/components/common/DotSeparatedTexts"
import { PodcastEpisodeNumberPill } from "@/components/podcast/PodcastEpisodePill"

const elements: TopicSearchResultDetailsElements = {
	Text: DOT_SEPARATED_TEXTS_ELEMENTS.Text,
	PodcastPill: PodcastEpisodeNumberPill,
}

/**
 * Adapts shared Topic search metadata to the web's existing podcast pill.
 */
export function TopicSearchResultDetails(props: TopicSearchResultDetailsProps) {
	return <SharedTopicSearchResultDetails {...props} elements={elements} />
}
