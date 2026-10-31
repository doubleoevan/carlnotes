import { MIC_BUTTON_LABEL, toMicButtonState } from "@carlnotes/core/lib/voiceRecordingRules"
import { cn } from "@carlnotes/nightshift/classNames"
import { useNavigate } from "@tanstack/react-router"
import { LoaderCircle, Mic } from "lucide-react"
import { IconButton } from "@/components/common/IconButton"
import { toSignupNavigation } from "@/components/session/signupPrompts"
import { SEND_BUTTON_CLASS } from "@/lib/styleClasses"
import type { VoiceRecording } from "./useVoiceRecording"

export { isMicShown } from "@carlnotes/core/lib/voiceRecordingRules"

/**
 * The mic in an empty composer's send slot. A tap starts a recording, and a visitor's tap routes to signup to speak
 * with Carl. A tap blurs the box, so a phone keyboard closes.
 */
export function MicButton({
	voiceRecording,
	isSignupRequired = false,
}: {
	voiceRecording: VoiceRecording
	// a visitor's tap routes to signup instead of asking for the microphone. a chat room has no visitor
	isSignupRequired?: boolean
}) {
	// the spinner while the microphone is asked for or the transcript is on its way, and the ring while listen mode waits
	const navigate = useNavigate()
	const { isWaiting, isListeningForNextQuestion } = toMicButtonState(voiceRecording)
	return (
		<IconButton
			tooltip={MIC_BUTTON_LABEL}
			isDisabled={isWaiting}
			onClick={isSignupRequired ? () => void navigate(toSignupNavigation("chat-voice")) : voiceRecording.start}
			className={cn(SEND_BUTTON_CLASS, isListeningForNextQuestion && "ring-primary/50 ring-2 ring-offset-2")}
		>
			{isWaiting ? <LoaderCircle className="size-4 animate-spin" /> : <Mic className="size-4" />}
		</IconButton>
	)
}
