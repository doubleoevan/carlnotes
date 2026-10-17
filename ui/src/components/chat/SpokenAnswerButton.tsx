import type { VoiceChatPage } from "@shared/payloads"
import { toSpokenParts } from "@shared/spokenText"
import { LoaderCircle, Play, Square } from "lucide-react"
import { sendSpokenEvent } from "@/clients/voiceClient"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import {
	playSpokenAnswerSilence,
	speakSpokenAnswer,
	stopSpokenAnswer,
	useSpokenAnswerState,
} from "@/stores/spokenAnswerStore"

/**
 * The play button in a carl reply's footer, which speaks the reply from its start and becomes stop while it plays.
 * The tap plays silence through the audio element, so the spoken parts play after the tap's gesture has expired.
 */
export function SpokenAnswerButton({
	spokenAnswerKey,
	page,
	text,
}: {
	// the key the spoken answer store queues this reply under
	spokenAnswerKey: string
	page: VoiceChatPage
	// the reply's markdown, which is split and cleaned into what carl says
	text: string
}) {
	const spokenAnswerState = useSpokenAnswerState(spokenAnswerKey)
	const isIdle = spokenAnswerState === "idle"
	const spokenAnswerLabel = isIdle ? "Play message" : "Stop"

	// play from the start, or stop what is loading or playing
	function handleToggle(): void {
		if (!isIdle) {
			stopSpokenAnswer()
			return
		}
		playSpokenAnswerSilence()
		speakSpokenAnswer({ spokenAnswerKey, page, spokenParts: toSpokenParts(text) })
		sendSpokenEvent({ page, event: { kind: "answer_played" } })
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={spokenAnswerLabel}
					onClick={handleToggle}
					className="hover:text-foreground grid size-6 place-items-center rounded-md"
				>
					{isIdle ? (
						<Play className="size-3.5" />
					) : spokenAnswerState === "loading" ? (
						<LoaderCircle className="size-3.5 animate-spin" />
					) : (
						<Square className="size-3 fill-current" />
					)}
				</button>
			</TooltipTrigger>
			<TooltipContent>{spokenAnswerLabel}</TooltipContent>
		</Tooltip>
	)
}
