// the rules of a question asked from the podcast player: its phases and endings, whether the podcast episode resumes
// once it ends, what the player's chapter line reads, and what a podcast mic slot shows
import type { PodcastEpisodeSpeaker } from "@carlnotes/contracts/enums"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { PODCAST_EPISODE_SPEAKER_NAMES } from "@carlnotes/contracts/podcastEpisodes"
import type { VoiceRecordingState } from "../lib/voiceRecordingRules"

// the podcast mic's accessible name and tooltip
export const PODCAST_EPISODE_QUESTION_BUTTON_LABEL = "Talk with Carl and Vienna"

// where a question is: none, recording or transcribing, waiting for the answer, or a host answering out loud
export type PodcastEpisodeQuestionPhase = "idle" | "listening" | "thinking" | "answering"

// how a question ended: the host finished, a stop or a cancel, a failed or rejected question, an answer with nothing to
// speak, a lock-screen pause, a seek or a chapter skip, the podcast episode played, the chat mic tapped, or a sign-out
export const podcastEpisodeQuestionEndings = [
	"finished",
	"stopped",
	"failed",
	"unspoken",
	"paused",
	"skipped",
	"played",
	"chatMic",
	"signedOut",
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

/**
 * Returns whether the podcast episode shows the mic that asks carl and vienna: voice is on and the podcast episode has
 * a topic.
 */
export function isPodcastEpisodeQuestionButtonShown(podcastEpisode: PodcastEpisode): boolean {
	return podcastEpisode.isVoiceChatConfigured && podcastEpisode.topicId !== ""
}

// what a podcast mic slot shows: Send while the question records, a spinner while it waits, the mic turned off while
// an answer plays, or the mic
export type PodcastEpisodeQuestionButtonState = "send" | "waiting" | "disabled" | "mic"

/**
 * Returns the label of the stop that takes the skip buttons' place: Cancel while the question listens, then Stop.
 */
export function toPodcastEpisodeQuestionStopLabel(phase: PodcastEpisodeQuestionPhase): string {
	return phase === "listening" ? "Cancel" : "Stop"
}

/**
 * Returns what a podcast mic slot shows. A recording from this mic or another sends early from every slot, and the
 * microphone request, the transcript, and the wait for the answer show a spinner in every slot.
 */
export function toPodcastEpisodeQuestionButtonState({
	voiceRecordingState,
	phase,
	isVoiceRecording,
}: {
	voiceRecordingState: VoiceRecordingState
	phase: PodcastEpisodeQuestionPhase
	isVoiceRecording: boolean
}): PodcastEpisodeQuestionButtonState {
	// a running recording sends early
	if (voiceRecordingState === "recording" || isVoiceRecording) {
		return "send"
	}

	// a spinner while the question waits, and the mic off while a host answers
	if (voiceRecordingState !== "idle" || phase === "listening" || phase === "thinking") {
		return "waiting"
	}
	return phase === "idle" ? "mic" : "disabled"
}
