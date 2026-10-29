import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import {
	type PodcastEpisodePlayerCardElements,
	PodcastEpisodePlayerCard as SharedPodcastEpisodePlayerCard,
} from "@carlnotes/core/components/PodcastEpisodePlayerCard"
import { Rss } from "lucide-react-native"
import { type ComponentProps, type ComponentRef, type RefObject, useMemo } from "react"
import { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { MoreButton } from "@/components/topic/MoreButton"
import { PlaybackSpeedButton, SkipPlaybackButtons } from "./PlaybackControlButtons"
import { type ChapterTopicFeed, PodcastEpisodeChapters } from "./PodcastEpisodeChapters"
import { PodcastEpisodeDetails } from "./PodcastEpisodeDetails"
import { PodcastEpisodePlayButton } from "./PodcastEpisodePlayButton"
import { PodcastEpisodeSeekBar } from "./PodcastEpisodeSeekBar"

const elements: PodcastEpisodePlayerCardElements<ChapterTopicFeed> = {
	Group: View,
	Card: ({ children }) => (
		<View className="gap-4 rounded-lg border border-separator bg-card p-5 shadow-raised">{children}</View>
	),
	PlayButton: ({ podcastEpisode, size, onPress }) => (
		<PodcastEpisodePlayButton episode={podcastEpisode} size={size} onPress={onPress} />
	),
	Details: PodcastEpisodeDetails,
	Controls: ({ playbackRate }) => (
		<>
			<SkipPlaybackButtons />
			<PlaybackSpeedButton playbackRate={playbackRate} />
		</>
	),
	SeekBar: PodcastEpisodeSeekBar,
	Chapters: PodcastEpisodeChapters,
	FeedButton,
	More: ({ className: _className, ...props }) => <MoreButton {...props} />,
	Feedback: ({ isLoading, errorMessage }) =>
		errorMessage ? (
			<Text accessibilityRole="alert" className="text-sm text-destructive">
				{errorMessage}
			</Text>
		) : isLoading ? (
			<Text accessibilityLiveRegion="polite" className="text-xs text-muted-foreground">
				Loading audio…
			</Text>
		) : null,
}

/**
 * Adapts the shared player card to platform controls and Finding sheets.
 */
export function PodcastEpisodePlayerCard({
	feedButtonRef,
	...props
}: {
	podcastEpisode: PodcastEpisode
	podcastEpisodePath?: string
	chapterTopicFeed: ChapterTopicFeed
	onOpenPodcastFeedDialog: () => void
	feedButtonRef?: RefObject<ComponentRef<typeof View> | null>
}) {
	// keep the trigger renderer stable while playback position updates
	const platformElements = useMemo(
		() => ({
			...elements,
			FeedButton: (buttonProps: ComponentProps<typeof FeedButton>) => (
				<FeedButton {...buttonProps} triggerRef={feedButtonRef} />
			),
		}),
		[feedButtonRef],
	)
	return <SharedPodcastEpisodePlayerCard {...props} elements={platformElements} />
}

// retain a concrete platform target for the feed sheet's focus return
function FeedButton({
	onPress,
	className,
	label,
	triggerRef,
}: ComponentProps<PodcastEpisodePlayerCardElements<ChapterTopicFeed>["FeedButton"]> & {
	triggerRef?: RefObject<ComponentRef<typeof View> | null>
}) {
	return (
		<Button ref={triggerRef} onPress={onPress} className={className} accessibilityLabel={label}>
			<Icon as={Rss} className="size-4" />
			<Text>{label}</Text>
		</Button>
	)
}
