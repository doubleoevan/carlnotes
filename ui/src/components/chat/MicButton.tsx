import type { VoiceChatPage } from "@shared/payloads"
import { LoaderCircle, Mic } from "lucide-react"
import type { VoiceRecording } from "@/components/chat/useVoiceRecording"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
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
 * The mic in an empty composer's send slot. A tap starts a recording, and a visitor's tap routes to signup like the
 * send button's. A tap blurs the box, so a phone keyboard closes.
 */
export function MicButton({
	voiceRecording,
	isSignupRequired = false,
	onSignup,
}: {
	voiceRecording: VoiceRecording
	// a visitor's tap routes to signup instead of asking for the microphone. a chat room has no visitor
	isSignupRequired?: boolean
	onSignup?: () => void
}) {
	// the microphone request and the transcription both show a spinner in the slot. an idle mic shows a ring while
	// listen mode waits for carl
	const isWaiting = voiceRecording.state === "requesting" || voiceRecording.state === "transcribing"
	const isListeningForNextTurn = voiceRecording.isListening && voiceRecording.state === "idle"
	const micLabel = "Talk to Carl"
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={micLabel}
					disabled={isWaiting}
					onClick={isSignupRequired ? onSignup : voiceRecording.start}
					className={cn(SEND_BUTTON_CLASS, isListeningForNextTurn && "ring-primary/50 ring-2 ring-offset-2")}
				>
					{isWaiting ? <LoaderCircle className="size-4 animate-spin" /> : <Mic className="size-4" />}
				</button>
			</TooltipTrigger>
			<TooltipContent>{micLabel}</TooltipContent>
		</Tooltip>
	)
}
