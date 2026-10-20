import type { VoiceChatPage } from "@shared/payloads"
import { useNavigate } from "@tanstack/react-router"
import { LoaderCircle, Mic } from "lucide-react"
import type { VoiceRecording } from "@/components/chat/useVoiceRecording"
import { IconButton } from "@/components/common/IconButton"
import { toSignupNavigation } from "@/components/session/signupPrompts"
import { SEND_BUTTON_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

// the composer's voice page, its draft, how many files it holds, and whether a send or a post is on its way
type IsMicShownOptions = {
	voiceChatPage: VoiceChatPage | null
	draft: string
	attachmentCount: number
	isBusy: boolean
}

/**
 * Whether the mic takes the send slot: voice is on, the box and the attachments are empty, and nothing is on its
 * way.
 */
export function isMicShown({ voiceChatPage, draft, attachmentCount, isBusy }: IsMicShownOptions): boolean {
	return voiceChatPage !== null && draft.trim() === "" && attachmentCount === 0 && !isBusy
}

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
	const navigate = useNavigate()

	// the microphone request and the transcription both show a spinner in the slot. an idle mic shows a ring while
	// listen mode waits for carl
	const isWaiting = voiceRecording.state === "requesting" || voiceRecording.state === "transcribing"
	const isListeningForNextTurn = voiceRecording.isListening && voiceRecording.state === "idle"
	return (
		<IconButton
			tooltip="Talk to Carl"
			isDisabled={isWaiting}
			onClick={isSignupRequired ? () => void navigate(toSignupNavigation("chat-voice")) : voiceRecording.start}
			className={cn(SEND_BUTTON_CLASS, isListeningForNextTurn && "ring-primary/50 ring-2 ring-offset-2")}
		>
			{isWaiting ? <LoaderCircle className="size-4 animate-spin" /> : <Mic className="size-4" />}
		</IconButton>
	)
}
