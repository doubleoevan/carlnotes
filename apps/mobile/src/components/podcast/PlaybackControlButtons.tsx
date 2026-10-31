import {
	PLAYBACK_CONTROL_BUTTON_CLASS,
	type PlaybackControlElement,
	PlaybackSpeedButton as SharedPlaybackSpeedButton,
	SkipPlaybackButtons as SharedSkipPlaybackButtons,
} from "@carlnotes/core/components/PlaybackControlButtons"
import { RotateCcw, RotateCw } from "lucide-react-native"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"

// every playback control's shape, in the card and the podcast player
export const MOBILE_PLAYBACK_CONTROL_BUTTON_CLASS = `${PLAYBACK_CONTROL_BUTTON_CLASS} h-auto w-auto border-separator active:bg-accent`

const Control: PlaybackControlElement = ({ label, onPress, icon, text }) => (
	<Button
		variant="ghost"
		size="icon"
		className={MOBILE_PLAYBACK_CONTROL_BUTTON_CLASS}
		accessibilityLabel={label}
		onPress={onPress}
	>
		{icon ? (
			<Icon as={icon === "back" ? RotateCcw : RotateCw} className="size-4.5 text-muted-foreground" />
		) : (
			<Text className="font-bold text-muted-foreground">{text}</Text>
		)}
	</Button>
)

/**
 * Adapts shared skip controls to accessible platform buttons.
 */
export function SkipPlaybackButtons() {
	return <SharedSkipPlaybackButtons Control={Control} />
}

/**
 * Adapts the shared speed cycle to the platform's labeled button.
 */
export function PlaybackSpeedButton({ playbackRate }: { playbackRate: number }) {
	return <SharedPlaybackSpeedButton playbackRate={playbackRate} Control={Control} />
}
