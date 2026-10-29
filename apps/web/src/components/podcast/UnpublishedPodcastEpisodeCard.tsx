import {
	UnpublishedPodcastEpisodeCard as SharedUnpublishedPodcastEpisodeCard,
	type UnpublishedPodcastEpisodeCardElements,
	type UnpublishedPodcastEpisodeCardProps,
} from "@carlnotes/core/components/UnpublishedPodcastEpisodeCard"
import { cn } from "@carlnotes/nightshift/classNames"
import { COVER_RECORDING_CLASS, INFO_CARD_CLASS } from "@/lib/styleClasses"
import { PodcastEpisodeCover } from "./PodcastEpisodeCover"

const elements: UnpublishedPodcastEpisodeCardElements = {
	Frame: ({ children }) => <div className={cn(INFO_CARD_CLASS, "flex items-center gap-4")}>{children}</div>,
	Group: ({ children, className }) => <div className={className}>{children}</div>,
	Text: ({ children, className }) => <div className={className}>{children}</div>,
	Cover: ({ podcastEpisode, isRecording }) => (
		<PodcastEpisodeCover
			podcastEpisode={podcastEpisode}
			className={cn("border-separator shadow-raised size-24 border sm:size-36", isRecording && COVER_RECORDING_CLASS)}
		/>
	),
	Recording: () => (
		<p className="text-base font-semibold sm:text-lg">
			<span aria-hidden="true" className="mr-1.5">
				🤫
			</span>
			<span className="shimmer-text">Carl and Vienna are recording...</span>
		</p>
	),
}

/**
 * Adapts the shared unpublished episode card to browser cover and shimmer rendering.
 */
export function UnpublishedPodcastEpisodeCard(props: UnpublishedPodcastEpisodeCardProps) {
	return <SharedUnpublishedPodcastEpisodeCard {...props} elements={elements} />
}
