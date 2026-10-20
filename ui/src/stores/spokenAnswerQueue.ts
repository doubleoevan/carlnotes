// one reply's spoken answer queue: its shape, how it ends, what it does next, and how the lock screen names the host
// who speaks it

import type { PodcastEpisodeSpeaker } from "@shared/enums"
import type { VoiceChatPage } from "@shared/payloads"
import { PODCAST_EPISODE_SPEAKER_NAMES } from "@shared/podcastEpisodes"
import { isMediaSessionAvailable } from "@/lib/podcastEpisodePlayback"

// what a play button shows for a reply: nothing playing, a spoken part loading, or a spoken part playing
export type SpokenAnswerState = "idle" | "loading" | "playing"

// the queue of one reply's spoken parts, keyed by the reply it speaks
export type SpokenAnswerQueue = {
	spokenAnswerKey: string
	page: VoiceChatPage
	// the speaker whose voice speaks the reply, and what the lock screen shows while they speak, the speaker's name
	// alone if nothing is given
	speaker: PodcastEpisodeSpeaker
	mediaSessionMetadata?: MediaMetadataInit
	// the spoken text of every spoken part appended so far
	spokenParts: string[]
	nextSpokenPartIndex: number
	// whether every spoken part is appended, so the queue finishes after the last one instead of waiting for more
	isComplete: boolean
	// whether a spoken part is loading or playing, which a later append waits on
	isSpokenPartActive: boolean
	state: "loading" | "playing"
	// whether the queue is the conversation's own reply, played with no tap
	isAutoPlayed: boolean
	// whether a spoken part has started playing, which the end of the queue reads for the callback
	hasPlayed: boolean
	// called once, with when the first spoken part started playing, or with null if the queue ended before one did
	onFirstPlaying?: (playingAt: number | null) => void
}

// how a reply ended: the reply's key, whether it played to its end instead of being stopped, whether it was the
// conversation's own reply, played with no tap, and whether the lock screen or headphones paused it
export type SpokenAnswerEnd = {
	spokenAnswerKey: string
	isPlayedToEnd: boolean
	isAutoPlayed: boolean
	isMediaSessionPause?: boolean
}

// the speaker and the lock screen a queue may name, carl and his name alone if it names neither
export type SpokenAnswerSpeaker = Partial<Pick<SpokenAnswerQueue, "speaker" | "mediaSessionMetadata">>

/**
 * Returns what the queue does next: play its next spoken part, wait for a spoken part still streaming, or finish.
 */
export function toNextSpokenPartAction(
	queue: Pick<SpokenAnswerQueue, "spokenParts" | "nextSpokenPartIndex" | "isComplete">,
): "play" | "wait" | "finish" {
	if (queue.nextSpokenPartIndex < queue.spokenParts.length) {
		return "play"
	}
	return queue.isComplete ? "finish" : "wait"
}

/**
 * Returns the spoken answer key of a chat room message, which the room's bubbles and its stream handler share.
 */
export function toChatRoomSpokenAnswerKey(chatMessageId: number): string {
	return `room-message-${chatMessageId}`
}

/**
 * Names the host on the lock screen while they speak, with its play and pause controls stopping them.
 */
export function showSpeakerOnMediaSession(
	{ speaker, mediaSessionMetadata }: Pick<SpokenAnswerQueue, "speaker" | "mediaSessionMetadata">,
	onMediaSessionPause: () => void,
): void {
	if (!isMediaSessionAvailable()) {
		return
	}

	// the host's name or the given metadata, and the controls that stop the host
	navigator.mediaSession.metadata = new MediaMetadata(
		mediaSessionMetadata ?? { title: PODCAST_EPISODE_SPEAKER_NAMES[speaker] },
	)
	navigator.mediaSession.setActionHandler("play", onMediaSessionPause)
	navigator.mediaSession.setActionHandler("pause", onMediaSessionPause)
}
