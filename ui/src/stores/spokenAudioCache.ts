// the session's spoken answer audio, by each spoken part's voice and text: a spoken part's audio from the cache, from a
// fetch already on its way, or from the speech route, within a size the oldest spoken parts leave

import type { PodcastEpisodeSpeaker } from "@shared/enums"
import type { VoiceChatPage } from "@shared/payloads"
import type { ChatRejection } from "@/clients/chatClient"
import { fetchSpokenAnswerAudio } from "@/clients/voiceClient"

// the most audio the session's cache keeps, in bytes, before it drops its oldest spoken parts
const SPOKEN_AUDIO_CACHE_BYTES = 40_000_000

// the audio by each spoken part's voice and text for the session, the fetches on their way, and the cached audio's
// total size
const spokenAudioCache = new Map<string, Blob>()
const pendingSpokenAudio = new Map<string, Promise<Blob | ChatRejection>>()
let spokenAudioCacheBytes = 0

// the page a spoken part speaks on, the speaker whose voice speaks it, and the spoken parts it is one of, which a queue
// holds
type SpokenPartSource = { page: VoiceChatPage; speaker: PodcastEpisodeSpeaker; spokenParts: string[] }

/**
 * Returns a spoken part's audio from the session's cache, from a fetch already on its way, or from the speech route, or
 * the rejection the route gave. The voice and the text key it, so a replay after the panel reopens reads the same
 * entries, and the same words in another host's voice are their own entry.
 */
export function loadSpokenPartAudio(
	spokenPartSource: SpokenPartSource,
	spokenPartIndex: number,
): Promise<Blob | ChatRejection> {
	// the session's cache first
	const { page, speaker } = spokenPartSource
	const text = spokenPartSource.spokenParts[spokenPartIndex] ?? ""
	const spokenAudioKey = toSpokenAudioKey(speaker, text)
	const cachedAudio = spokenAudioCache.get(spokenAudioKey)
	if (cachedAudio) {
		return Promise.resolve(cachedAudio)
	}

	// then a fetch already on its way, which a prefetch may have started
	const pendingAudio = pendingSpokenAudio.get(spokenAudioKey)
	if (pendingAudio) {
		return pendingAudio
	}

	// fetch the audio once, and cache it for the session if it came back
	const fetchedAudio = fetchSpokenAnswerAudio({ page, text, speaker }).then((spokenPartAudio) => {
		// drop the pending fetch, and cache the audio that came back
		pendingSpokenAudio.delete(spokenAudioKey)
		if (typeof spokenPartAudio !== "string") {
			cacheSpokenAudio(spokenAudioKey, spokenPartAudio)
		}
		return spokenPartAudio
	})

	// keep the fetch while it is on its way, so a prefetch and a play never spend twice on one spoken part
	pendingSpokenAudio.set(spokenAudioKey, fetchedAudio)
	return fetchedAudio
}

// the cache key of a spoken part's audio: its speaker's voice and its text
function toSpokenAudioKey(speaker: PodcastEpisodeSpeaker, text: string): string {
	return `${speaker}\n${text}`
}

// cache a spoken part's audio, and drop the oldest spoken parts while the cache is over its size. a dropped spoken part
// that is playing still plays from its blob url
function cacheSpokenAudio(spokenAudioKey: string, spokenPartAudio: Blob): void {
	spokenAudioCache.set(spokenAudioKey, spokenPartAudio)
	spokenAudioCacheBytes += spokenPartAudio.size

	// a map iterates in insertion order, so the oldest spoken parts go first
	for (const [oldestSpokenAudioKey, oldestAudio] of spokenAudioCache) {
		if (spokenAudioCacheBytes <= SPOKEN_AUDIO_CACHE_BYTES) {
			break
		}
		spokenAudioCache.delete(oldestSpokenAudioKey)
		spokenAudioCacheBytes -= oldestAudio.size
	}
}
