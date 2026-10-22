import { RotateCcw, RotateCw } from "lucide-react"
import { IconButton } from "@/components/common/IconButton"
import { SKIP_BACK_SECONDS, SKIP_FORWARD_SECONDS } from "@/lib/podcastEpisodePlayback"
import { PLAYBACK_CONTROL_BUTTON_CLASS } from "@/lib/styleClasses"
import { cyclePlaybackRate, skipPlaybackBy } from "@/stores/podcastEpisodePlayerStore"

/**
 * The skip back and skip forward buttons of the loaded podcast episode, each with its label as a tooltip.
 */
export function SkipPlaybackButtons() {
	return (
		<>
			<IconButton
				tooltip={`Skip back ${SKIP_BACK_SECONDS} seconds`}
				className={PLAYBACK_CONTROL_BUTTON_CLASS}
				onClick={() => skipPlaybackBy(-SKIP_BACK_SECONDS)}
			>
				<RotateCcw className="size-4.5" />
			</IconButton>
			<IconButton
				tooltip={`Skip forward ${SKIP_FORWARD_SECONDS} seconds`}
				className={PLAYBACK_CONTROL_BUTTON_CLASS}
				onClick={() => skipPlaybackBy(SKIP_FORWARD_SECONDS)}
			>
				<RotateCw className="size-4.5" />
			</IconButton>
		</>
	)
}

/**
 * The button that steps the loaded podcast episode's playback speed, showing the speed that the episode plays at. Its
 * tooltip and accessible name include the speed it shows.
 */
export function PlaybackSpeedButton({ playbackRate }: { playbackRate: number }) {
	const playbackRateText = `${playbackRate}x`
	return (
		<IconButton
			tooltip={`Playback speed ${playbackRateText}`}
			className={PLAYBACK_CONTROL_BUTTON_CLASS}
			onClick={cyclePlaybackRate}
		>
			{playbackRateText}
		</IconButton>
	)
}
