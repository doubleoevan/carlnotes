import {
	type PlaybackControlElement,
	PlaybackSpeedButton as SharedPlaybackSpeedButton,
	SkipPlaybackButtons as SharedSkipPlaybackButtons,
} from "@carlnotes/core/components/PlaybackControlButtons"
import { RotateCcw, RotateCw } from "lucide-react"
import { IconButton } from "@/components/common/IconButton"
import { PLAYBACK_CONTROL_BUTTON_CLASS } from "@/lib/styleClasses"

const Control: PlaybackControlElement = ({ label, onPress, icon, text }) => (
	<IconButton tooltip={label} onClick={onPress} className={PLAYBACK_CONTROL_BUTTON_CLASS}>
		{icon === "back" ? (
			<RotateCcw className="size-4.5" />
		) : icon === "forward" ? (
			<RotateCw className="size-4.5" />
		) : (
			text
		)}
	</IconButton>
)

/**
 * Adapts shared skip controls to browser buttons and tooltips.
 */
export function SkipPlaybackButtons() {
	return <SharedSkipPlaybackButtons Control={Control} />
}

/**
 * Adapts the shared speed cycle to the browser's labeled button.
 */
export function PlaybackSpeedButton({ playbackRate }: { playbackRate: number }) {
	return <SharedPlaybackSpeedButton playbackRate={playbackRate} Control={Control} />
}
