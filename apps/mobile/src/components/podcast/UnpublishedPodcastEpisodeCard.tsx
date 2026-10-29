import {
	UnpublishedPodcastEpisodeCard as SharedUnpublishedPodcastEpisodeCard,
	type UnpublishedPodcastEpisodeCardElements,
	type UnpublishedPodcastEpisodeCardProps,
} from "@carlnotes/core/components/UnpublishedPodcastEpisodeCard"
import { View } from "react-native"
import { ShimmerText } from "@/components/common/ShimmerText"
import { Text } from "@/components/primitives/text"
import { PodcastEpisodeCover } from "./PodcastEpisodeCover"

const elements: UnpublishedPodcastEpisodeCardElements = {
	Frame: ({ children }) => (
		<View className="flex-row items-center gap-4 rounded-lg border border-separator bg-card p-5 shadow-raised">
			{children}
		</View>
	),
	Group: View,
	Text,
	Cover: (props) => (
		<PodcastEpisodeCover {...props} className="size-24 border border-separator shadow-raised sm:size-36" />
	),
	Recording: () => (
		<View className="flex-row items-start gap-1.5">
			<Text accessibilityElementsHidden>🤫</Text>
			<ShimmerText className="text-base font-semibold text-foreground sm:text-lg">
				Carl and Vienna are recording...
			</ShimmerText>
		</View>
	),
}

/**
 * Adapts the shared unpublished episode card to platform image and text controls.
 */
export function UnpublishedPodcastEpisodeCard(props: UnpublishedPodcastEpisodeCardProps) {
	return <SharedUnpublishedPodcastEpisodeCard {...props} elements={elements} />
}
