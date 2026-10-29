import type { PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import {
	type PodcastEpisodePlayButtonElements,
	PodcastEpisodePlayButton as SharedPodcastEpisodePlayButton,
} from "@carlnotes/core/components/PodcastEpisodePlayButton"
import { cn } from "@carlnotes/nightshift/classNames"
import { Pause, Play } from "lucide-react"
import { PLAY_BUTTON_CLASS } from "@/lib/styleClasses"
import { PodcastEpisodeTooltip } from "./PodcastEpisodeDetails"

const elements: PodcastEpisodePlayButtonElements = {
	Button: ({ children, label, onPress, onHover, className, size }) => (
		<button
			type="button"
			aria-label={label}
			onClick={(event) => {
				event.stopPropagation()
				onPress()
			}}
			onMouseEnter={onHover}
			className={cn("shrink-0 hover:opacity-75", className)}
		>
			<span
				className={cn(
					PLAY_BUTTON_CLASS,
					size === "lg" ? "size-14 sm:size-16" : size === "default" ? "size-11" : "size-6",
				)}
			>
				{children}
			</span>
		</button>
	),
	Icon: ({ isPlaying, size }) => {
		const PlaybackIcon = isPlaying ? Pause : Play
		return (
			<PlaybackIcon
				className={cn("fill-current", size === "lg" ? "size-7" : size === "default" ? "size-4" : "size-3")}
			/>
		)
	},
	Tooltip: PodcastEpisodeTooltip,
}

/**
 * Adapts the shared episode play button to browser controls and its detail tooltip.
 */
export function PodcastEpisodePlayButton({
	podcastEpisode,
	className,
	onMouseEnter,
	onPress,
	size = "sm",
}: {
	podcastEpisode: PodcastEpisodeSummary
	className?: string
	size?: "sm" | "default" | "lg"
	onPress?: () => void
	onMouseEnter?: () => void
}) {
	return (
		<SharedPodcastEpisodePlayButton
			podcastEpisode={podcastEpisode}
			className={className}
			size={size}
			onHover={onMouseEnter}
			onPress={onPress}
			elements={elements}
		/>
	)
}
