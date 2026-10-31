import {
	type SpokenAnswerButtonOptions,
	toSpokenAnswerButtonLabel,
	useSpokenAnswerButton,
} from "@carlnotes/core/hooks/useSpokenAnswerButton"
import type { SpokenAnswerState } from "@carlnotes/core/stores/spokenAnswerQueue"
import { Play, Square } from "lucide-react-native"
import { ThemedSpinner } from "@/components/common/ThemedSpinner"
import { Icon } from "@/components/primitives/icon"
import { ChatMessageAction } from "./ChatMessageParts"

/**
 * Shows the web's play button in a reply's footer, which speaks the reply from its start in the voice of the host who
 * gave it and becomes Stop while it loads or plays.
 */
export function SpokenAnswerButton(spokenAnswerButtonOptions: SpokenAnswerButtonOptions) {
	const { spokenAnswerState, toggleSpokenAnswer } = useSpokenAnswerButton(spokenAnswerButtonOptions)
	return <SpokenAnswerControl spokenAnswerState={spokenAnswerState} onToggle={toggleSpokenAnswer} />
}

/**
 * Draws the play button for a spoken answer state: Play while idle, a spinner while loading, and a filled square
 * while playing, both labeled Stop.
 */
export function SpokenAnswerControl({
	spokenAnswerState,
	onToggle,
}: {
	spokenAnswerState: SpokenAnswerState
	onToggle: () => void
}) {
	return (
		<ChatMessageAction accessibilityLabel={toSpokenAnswerButtonLabel(spokenAnswerState)} onPress={onToggle}>
			{spokenAnswerState === "idle" ? (
				<Icon as={Play} className="size-3.5 text-muted-foreground" />
			) : spokenAnswerState === "loading" ? (
				<ThemedSpinner color="mutedForeground" />
			) : (
				<Icon as={Square} className="size-3 text-muted-foreground" fill="currentColor" />
			)}
		</ChatMessageAction>
	)
}
