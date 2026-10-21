// the rules of a question asked from the podcast player: its phases and endings, whether the podcast episode resumes
// once it ends, and what the player's chapter line reads
import type { PodcastEpisodeSpeaker } from "@carlnotes/contracts/enums"
import { PODCAST_EPISODE_SPEAKER_NAMES } from "@carlnotes/contracts/podcastEpisodes"

// where a question is: none, recording or transcribing, waiting for the answer, or a host answering out loud
export type PodcastEpisodeQuestionPhase = "idle" | "listening" | "thinking" | "answering"

// how a question ended: the host finished, a stop or a cancel, a failed or rejected question, an answer with nothing to
// speak, a lock-screen pause, a seek or a chapter skip, the podcast episode played, or the chat mic tapped
export const podcastEpisodeQuestionEndings = [
	"finished",
	"stopped",
	"failed",
	"unspoken",
	"paused",
	"skipped",
	"played",
	"chatMic",
] as const
export type PodcastEpisodeQuestionEnding = (typeof podcastEpisodeQuestionEndings)[number]

// the endings that resume the podcast episode at once
const RESUME_NOW_ENDINGS: PodcastEpisodeQuestionEnding[] = ["stopped", "failed", "unspoken"]

// what the podcast episode does once a question ends: resume after a beat, resume at once, or stay as it is
export type PodcastEpisodeResume = "resumeAfterBeat" | "resumeNow" | "unchanged"

// the breath between the host's last word and the podcast episode's next one
export const RESUME_BEAT_MS = 600

// what the player shows of the question in progress
export type PodcastEpisodeQuestionView = { phase: PodcastEpisodeQuestionPhase; speaker: PodcastEpisodeSpeaker | null }

/**
 * Returns what the podcast episode does once a question ends. The host finishing resumes after a beat, and a stop, a
 * cancel, a failure, or an answer with nothing to speak resumes at once. A lock-screen pause, a seek, a chapter skip,
 * and the chat mic leave the podcast episode paused, and a podcast episode that played on its own or was paused at the
 * tap is left as it is.
 */
export function toPodcastEpisodeResume({
	questionEnding,
	isPlayingAtTap,
}: {
	questionEnding: PodcastEpisodeQuestionEnding
	isPlayingAtTap: boolean
}): PodcastEpisodeResume {
	// a podcast episode paused at the tap stays paused
	if (!isPlayingAtTap) {
		return "unchanged"
	}

	// the host finishing takes a breath first, and a stop, a failure, or nothing to say resume at once
	if (questionEnding === "finished") {
		return "resumeAfterBeat"
	}
	return RESUME_NOW_ENDINGS.includes(questionEnding) ? "resumeNow" : "unchanged"
}

/**
 * Returns what the player's chapter line reads for a question's phase, or null with no question in progress.
 */
export function toPodcastEpisodeQuestionLabel({ phase, speaker }: PodcastEpisodeQuestionView): string | null {
	// no question, no label
	if (phase === "idle") {
		return null
	}

	// the recording, the wait, then the host by name
	if (phase === "listening") {
		return "Listening"
	}
	return phase === "thinking" ? "Thinking" : `${PODCAST_EPISODE_SPEAKER_NAMES[speaker ?? "host"]}'s answering`
}
