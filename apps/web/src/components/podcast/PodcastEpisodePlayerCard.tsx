import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import {
	type PodcastEpisodePlayerCardElements,
	PodcastEpisodePlayerCard as SharedPodcastEpisodePlayerCard,
} from "@carlnotes/core/components/PodcastEpisodePlayerCard"
import { cn } from "@carlnotes/nightshift/classNames"
import { Rss } from "lucide-react"
import { MoreButton } from "@/components/topic/MoreButton"
import {
	INFO_CARD_CLASS,
	MENU_BUTTON_CLASS,
	PLAYBACK_CONTROL_BUTTON_CLASS,
	SCRIPTED_ONLY_CLASS,
} from "@/lib/styleClasses"
import { PlaybackSpeedButton, SkipPlaybackButtons } from "./PlaybackControlButtons"
import { type ChapterTopicFeed, PodcastEpisodeChapters } from "./PodcastEpisodeChapters"
import { PodcastEpisodeDetails } from "./PodcastEpisodeDetails"
import { PodcastEpisodePlayButton } from "./PodcastEpisodePlayButton"
import { isPodcastEpisodeQuestionButtonShown, PodcastEpisodeQuestionButton } from "./PodcastEpisodeQuestionControls"
import { PodcastEpisodeSeekBar } from "./PodcastEpisodeSeekBar"

const elements: PodcastEpisodePlayerCardElements<ChapterTopicFeed> = {
	Group: ({ children, className }) => <div className={className}>{children}</div>,
	Card: ({ children }) => <div className={cn(INFO_CARD_CLASS, "flex flex-col gap-4")}>{children}</div>,
	PlayButton: PodcastEpisodePlayButton,
	Details: PodcastEpisodeDetails,
	Controls: ({ podcastEpisode, playbackRate }) => (
		<>
			<SkipPlaybackButtons />
			<PlaybackSpeedButton playbackRate={playbackRate} />
			{isPodcastEpisodeQuestionButtonShown(podcastEpisode) && (
				<PodcastEpisodeQuestionButton
					podcastEpisode={podcastEpisode}
					className={cn(PLAYBACK_CONTROL_BUTTON_CLASS, "disabled:opacity-40")}
				/>
			)}
		</>
	),
	SeekBar: PodcastEpisodeSeekBar,
	Chapters: PodcastEpisodeChapters,
	FeedButton: ({ onPress, className, label }) => (
		<button
			type="button"
			onClick={onPress}
			className={cn(
				MENU_BUTTON_CLASS,
				"bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground border-transparent px-4 font-semibold",
				className,
			)}
		>
			<Rss className="size-4" />
			{label}
		</button>
	),
	More: (props) => <MoreButton {...props} className={SCRIPTED_ONLY_CLASS} />,
	Feedback: ({ isLoading, errorMessage }) =>
		errorMessage ? (
			<p role="alert" className="text-sm text-destructive">
				{errorMessage}
			</p>
		) : isLoading ? (
			<p role="status" className="text-xs text-muted-foreground">
				Loading audio…
			</p>
		) : null,
}

/**
 * Adapts the shared player card to browser controls, Finding popovers, and spoken questions.
 */
export function PodcastEpisodePlayerCard(props: {
	podcastEpisode: PodcastEpisode
	podcastEpisodePath?: string
	chapterTopicFeed: ChapterTopicFeed
	onOpenPodcastFeedDialog: () => void
}) {
	return <SharedPodcastEpisodePlayerCard {...props} elements={elements} />
}
