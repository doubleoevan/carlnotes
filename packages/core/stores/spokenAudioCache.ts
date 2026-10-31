// the session's spoken answer audio, by each spoken part's voice and text: a spoken part's audio from the cache, from a
// fetch already on its way, or from the speech route, within a size the least recently played spoken parts leave

import type { ChatRejection } from "@carlnotes/client/chatClient"
import { fetchSpokenAnswerAudio, type SpokenPartAudio } from "@carlnotes/client/voiceClient"
import type { PodcastEpisodeSpeaker } from "@carlnotes/contracts/enums"
import type { VoiceChatPage } from "@carlnotes/contracts/payloads"

// the most audio the session's cache keeps by default, in bytes, before it drops its least recently played spoken
// parts. the browser keeps a Blob's bytes outside the page's memory
const DEFAULT_SPOKEN_AUDIO_CACHE_BYTES = 40_000_000
let spokenAudioCacheMaxBytes = DEFAULT_SPOKEN_AUDIO_CACHE_BYTES

// the audio by each spoken part's voice and text for the session, the fetches on their way, and the cached audio's
// total size
const spokenAudioCache = new Map<string, SpokenPartAudio>()
const pendingSpokenAudio = new Map<string, Promise<SpokenPartAudio | ChatRejection>>()
let spokenAudioCacheBytes = 0

// a count of the clears, so a fetch that returns after a sign-out never refills the cache
let spokenAudioCacheClearCount = 0

// the page a spoken part speaks on, the speaker whose voice speaks it, and the spoken parts it is one of, which a queue
// holds
type SpokenPartSource = { page: VoiceChatPage; speaker: PodcastEpisodeSpeaker; spokenParts: string[] }

/**
 * Sets the most audio the session's cache keeps, in bytes. A platform that holds the bytes in its own memory keeps
 * less.
 */
export function configureSpokenAudioCache({ maxBytes }: { maxBytes: number }): void {
	spokenAudioCacheMaxBytes = maxBytes
}

/**
 * Returns a spoken part's audio from the session's cache, from a fetch already on its way, or from the speech route, or
 * the rejection the route gave. The voice and the text key it, so a replay after the panel reopens reads the same
 * entries, and the same words in another host's voice are their own entry.
 */
export function loadSpokenPartAudio(
	spokenPartSource: SpokenPartSource,
	spokenPartIndex: number,
): Promise<SpokenPartAudio | ChatRejection> {
	// the session's cache first
	const { page, speaker } = spokenPartSource
	const text = spokenPartSource.spokenParts[spokenPartIndex] ?? ""
	const spokenAudioKey = toSpokenAudioKey(speaker, text)
	const cachedAudio = spokenAudioCache.get(spokenAudioKey)
	if (cachedAudio) {
		// insert it again, so it is the last to be dropped
		spokenAudioCache.delete(spokenAudioKey)
		spokenAudioCache.set(spokenAudioKey, cachedAudio)
		return Promise.resolve(cachedAudio)
	}

	// then a fetch already on its way, which a prefetch may have started
	const pendingAudio = pendingSpokenAudio.get(spokenAudioKey)
	if (pendingAudio) {
		return pendingAudio
	}

	// fetch the audio once, and cache it for the session if it came back before a clear
	const clearCount = spokenAudioCacheClearCount
	const fetchedAudio = fetchSpokenAnswerAudio({ page, text, speaker }).then((spokenPartAudio) => {
		if (clearCount !== spokenAudioCacheClearCount) {
			return spokenPartAudio
		}

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

/**
 * Drops every spoken part's audio the session cached, and forgets the fetches on their way, so a sign-out leaves no
 * spoken audio in memory.
 */
export function clearSpokenAudioCache(): void {
	spokenAudioCacheClearCount += 1
	spokenAudioCache.clear()
	pendingSpokenAudio.clear()
	spokenAudioCacheBytes = 0
}

// a spoken part's size in bytes, a Blob's or the native bytes'
function toSpokenPartByteLength(spokenPartAudio: SpokenPartAudio): number {
	return "size" in spokenPartAudio ? spokenPartAudio.size : spokenPartAudio.bytes.byteLength
}

// cache a spoken part's audio, and drop the least recently played spoken parts while the cache is over its size. a
// dropped spoken part that is playing still plays from the audio its player holds
function cacheSpokenAudio(spokenAudioKey: string, spokenPartAudio: SpokenPartAudio): void {
	spokenAudioCache.set(spokenAudioKey, spokenPartAudio)
	spokenAudioCacheBytes += toSpokenPartByteLength(spokenPartAudio)

	// a map iterates in insertion order, and a replay inserts again, so the least recently played go first
	for (const [oldestSpokenAudioKey, oldestAudio] of spokenAudioCache) {
		if (spokenAudioCacheBytes <= spokenAudioCacheMaxBytes) {
			break
		}
		spokenAudioCache.delete(oldestSpokenAudioKey)
		spokenAudioCacheBytes -= toSpokenPartByteLength(oldestAudio)
	}
}
