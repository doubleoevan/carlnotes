import {
	UnpublishedPodcastEpisodeCard as SharedUnpublishedPodcastEpisodeCard,
	type UnpublishedPodcastEpisodeCardElements,
	type UnpublishedPodcastEpisodeCardProps,
} from "@carlnotes/core/components/UnpublishedPodcastEpisodeCard"
import type { PodcastEpisodeProgressLine as PodcastEpisodeProgressLineCopy } from "@carlnotes/core/lib/podcastEpisodeCopy"
import { View } from "react-native"
import { ShimmerText } from "@/components/common/ShimmerText"
import { Text } from "@/components/primitives/text"
import { PodcastEpisodeCover } from "./PodcastEpisodeCover"

// a progress line's words and its text size
type PodcastEpisodeProgressLineProps = PodcastEpisodeProgressLineCopy & { className: string }

const UNPUBLISHED_PODCAST_EPISODE_CARD_ELEMENTS: UnpublishedPodcastEpisodeCardElements = {
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
	ProgressLine: (progressLine) => (
		<PodcastEpisodeProgressLine {...progressLine} className="text-base font-semibold text-foreground sm:text-lg" />
	),
}

/**
 * A line of podcast episode work in progress: its emoji, hidden from a screen reader, then its shimmering text.
 */
export function PodcastEpisodeProgressLine({ emoji, text, className }: PodcastEpisodeProgressLineProps) {
	return (
		<View className="flex-row items-start gap-1.5">
			<Text accessibilityElementsHidden importantForAccessibility="no" className={className}>
				{emoji}
			</Text>
			<ShimmerText className={className}>{text}</ShimmerText>
		</View>
	)
}

/**
 * Adapts the shared unpublished episode card to platform image and text controls.
 */
export function UnpublishedPodcastEpisodeCard(props: UnpublishedPodcastEpisodeCardProps) {
	return <SharedUnpublishedPodcastEpisodeCard {...props} elements={UNPUBLISHED_PODCAST_EPISODE_CARD_ELEMENTS} />
}
