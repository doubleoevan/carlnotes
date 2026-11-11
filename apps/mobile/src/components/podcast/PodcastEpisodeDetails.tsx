import {
	type PodcastEpisodeDetailsElements,
	type PodcastEpisodeDetailsProps,
	PodcastEpisodeDetails as SharedPodcastEpisodeDetails,
} from "@carlnotes/core/components/PodcastEpisodeDetails"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Text } from "@/components/primitives/text"

const elements: PodcastEpisodeDetailsElements = {
	Group: View,
	Text,
	Title: ({ podcastEpisode, path, isInTooltip }) =>
		path ? (
			<AnchorLink asChild href={path} accessibilityLabel={`Open ${podcastEpisode.title ?? "episode"}`}>
				<Text className="text-lg font-bold leading-snug">{podcastEpisode.title}</Text>
			</AnchorLink>
		) : (
			<Text className={isInTooltip ? "text-xs font-bold" : "text-lg font-bold leading-snug"}>
				{podcastEpisode.title}
			</Text>
		),
}

/**
 * Adapts shared episode details to platform text and episode navigation.
 */
export function PodcastEpisodeDetails(props: PodcastEpisodeDetailsProps) {
	return <SharedPodcastEpisodeDetails {...props} elements={elements} />
}
