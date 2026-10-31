// the rules of a question asked from the podcast player: what the podcast episode does once it ends, what the
// chapter line reads, and what a podcast mic slot shows
import { expect, test } from "bun:test"
import {
	type PodcastEpisodeQuestionEnding,
	type PodcastEpisodeResume,
	podcastEpisodeQuestionEndings,
	toPodcastEpisodeQuestionButtonState,
	toPodcastEpisodeQuestionLabel,
	toPodcastEpisodeResume,
} from "./podcastEpisodeQuestionRules"

// what each ending does to a podcast episode that was playing at the tap
const RESUME_BY_ENDING: Record<PodcastEpisodeQuestionEnding, PodcastEpisodeResume> = {
	finished: "resumeAfterBeat",
	stopped: "resumeNow",
	failed: "resumeNow",
	unspoken: "resumeNow",
	paused: "unchanged",
	skipped: "unchanged",
	played: "unchanged",
	chatMic: "unchanged",
	signedOut: "unchanged",
}

// the host finishing resumes after a beat, a stop, a cancel, a failure, or nothing to say resume at once, and a pause,
// a seek, the podcast episode's own play, the chat mic, and a sign-out leave the podcast episode as it is
test("toPodcastEpisodeResume resumes a podcast episode that was playing by how the question ended", () => {
	for (const questionEnding of podcastEpisodeQuestionEndings) {
		expect(toPodcastEpisodeResume({ questionEnding, isPlayingAtTap: true })).toBe(RESUME_BY_ENDING[questionEnding])
	}
})

// a podcast episode that was paused when the mic was tapped stays paused, however the question ended
test("toPodcastEpisodeResume leaves a podcast episode that was paused at the tap", () => {
	for (const questionEnding of podcastEpisodeQuestionEndings) {
		expect(toPodcastEpisodeResume({ questionEnding, isPlayingAtTap: false })).toBe("unchanged")
	}
})

// the chapter line reads the recording, the wait, then the host who answers by name
test("toPodcastEpisodeQuestionLabel names each phase and the answering host", () => {
	expect(toPodcastEpisodeQuestionLabel({ phase: "idle", speaker: null })).toBeNull()
	expect(toPodcastEpisodeQuestionLabel({ phase: "listening", speaker: null })).toBe("Listening")
	expect(toPodcastEpisodeQuestionLabel({ phase: "thinking", speaker: "cohost" })).toBe("Thinking")
	expect(toPodcastEpisodeQuestionLabel({ phase: "answering", speaker: "host" })).toBe("Carl's answering")
	expect(toPodcastEpisodeQuestionLabel({ phase: "answering", speaker: "cohost" })).toBe("Vienna's answering")
})

// a podcast mic slot sends while any mic records, spins while the question waits, and is off while a host answers
test("toPodcastEpisodeQuestionButtonState sends while any mic records, spins while waiting, and is off for the answer", () => {
	// no question, the mic
	expect(
		toPodcastEpisodeQuestionButtonState({ voiceRecordingState: "idle", phase: "idle", isVoiceRecording: false }),
	).toBe("mic")

	// this mic or another recording sends early
	expect(
		toPodcastEpisodeQuestionButtonState({
			voiceRecordingState: "recording",
			phase: "listening",
			isVoiceRecording: false,
		}),
	).toBe("send")
	expect(
		toPodcastEpisodeQuestionButtonState({ voiceRecordingState: "idle", phase: "listening", isVoiceRecording: true }),
	).toBe("send")

	// the microphone request and the wait for the answer spin
	expect(
		toPodcastEpisodeQuestionButtonState({
			voiceRecordingState: "requesting",
			phase: "listening",
			isVoiceRecording: false,
		}),
	).toBe("waiting")
	expect(
		toPodcastEpisodeQuestionButtonState({ voiceRecordingState: "idle", phase: "thinking", isVoiceRecording: false }),
	).toBe("waiting")

	// the answer turns the mic off
	expect(
		toPodcastEpisodeQuestionButtonState({ voiceRecordingState: "idle", phase: "answering", isVoiceRecording: false }),
	).toBe("disabled")
})
