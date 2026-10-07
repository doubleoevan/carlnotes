import type { PodcastEpisode } from "@shared/contracts"
import { Pause, Play } from "lucide-react"
import { PodcastEpisodeTooltip } from "@/components/podcast/PodcastEpisodeDetails"
import { PLAY_BUTTON_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { togglePodcastEpisodePlayback, useIsPodcastEpisodePlaying } from "@/stores/podcastEpisodePlayerStore"

/**
 * The play button of a topic's latest podcast episode, beside the topic's note icon,
 * with a tooltip that names the podcast over the episode's details.
 */
export function LatestPodcastEpisodePlayButton({
	podcastEpisode,
	className,
	onMouseEnter,
}: {
	podcastEpisode: PodcastEpisode
	className?: string
	onMouseEnter?: () => void
}) {
	// whether the podcast episode is playing, which turns the play icon into a pause icon
	const isPodcastEpisodePlaying = useIsPodcastEpisodePlaying(podcastEpisode.id)
	const PlaybackIcon = isPodcastEpisodePlaying ? Pause : Play
	return (
		<PodcastEpisodeTooltip podcastEpisode={podcastEpisode}>
			<button
				type="button"
				aria-label={`${isPodcastEpisodePlaying ? "Pause" : "Play"} episode ${podcastEpisode.episodeNumber}`}
				// keep the click from the card or the heading behind the button
				onClick={(event) => {
					event.stopPropagation()
					void togglePodcastEpisodePlayback(podcastEpisode.id)
				}}
				onMouseEnter={onMouseEnter}
				className={cn("shrink-0 hover:opacity-75", className)}
			>
				<span className={cn(PLAY_BUTTON_CLASS, "size-6")}>
					<PlaybackIcon className="size-3 fill-current" />
				</span>
			</button>
		</PodcastEpisodeTooltip>
	)
}
