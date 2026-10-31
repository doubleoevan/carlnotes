import { MIC_BUTTON_LABEL, toMicButtonState } from "@carlnotes/core/lib/voiceRecordingRules"
import { cn } from "@carlnotes/nightshift/classNames"
import { Mic } from "lucide-react-native"
import { Keyboard } from "react-native"
import { ThemedSpinner } from "@/components/common/ThemedSpinner"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import type { VoiceRecording } from "./useVoiceRecording"

export { isMicShown } from "@carlnotes/core/lib/voiceRecordingRules"

/**
 * Shows the mic in an empty composer's send slot, the web's MicButton. A tap closes the keyboard and starts a
 * recording. A spinner shows while the microphone is asked for or the transcript is on its way, and a ring shows while
 * listen mode waits for carl.
 */
export function MicButton({ voiceRecording }: { voiceRecording: VoiceRecording }) {
	const { isWaiting, isListeningForNextQuestion } = toMicButtonState(voiceRecording)
	return (
		<Button
			size="icon"
			accessibilityLabel={MIC_BUTTON_LABEL}
			accessibilityState={{ busy: isWaiting, disabled: isWaiting }}
			disabled={isWaiting}
			onPress={() => {
				Keyboard.dismiss()
				voiceRecording.start()
			}}
			className={cn(isListeningForNextQuestion && "ring-2 ring-primary/50 ring-offset-2 ring-offset-background")}
		>
			{isWaiting ? <ThemedSpinner color="primaryForeground" /> : <Icon as={Mic} className="size-4" />}
		</Button>
	)
}
