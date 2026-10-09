import { RotateCcw, RotateCw } from "lucide-react"
import type * as React from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { SKIP_BACK_SECONDS, SKIP_FORWARD_SECONDS } from "@/lib/podcastEpisodePlayback"
import { PLAYBACK_CONTROL_BUTTON_CLASS } from "@/lib/styleClasses"
import { cyclePlaybackRate, skipPlaybackBy } from "@/stores/podcastEpisodePlayerStore"

/**
 * The skip back and skip forward buttons of the loaded podcast episode, each with its label as a tooltip.
 */
export function SkipPlaybackButtons() {
	return (
		<>
			<PlaybackControlButton
				label={`Skip back ${SKIP_BACK_SECONDS} seconds`}
				onClick={() => skipPlaybackBy(-SKIP_BACK_SECONDS)}
			>
				<RotateCcw className="size-4.5" />
			</PlaybackControlButton>
			<PlaybackControlButton
				label={`Skip forward ${SKIP_FORWARD_SECONDS} seconds`}
				onClick={() => skipPlaybackBy(SKIP_FORWARD_SECONDS)}
			>
				<RotateCw className="size-4.5" />
			</PlaybackControlButton>
		</>
	)
}

/**
 * The button that steps the loaded podcast episode's playback speed, showing the speed that the episode plays at.
 */
export function PlaybackSpeedButton({ playbackRate }: { playbackRate: number }) {
	return (
		<PlaybackControlButton label="Playback speed" onClick={cyclePlaybackRate}>
			{`${playbackRate}x`}
		</PlaybackControlButton>
	)
}

// one playback control, whose label is both its accessible name and its tooltip
function PlaybackControlButton({
	label,
	onClick,
	children,
}: {
	label: string
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button type="button" aria-label={label} onClick={onClick} className={PLAYBACK_CONTROL_BUTTON_CLASS}>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent side="top">{label}</TooltipContent>
		</Tooltip>
	)
}
