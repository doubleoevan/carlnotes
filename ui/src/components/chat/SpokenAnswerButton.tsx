import type { PodcastEpisodeSpeaker } from "@shared/enums"
import type { VoiceChatPage } from "@shared/payloads"
import { toSpokenParts } from "@shared/spokenText"
import { LoaderCircle, Play, Square } from "lucide-react"
import { sendSpokenEvent } from "@/clients/voiceClient"
import { IconButton } from "@/components/common/IconButton"
import {
	playSpokenAnswerSilence,
	speakSpokenAnswer,
	stopSpokenAnswer,
	useSpokenAnswerState,
} from "@/stores/spokenAnswerStore"

/**
 * The play button in a reply's footer, which speaks the reply from its start in the voice of the host who gave it and
 * becomes stop while it plays. The tap plays silence through the audio element, so the spoken parts play after the
 * tap's gesture has expired.
 */
export function SpokenAnswerButton({
	spokenAnswerKey,
	page,
	text,
	speaker = "host",
}: {
	// the key the spoken answer store queues this reply under
	spokenAnswerKey: string
	page: VoiceChatPage
	// the reply's markdown, which is split and cleaned into what the host says
	text: string
	// the speaker who gave the reply, carl unless vienna answered a question asked from the podcast player
	speaker?: PodcastEpisodeSpeaker
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
		speakSpokenAnswer({ spokenAnswerKey, page, speaker, spokenParts: toSpokenParts(text) })
		sendSpokenEvent({ page, event: { kind: "answer_played" } })
	}

	return (
		<IconButton
			tooltip={spokenAnswerLabel}
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
		</IconButton>
	)
}
