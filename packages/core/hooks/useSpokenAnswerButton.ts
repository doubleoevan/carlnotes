// the play button in a reply's footer, for both apps: its state, its label, and its tap
import { sendSpokenEvent } from "@carlnotes/client/voiceClient"
import type { PodcastEpisodeSpeaker } from "@carlnotes/contracts/enums"
import type { VoiceChatPage } from "@carlnotes/contracts/payloads"
import { toSpokenParts } from "@carlnotes/contracts/spokenText"
import type { SpokenAnswerState } from "../stores/spokenAnswerQueue"
import {
	speakSpokenAnswer,
	stopSpokenAnswer,
	unlockSpokenAnswer,
	useSpokenAnswerState,
} from "../stores/spokenAnswerStore"

// the reply a play button speaks: its key in the spoken answer store, its page, its markdown, and its host
export type SpokenAnswerButtonOptions = {
	spokenAnswerKey: string
	page: VoiceChatPage
	// the reply's markdown, which is split and cleaned into what the host says
	text: string
	// the speaker who gave the reply, carl unless vienna answered a question asked from the podcast player
	speaker?: PodcastEpisodeSpeaker
}

/**
 * Returns the play button's label: Play message while the reply is idle, and Stop while it loads or plays.
 */
export function toSpokenAnswerButtonLabel(spokenAnswerState: SpokenAnswerState): string {
	return spokenAnswerState === "idle" ? "Play message" : "Stop"
}

/**
 * Returns a reply's spoken answer state and the play button's tap, which speaks the reply from its start in the voice
 * of the host who gave it, or stops the reply that is loading or playing. The tap unlocks the player, so the spoken
 * parts play after the tap's gesture has expired.
 */
export function useSpokenAnswerButton({ spokenAnswerKey, page, text, speaker = "host" }: SpokenAnswerButtonOptions): {
	spokenAnswerState: SpokenAnswerState
	toggleSpokenAnswer: () => void
} {
	const spokenAnswerState = useSpokenAnswerState(spokenAnswerKey)

	// play from the start, or stop what is loading or playing
	function toggleSpokenAnswer(): void {
		if (spokenAnswerState !== "idle") {
			stopSpokenAnswer()
			return
		}

		// play from the start
		unlockSpokenAnswer()
		speakSpokenAnswer({ spokenAnswerKey, page, speaker, spokenParts: toSpokenParts(text) })
		sendSpokenEvent({ page, event: { kind: "answer_played" } })
	}
	return { spokenAnswerState, toggleSpokenAnswer }
}
