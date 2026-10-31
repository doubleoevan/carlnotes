// the player each platform supplies for the hosts' spoken answers: one spoken part's play and its events, the stop,
// and the lock screen while a host speaks
import type { SpokenPartAudio } from "@carlnotes/client/voiceClient"
import type { PodcastEpisodeMediaMetadata } from "./podcastEpisodePlayback"

// what the lock screen shows while a host speaks: the host's name alone, or the podcast episode's metadata
export type SpokenAnswerSpeakerMetadata = Pick<PodcastEpisodeMediaMetadata, "title"> &
	Partial<Omit<PodcastEpisodeMediaMetadata, "title">>

// what one spoken part's play reports: it started playing, it ended or failed to decode, so the queue moves on, or
// the system paused it, from the lock screen, headphones, a call, or another app
export type SpokenPartPlayCallbacks = {
	onPlaying: () => void
	onEnded: () => void
	onSystemPause: () => void
}

/**
 * The platform's spoken answer player: it plays one spoken part at a time, names the host on the lock screen, and
 * stops.
 */
export type SpokenAnswerPlayerAdapter = {
	// let a later play start once a tap's gesture has expired, called inside the tap
	unlock: () => void
	// play one spoken part's audio. a play the platform denies rejects
	play: (spokenPartAudio: SpokenPartAudio, callbacks: SpokenPartPlayCallbacks) => Promise<void>
	// name the host on the lock screen while the spoken part plays
	showSpeaker: (speakerMetadata: SpokenAnswerSpeakerMetadata) => void
	// stop the spoken part, release its audio, and give the lock screen back
	stop: () => void
}
