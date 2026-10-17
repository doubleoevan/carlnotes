// the session's spoken answer audio, by each spoken part's text: a spoken part's audio from the cache, from a fetch
// already on its way, or from the speech route, within a size the oldest spoken parts leave
import type { VoiceChatPage } from "@shared/payloads"
import type { ChatRejection } from "@/clients/chatClient"
import { fetchSpokenAnswerAudio } from "@/clients/voiceClient"

// the most audio the session's cache keeps, in bytes, before it drops its oldest spoken parts
const SPOKEN_AUDIO_CACHE_BYTES = 40_000_000

// the audio by each spoken part's text for the session, the fetches on their way, and the cached audio's total size
const spokenAudioCache = new Map<string, Blob>()
const pendingSpokenAudio = new Map<string, Promise<Blob | ChatRejection>>()
let spokenAudioCacheBytes = 0

// the page a spoken part speaks on and the spoken parts it is one of, which a queue holds
type SpokenPartSource = { page: VoiceChatPage; spokenParts: string[] }

/**
 * Returns a spoken part's audio from the session's cache, from a fetch already on its way, or from the speech route, or
 * the rejection the route gave. The text keys it, so a replay after the panel reopens reads the same entries.
 */
export function loadSpokenPartAudio(
	spokenPartSource: SpokenPartSource,
	spokenPartIndex: number,
): Promise<Blob | ChatRejection> {
	// the session's cache first
	const text = spokenPartSource.spokenParts[spokenPartIndex] ?? ""
	const cachedAudio = spokenAudioCache.get(text)
	if (cachedAudio) {
		return Promise.resolve(cachedAudio)
	}

	// then a fetch already on its way, which a prefetch may have started
	const pendingAudio = pendingSpokenAudio.get(text)
	if (pendingAudio) {
		return pendingAudio
	}

	// fetch the audio once, and cache it for the session if it came back
	const fetchedAudio = fetchSpokenAnswerAudio({ page: spokenPartSource.page, text }).then((spokenPartAudio) => {
		// drop the pending fetch, and cache the audio that came back
		pendingSpokenAudio.delete(text)
		if (typeof spokenPartAudio !== "string") {
			cacheSpokenAudio(text, spokenPartAudio)
		}
		return spokenPartAudio
	})

	// keep the fetch while it is on its way, so a prefetch and a play never spend twice on one spoken part
	pendingSpokenAudio.set(text, fetchedAudio)
	return fetchedAudio
}

// cache a spoken part's audio, and drop the oldest spoken parts while the cache is over its size. a dropped spoken part
// that is playing still plays from its blob url
function cacheSpokenAudio(text: string, spokenPartAudio: Blob): void {
	spokenAudioCache.set(text, spokenPartAudio)
	spokenAudioCacheBytes += spokenPartAudio.size

	// a map iterates in insertion order, so the oldest spoken parts go first
	for (const [oldestText, oldestAudio] of spokenAudioCache) {
		if (spokenAudioCacheBytes <= SPOKEN_AUDIO_CACHE_BYTES) {
			break
		}
		spokenAudioCache.delete(oldestText)
		spokenAudioCacheBytes -= oldestAudio.size
	}
}
