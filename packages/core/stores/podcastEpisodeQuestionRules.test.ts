// the rules of a question asked from the podcast player: what the podcast episode does once it ends, and what the
// chapter line reads
import { expect, test } from "bun:test"
import {
	type PodcastEpisodeQuestionEnding,
	type PodcastEpisodeResume,
	podcastEpisodeQuestionEndings,
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
}

// the host finishing resumes after a beat, a stop, a cancel, a failure, or nothing to say resume at once, and a pause,
// a seek, the podcast episode's own play, and the chat mic leave the podcast episode as it is
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
