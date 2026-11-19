import {
	UnpublishedPodcastEpisodeCard as SharedUnpublishedPodcastEpisodeCard,
	type UnpublishedPodcastEpisodeCardElements,
	type UnpublishedPodcastEpisodeCardProps,
} from "@carlnotes/core/components/UnpublishedPodcastEpisodeCard"
import type { PodcastEpisodeProgressLine as PodcastEpisodeProgressLineCopy } from "@carlnotes/core/lib/podcastEpisodeCopy"
import { cn } from "@carlnotes/nightshift/classNames"
import { COVER_RECORDING_CLASS, INFO_CARD_CLASS } from "@/lib/styleClasses"
import { PodcastEpisodeCover } from "./PodcastEpisodeCover"

// a progress line's words and its text size
type PodcastEpisodeProgressLineProps = PodcastEpisodeProgressLineCopy & { className: string }

const UNPUBLISHED_PODCAST_EPISODE_CARD_ELEMENTS: UnpublishedPodcastEpisodeCardElements = {
	Frame: ({ children }) => <div className={cn(INFO_CARD_CLASS, "flex items-center gap-4")}>{children}</div>,
	Group: ({ children, className }) => <div className={className}>{children}</div>,
	Text: ({ children, className }) => <div className={className}>{children}</div>,
	Cover: ({ podcastEpisode, isRecording }) => (
		<PodcastEpisodeCover
			podcastEpisode={podcastEpisode}
			className={cn("border-separator shadow-raised size-24 border sm:size-36", isRecording && COVER_RECORDING_CLASS)}
		/>
	),
	ProgressLine: (progressLine) => (
		<PodcastEpisodeProgressLine {...progressLine} className="text-base font-semibold sm:text-lg" />
	),
}

/**
 * A line of podcast episode work in progress: its emoji, hidden from a screen reader, then its shimmering text.
 */
export function PodcastEpisodeProgressLine({ emoji, text, className }: PodcastEpisodeProgressLineProps) {
	return (
		<p className={className}>
			<span aria-hidden="true" className="mr-1.5">
				{emoji}
			</span>
			<span className="shimmer-text">{text}</span>
		</p>
	)
}

/**
 * Adapts the shared unpublished episode card to browser cover and shimmer rendering.
 */
export function UnpublishedPodcastEpisodeCard(props: UnpublishedPodcastEpisodeCardProps) {
	return <SharedUnpublishedPodcastEpisodeCard {...props} elements={UNPUBLISHED_PODCAST_EPISODE_CARD_ELEMENTS} />
}
