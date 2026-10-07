import type { PodcastEpisode } from "@shared/contracts"
import { Pause, Play } from "lucide-react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { RemovePodcastEpisodeButton } from "@/components/podcast/RemovePodcastEpisodeDialog"
import { toPodcastEpisodeDayAndDurationLabels, toPodcastEpisodeTitleLabel } from "@/lib/labels"
import { DASHED_ROW_CLASS, PLAY_BUTTON_CLASS, PLAY_BUTTON_MUTED_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { togglePodcastEpisodePlayback, useIsPodcastEpisodePlaying } from "@/stores/podcastEpisodePlayerStore"

// the podcast episode, its page's path, whether the episode is the topic's latest, whether its play button is muted,
// the row's own classes, and the call that opens the remove dialog, passed only if the user may remove episodes
type PodcastEpisodeRowProps = {
	podcastEpisode: PodcastEpisode
	podcastEpisodePath: string
	isLatestPodcastEpisode: boolean
	isPlayButtonMuted?: boolean
	className?: string
	onRemovePodcastEpisode?: () => void
}

/**
 * One podcast episode's list item, with its play button, its title linked to the episode's page, its date and duration,
 * and the remove button if a remove call is passed.
 */
export function PodcastEpisodeRow({
	podcastEpisode,
	podcastEpisodePath,
	isLatestPodcastEpisode,
	isPlayButtonMuted = false,
	className,
	onRemovePodcastEpisode,
}: PodcastEpisodeRowProps) {
	// whether the podcast episode is playing, and the date and duration line, ending in latest for the latest episode
	const isPodcastEpisodePlaying = useIsPodcastEpisodePlaying(podcastEpisode.id)
	const podcastEpisodeDetailLabels = [
		...toPodcastEpisodeDayAndDurationLabels(podcastEpisode),
		...(isLatestPodcastEpisode ? ["latest"] : []),
	]
	return (
		<li
			className={cn(
				DASHED_ROW_CLASS,
				"isolate flex items-center gap-3 py-2.5 pr-1 pl-2 before:absolute before:inset-0 before:-z-10",
				"hover:before:bg-accent-foreground/20 before:rounded-lg before:transition-colors",
				className,
			)}
		>
			{/* the play button. the button's click area covers the row */}
			<button
				type="button"
				aria-label={`${isPodcastEpisodePlaying ? "Pause" : "Play"} episode ${podcastEpisode.episodeNumber}`}
				onClick={() => void togglePodcastEpisodePlayback(podcastEpisode.id)}
				className={cn(
					PLAY_BUTTON_CLASS,
					"size-11 after:absolute after:inset-0 sm:size-9",
					isPlayButtonMuted && PLAY_BUTTON_MUTED_CLASS,
				)}
			>
				{isPodcastEpisodePlaying ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
			</button>
			{/* the podcast episode's number and title, over its date and duration */}
			<div className="min-w-0 flex-1">
				<div className="truncate text-sm font-bold">
					<AnchorLink href={podcastEpisodePath} className="relative z-10 hover:underline">
						{toPodcastEpisodeTitleLabel(podcastEpisode)}
					</AnchorLink>
				</div>
				<div className="text-muted-foreground text-xs" suppressHydrationWarning>
					{podcastEpisodeDetailLabels.join(" · ")}
				</div>
			</div>
			{/* the remove button */}
			{onRemovePodcastEpisode && (
				<RemovePodcastEpisodeButton
					episodeNumber={podcastEpisode.episodeNumber}
					className="relative z-10"
					onRemovePodcastEpisode={onRemovePodcastEpisode}
				/>
			)}
		</li>
	)
}
