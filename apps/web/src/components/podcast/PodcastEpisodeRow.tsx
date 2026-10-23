import type { PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import { toDotSeparatedText } from "@carlnotes/contracts/text"
import { toPodcastEpisodeDayAndDurationLabels, toPodcastEpisodeTitleLabel } from "@carlnotes/core/lib/labels"
import { Pause, Play } from "lucide-react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { DASHED_ROW_CLASS, LIST_ROW_HOVER_CLASS, PLAY_BUTTON_CLASS, PLAY_BUTTON_MUTED_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { togglePodcastEpisodePlayback } from "@/stores/podcastEpisodePlayActions"
import { useIsPodcastEpisodePlaying } from "@/stores/podcastEpisodePlayerStore"
import { PodcastEpisodeTooltip } from "./PodcastEpisodeDetails"
import { RemovePodcastEpisodeButton } from "./RemovePodcastEpisodeDialog"

// the podcast episode, its page's path or null for an episode without a page yet, whether the episode is the topic's
// latest, whether its play button is muted, the row's own classes, and the call that opens the remove dialog, passed
// only if the user may remove episodes
type PodcastEpisodeRowProps = {
	podcastEpisode: PodcastEpisodeSummary
	podcastEpisodePath: string | null
	isLatestPodcastEpisode: boolean
	isPlayButtonMuted?: boolean
	className?: string
	onRemovePodcastEpisode?: () => void
}

/**
 * One podcast episode's list item, with its play button, its title linked to the episode's page if it has one, its date
 * and duration, and the remove button if a remove call is passed. The button and the title each open the episode's
 * tooltip.
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
		<li className={cn(DASHED_ROW_CLASS, LIST_ROW_HOVER_CLASS, "flex items-center gap-3 py-2.5 pr-1 pl-2", className)}>
			{/* the play button with its tooltip. the button's click area covers the row */}
			<PodcastEpisodeTooltip podcastEpisode={podcastEpisode}>
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
					{isPodcastEpisodePlaying ? (
						<Pause className="size-4 fill-current" />
					) : (
						<Play className="size-4 fill-current" />
					)}
				</button>
			</PodcastEpisodeTooltip>
			{/* the podcast episode's number and title with its tooltip, over its date and duration */}
			<div className="min-w-0 flex-1">
				<div className="truncate text-sm font-bold">
					<PodcastEpisodeTooltip podcastEpisode={podcastEpisode}>
						{podcastEpisodePath ? (
							<AnchorLink href={podcastEpisodePath} className="relative z-10 hover:underline">
								{toPodcastEpisodeTitleLabel(podcastEpisode)}
							</AnchorLink>
						) : (
							<span className="relative z-10">{toPodcastEpisodeTitleLabel(podcastEpisode)}</span>
						)}
					</PodcastEpisodeTooltip>
				</div>
				<div className="text-muted-foreground text-xs" suppressHydrationWarning>
					{toDotSeparatedText(podcastEpisodeDetailLabels)}
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
