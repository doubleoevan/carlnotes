import {
	type PodcastEpisodeRowElements,
	type PodcastEpisodeRowProps,
	PodcastEpisodeRow as SharedPodcastEpisodeRow,
} from "@carlnotes/core/components/PodcastEpisodeRow"
import { cn } from "@carlnotes/nightshift/classNames"
import { Pause, Play } from "lucide-react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { DASHED_ROW_CLASS, LIST_ROW_HOVER_CLASS, PLAY_BUTTON_CLASS, PLAY_BUTTON_MUTED_CLASS } from "@/lib/styleClasses"
import { PodcastEpisodeTooltip } from "./PodcastEpisodeDetails"
import { RemovePodcastEpisodeButton } from "./RemovePodcastEpisodeDialog"

const elements: PodcastEpisodeRowElements = {
	Row: ({ children, className }) => (
		<li className={cn(DASHED_ROW_CLASS, LIST_ROW_HOVER_CLASS, "flex items-center gap-3 py-2.5 pr-1 pl-2", className)}>
			{children}
		</li>
	),
	Group: ({ children }) => <div className="min-w-0 flex-1">{children}</div>,
	Metadata: ({ children }) => (
		<div className="text-muted-foreground text-xs" suppressHydrationWarning>
			{children}
		</div>
	),
	Play: ({ podcastEpisode, isPlaying, isMuted, onPress, label }) => (
		<PodcastEpisodeTooltip podcastEpisode={podcastEpisode}>
			<button
				type="button"
				aria-label={label}
				onClick={onPress}
				className={cn(
					PLAY_BUTTON_CLASS,
					"size-11 after:absolute after:inset-0 sm:size-9",
					isMuted && PLAY_BUTTON_MUTED_CLASS,
				)}
			>
				{isPlaying ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
			</button>
		</PodcastEpisodeTooltip>
	),
	Title: ({ podcastEpisode, path, children }) => (
		<div className="truncate text-sm font-bold">
			<PodcastEpisodeTooltip podcastEpisode={podcastEpisode}>
				{path ? (
					<AnchorLink href={path} className="relative z-10 hover:underline">
						{children}
					</AnchorLink>
				) : (
					<span className="relative z-10">{children}</span>
				)}
			</PodcastEpisodeTooltip>
		</div>
	),
	Remove: (props) => <RemovePodcastEpisodeButton {...props} className="relative z-10" />,
}

/**
 * Adapts shared episode rows to browser links, tooltips, and row-wide playback targets.
 */
export function PodcastEpisodeRow(props: PodcastEpisodeRowProps) {
	return <SharedPodcastEpisodeRow {...props} elements={elements} />
}
