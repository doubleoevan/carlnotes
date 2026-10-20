// the hosts' spoken answers: the one audio element the layout mounts, the queue of one reply's spoken parts, and the
// playing state the play buttons read. carl speaks every reply except one vienna gave to a question asked from the
// podcast player
import { addEventListeners } from "@/lib/utils"
import { pausePodcastEpisode, refreshPodcastEpisodeMediaSession } from "@/stores/podcastEpisodePlayerStore"
import {
	type SpokenAnswerEnd,
	type SpokenAnswerQueue,
	type SpokenAnswerSpeaker,
	type SpokenAnswerState,
	showSpeakerOnMediaSession,
	toNextSpokenPartAction,
} from "@/stores/spokenAnswerQueue"
import { loadSpokenPartAudio } from "@/stores/spokenAudioCache"
import { toEventListeners, toStoreListeners } from "@/stores/storeListeners"

// ten milliseconds of silence as a WAV data uri, which a tap plays so the element may play carl's later spoken parts
const SILENT_WAV_DATA_URI =
	"data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA=="

// the mounted audio element, the queue that is loading or playing, and the store's listeners
let audioElement: HTMLAudioElement | null = null
let spokenAnswer: SpokenAnswerQueue | null = null
const { publish, useStoreVersion } = toStoreListeners()

// the keys of the replies that were stopped, whose later spoken parts stay quiet until a play tap asks for them again
const stoppedSpokenAnswerKeys = new Set<string>()

// whether a composer is recording or waiting for its transcript, which an auto-played reply reads
let isRecordingActive = false

// the listeners told how a reply ended
const spokenAnswerEndListeners = toEventListeners<SpokenAnswerEnd>()

// the blob url the element plays, revoked before the next spoken part's
let spokenPartObjectUrl: string | null = null

/**
 * Returns a reply's spoken answer state and re-renders the component each time it changes.
 */
export function useSpokenAnswerState(spokenAnswerKey: string): SpokenAnswerState {
	useStoreVersion()
	return toSpokenAnswerState(spokenAnswerKey)
}

/**
 * Returns a reply's spoken answer state, for a read outside React.
 */
export function toSpokenAnswerState(spokenAnswerKey: string): SpokenAnswerState {
	return spokenAnswer?.spokenAnswerKey === spokenAnswerKey ? spokenAnswer.state : "idle"
}

/**
 * Keeps the mounted audio element, adds its playback listeners, and returns the call that removes them.
 */
export function registerSpokenAnswerAudio(mountedAudioElement: HTMLAudioElement): () => void {
	// keep the element, and add a listener for each playback event. a spoken part that failed to decode ends like one
	// that finished, so the queue moves on
	audioElement = mountedAudioElement
	const removeAudioEventListeners = addEventListeners(mountedAudioElement, [
		["playing", handleSpokenPartPlaying],
		["ended", handleSpokenPartEnded],
		["error", handleSpokenPartEnded],
	])

	// return the call that removes every listener and clears the element
	return () => {
		removeAudioEventListeners()
		audioElement = null
	}
}

/**
 * Plays a moment of silence through the element inside a tap, so the element may play carl's spoken parts later
 * after the tap's gesture has expired. A play the browser rejects leaves the reply as text with its play button.
 */
export function playSpokenAnswerSilence(): void {
	if (!audioElement) {
		return
	}
	audioElement.src = SILENT_WAV_DATA_URI
	void audioElement.play().catch(() => {})
}

/**
 * Speaks a whole reply from its start, replacing whatever was playing. Each spoken part's audio is fetched through
 * the speech route, cached for the session, and played in turn through the one element.
 */
export function speakSpokenAnswer({
	spokenAnswerKey,
	page,
	spokenParts,
	isAutoPlayed = false,
	onFirstPlaying,
	speaker = "host",
	mediaSessionMetadata,
}: Pick<SpokenAnswerQueue, "spokenAnswerKey" | "page" | "spokenParts" | "onFirstPlaying"> &
	SpokenAnswerSpeaker & {
		isAutoPlayed?: boolean
	}): void {
	stopSpokenAnswer()
	// a play tap on a stopped reply speaks it again
	stoppedSpokenAnswerKeys.delete(spokenAnswerKey)
	// a reply with nothing to speak, like a link or a code block alone, still reports once, and one played with no
	// tap ends as finished
	if (spokenParts.length === 0) {
		onFirstPlaying?.(null)
		if (isAutoPlayed) {
			spokenAnswerEndListeners.announce({ spokenAnswerKey, isPlayedToEnd: true, isAutoPlayed })
		}
		return
	}

	// the whole reply is queued at once
	startSpokenAnswer({
		spokenAnswerKey,
		page,
		speaker,
		mediaSessionMetadata,
		spokenParts,
		isComplete: true,
		isAutoPlayed,
		onFirstPlaying,
	})
}

/**
 * Appends a spoken part of a reply that is still streaming to its queue. The first spoken part starts the reply's
 * queue, and each later one plays after the spoken part before it.
 */
export function appendSpokenAnswerPart({
	spokenAnswerKey,
	page,
	text,
	onFirstPlaying,
	speaker = "host",
	mediaSessionMetadata,
}: Pick<SpokenAnswerQueue, "spokenAnswerKey" | "page" | "onFirstPlaying"> &
	SpokenAnswerSpeaker & { text: string }): void {
	// a reply stopped while it streamed stays quiet, so its later spoken parts never start it again
	if (stoppedSpokenAnswerKeys.has(spokenAnswerKey)) {
		return
	}
	// a spoken part for another reply replaces that reply's queue. a streamed reply plays with no tap
	if (spokenAnswer?.spokenAnswerKey !== spokenAnswerKey) {
		stopSpokenAnswer()
		startSpokenAnswer({
			spokenAnswerKey,
			page,
			speaker,
			mediaSessionMetadata,
			spokenParts: [],
			isComplete: false,
			isAutoPlayed: true,
			onFirstPlaying,
		})
	}

	// nothing to append without a queue or with no words
	if (!spokenAnswer || text === "") {
		return
	}

	// append the spoken part, and play it now if the queue was waiting for it, or load it while the spoken part before it
	// plays
	spokenAnswer.spokenParts.push(text)
	if (!spokenAnswer.isSpokenPartActive) {
		void playNextSpokenPart()
	} else if (spokenAnswer.state === "playing" && toNextSpokenPartAction(spokenAnswer) === "play") {
		void loadSpokenPartAudio(spokenAnswer, spokenAnswer.nextSpokenPartIndex)
	}
}

/**
 * Marks a reply's queue complete, so it finishes after the last spoken part.
 */
export function completeSpokenAnswer(spokenAnswerKey: string): void {
	// a reply that queued nothing, like a code block alone, ends as finished unless it was stopped
	if (spokenAnswer?.spokenAnswerKey !== spokenAnswerKey) {
		if (!stoppedSpokenAnswerKeys.has(spokenAnswerKey)) {
			spokenAnswerEndListeners.announce({ spokenAnswerKey, isPlayedToEnd: true, isAutoPlayed: true })
		}
		return
	}

	// a queue waiting on the stream finishes now
	spokenAnswer.isComplete = true
	if (!spokenAnswer.isSpokenPartActive) {
		void playNextSpokenPart()
	}
}

/**
 * Stops the spoken answer that is loading or playing, and shows the podcast episode on the lock screen again. A stop
 * from the lock screen or headphones says so to the end listeners.
 */
export function stopSpokenAnswer({ isMediaSessionPause = false }: { isMediaSessionPause?: boolean } = {}): void {
	if (!spokenAnswer) {
		return
	}
	// remember the stopped reply, so the spoken parts its stream still sends stay quiet
	stoppedSpokenAnswerKeys.add(spokenAnswer.spokenAnswerKey)
	audioElement?.pause()
	endSpokenAnswer({ isPlayedToEnd: false, isMediaSessionPause })
}

/**
 * Stops one reply, whether or not its queue has started, so the spoken parts its stream still sends stay quiet. Another
 * reply that is playing goes on.
 */
export function stopSpokenAnswerKey(spokenAnswerKey: string): void {
	stoppedSpokenAnswerKeys.add(spokenAnswerKey)
	if (spokenAnswer?.spokenAnswerKey === spokenAnswerKey) {
		stopSpokenAnswer()
		return
	}

	// a reply stopped before its queue started still ends, as a stop
	spokenAnswerEndListeners.announce({ spokenAnswerKey, isPlayedToEnd: false, isAutoPlayed: true })
}

/**
 * Sets whether a composer is recording or waiting for its transcript.
 */
export function setIsVoiceRecordingActive(isActive: boolean): void {
	isRecordingActive = isActive
}

/**
 * Returns whether a composer is recording or waiting for its transcript, which holds back an auto-played reply.
 */
export function isVoiceRecordingActive(): boolean {
	return isRecordingActive
}

/**
 * Calls the listener each time a reply's queue ends, played to its end or stopped, and returns the unsubscribe.
 */
export function subscribeToSpokenAnswerEnd(listener: (spokenAnswerEnd: SpokenAnswerEnd) => void): () => void {
	return spokenAnswerEndListeners.subscribe(listener)
}

// start a reply's queue, pause the podcast episode so carl never speaks over it, and play the first spoken part
function startSpokenAnswer(
	queue: Pick<
		SpokenAnswerQueue,
		| "spokenAnswerKey"
		| "page"
		| "speaker"
		| "mediaSessionMetadata"
		| "spokenParts"
		| "isComplete"
		| "isAutoPlayed"
		| "onFirstPlaying"
	>,
): void {
	spokenAnswer = { ...queue, nextSpokenPartIndex: 0, isSpokenPartActive: false, state: "loading", hasPlayed: false }
	pausePodcastEpisode()
	void playNextSpokenPart()
}

// load and play the queue's next spoken part, wait for one still streaming, or finish the queue
async function playNextSpokenPart(): Promise<void> {
	const queue = spokenAnswer
	if (!queue || !audioElement) {
		return
	}

	// nothing to play yet. the queue waits in its loading state for the next append, or finishes
	const nextSpokenPartAction = toNextSpokenPartAction(queue)
	if (nextSpokenPartAction !== "play") {
		if (nextSpokenPartAction === "finish") {
			endSpokenAnswer({ isPlayedToEnd: true })
		}
		return
	}

	// load the spoken part's audio from the cache or the speech route
	const spokenPartIndex = queue.nextSpokenPartIndex
	queue.nextSpokenPartIndex += 1
	queue.isSpokenPartActive = true
	queue.state = "loading"
	publish()
	const spokenPartAudio = await loadSpokenPartAudio(queue, spokenPartIndex)

	// the queue may have been stopped or replaced while the audio loaded
	if (spokenAnswer !== queue) {
		return
	}

	// a spent budget stops the queue and leaves the text with its play button
	if (spokenPartAudio === "budget") {
		stopSpokenAnswer()
		return
	}

	// any other spoken part the speech route did not speak is skipped, and the next one plays
	if (typeof spokenPartAudio === "string") {
		queue.isSpokenPartActive = false
		void playNextSpokenPart()
		return
	}

	// play the spoken part as a blob url
	revokeSpokenPartObjectUrl()
	spokenPartObjectUrl = URL.createObjectURL(spokenPartAudio)
	audioElement.src = spokenPartObjectUrl

	// a play the browser rejects stops its own queue, never one that replaced it
	try {
		await audioElement.play()
	} catch {
		if (spokenAnswer === queue) {
			stopSpokenAnswer()
		}
	}
}

// a spoken part started playing: show it, report the first one, name the host on the lock screen, and load the next
// one
function handleSpokenPartPlaying(): void {
	const queue = spokenAnswer
	if (!queue || !isPlayingSpokenPart()) {
		return
	}
	queue.state = "playing"
	publish()

	// the first spoken part's start is what the spoken question event measures
	if (!queue.hasPlayed) {
		queue.hasPlayed = true
		queue.onFirstPlaying?.(Date.now())
	}
	showSpeakerOnMediaSession(queue, () => stopSpokenAnswer({ isMediaSessionPause: true }))

	// load the next spoken part while this one plays, so carl pauses between spoken parts no longer than he breathes
	if (toNextSpokenPartAction(queue) === "play") {
		void loadSpokenPartAudio(queue, queue.nextSpokenPartIndex)
	}
}

// a spoken part ended: play the next one, wait for it, or finish the queue
function handleSpokenPartEnded(): void {
	if (!spokenAnswer || !isPlayingSpokenPart()) {
		return
	}
	spokenAnswer.isSpokenPartActive = false
	void playNextSpokenPart()
}

// whether the element holds a spoken part. the silence played in the tap fires the same events and is ignored
function isPlayingSpokenPart(): boolean {
	return audioElement !== null && spokenPartObjectUrl !== null && audioElement.src === spokenPartObjectUrl
}

// drop the queue, report a queue that never played, tell the end listeners, and show the podcast episode on the lock
// screen again
function endSpokenAnswer({
	isPlayedToEnd,
	isMediaSessionPause = false,
}: {
	isPlayedToEnd: boolean
	isMediaSessionPause?: boolean
}): void {
	const endedQueue = spokenAnswer
	spokenAnswer = null
	revokeSpokenPartObjectUrl()
	publish()

	// a queue that ended before any spoken part played still reports once
	if (endedQueue && !endedQueue.hasPlayed) {
		endedQueue.onFirstPlaying?.(null)
	}

	// tell the end listeners which reply ended, whether the host finished it, whether it was the conversation's own, and
	// whether the lock screen paused it
	if (endedQueue) {
		const { spokenAnswerKey, isAutoPlayed } = endedQueue
		spokenAnswerEndListeners.announce({
			spokenAnswerKey,
			isPlayedToEnd,
			isAutoPlayed,
			...(isMediaSessionPause ? { isMediaSessionPause } : {}),
		})
	}

	// an element with no source drops carl from the lock screen, and a loaded episode takes it back. the next silence
	// or spoken part sets the source again
	audioElement?.removeAttribute("src")
	audioElement?.load()
	refreshPodcastEpisodeMediaSession()
}

// free the blob url of the spoken part that played
function revokeSpokenPartObjectUrl(): void {
	if (spokenPartObjectUrl) {
		URL.revokeObjectURL(spokenPartObjectUrl)
		spokenPartObjectUrl = null
	}
}
