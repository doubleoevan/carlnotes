import {
	type PodcastEpisodeDetailsElements,
	type PodcastEpisodeDetailsProps,
	PodcastEpisodeDetails as SharedPodcastEpisodeDetails,
} from "@carlnotes/core/components/PodcastEpisodeDetails"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Text } from "@/components/primitives/text"
import { PodcastThemeSongNote } from "./PodcastThemeSongNote"

const elements: PodcastEpisodeDetailsElements = {
	Group: View,
	Text,
	// keep the credits trigger outside Text so VoiceOver exposes it independently
	Title: ({ podcastEpisode, path, isInTooltip }) => (
		<View className="flex-row items-end">
			<View className="min-w-0 flex-1">
				{path ? (
					<AnchorLink asChild href={path} accessibilityLabel={`Open ${podcastEpisode.title ?? "episode"}`}>
						<Text className="text-lg font-bold leading-snug">{podcastEpisode.title}</Text>
					</AnchorLink>
				) : (
					<Text className={isInTooltip ? "text-xs font-bold" : "text-lg font-bold leading-snug"}>
						{podcastEpisode.title}
					</Text>
				)}
			</View>
			{!isInTooltip && <PodcastThemeSongNote />}
		</View>
	),
}

/**
 * Adapts shared episode details to platform text, episode navigation, and theme-song sheets.
 */
export function PodcastEpisodeDetails(props: PodcastEpisodeDetailsProps) {
	return <SharedPodcastEpisodeDetails {...props} elements={elements} />
}
