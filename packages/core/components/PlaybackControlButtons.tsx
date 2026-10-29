import type { ComponentType } from "react"
import { SKIP_BACK_SECONDS, SKIP_FORWARD_SECONDS } from "../lib/podcastEpisodePlayback"
import { cyclePlaybackRate, skipPlaybackBy } from "../stores/podcastEpisodePlayerStore"

// keep the web's raised control treatment on both platform adapters
export const PLAYBACK_CONTROL_BUTTON_CLASS =
	"bg-muted text-muted-foreground hover:text-foreground hover:bg-accent inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-bold shadow-raised sm:min-h-9 sm:min-w-9"

export type PlaybackControlElement = ComponentType<{
	label: string
	icon?: "back" | "forward"
	text?: string
	onPress: () => void
}>

/**
 * Composes the shared 15-second backward and 30-second forward controls.
 */
export function SkipPlaybackButtons({ Control }: { Control: PlaybackControlElement }) {
	return (
		<>
			<Control
				label={`Skip back ${SKIP_BACK_SECONDS} seconds`}
				icon="back"
				onPress={() => skipPlaybackBy(-SKIP_BACK_SECONDS)}
			/>
			<Control
				label={`Skip forward ${SKIP_FORWARD_SECONDS} seconds`}
				icon="forward"
				onPress={() => skipPlaybackBy(SKIP_FORWARD_SECONDS)}
			/>
		</>
	)
}

/**
 * Composes the shared speed-cycle control and its accessible current speed.
 */
export function PlaybackSpeedButton({
	playbackRate,
	Control,
}: {
	playbackRate: number
	Control: PlaybackControlElement
}) {
	const text = `${playbackRate}x`
	return <Control label={`Playback speed ${text}`} text={text} onPress={cyclePlaybackRate} />
}
