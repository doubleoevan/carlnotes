// the hosts' spoken answers: the player the platform registers, the queue of one reply's spoken parts, and the
// playing state the play buttons read. carl speaks every reply except one vienna gave to a question asked from the
// podcast player

import { useSyncExternalStore } from "react"
import type { SpokenAnswerPlayerAdapter } from "../lib/spokenAnswerPlayer"
import { pausePodcastEpisode, refreshPodcastEpisodeMediaSession } from "./podcastEpisodePlayerStore"
import {
	type SpokenAnswerEnd,
	type SpokenAnswerQueue,
	type SpokenAnswerSpeaker,
	type SpokenAnswerState,
	toNextSpokenPartAction,
	toSpokenAnswerSpeakerMetadata,
} from "./spokenAnswerQueue"
import { clearSpokenAudioCache, loadSpokenPartAudio } from "./spokenAudioCache"
import { toEventListeners, toStoreListeners } from "./storeListeners"

// the registered player, the queue that is loading or playing, and the store's listeners
let spokenAnswerPlayer: SpokenAnswerPlayerAdapter | null = null
let spokenAnswer: SpokenAnswerQueue | null = null
const { publish, subscribe } = toStoreListeners()

// the keys of the replies that were stopped, whose later spoken parts stay quiet until a play tap asks for them again
const stoppedSpokenAnswerKeys = new Set<string>()

// whether a composer is recording or waiting for its transcript, which an auto-played reply reads
let isRecordingActive = false

// the listeners told how a reply ended
const spokenAnswerEndListeners = toEventListeners<SpokenAnswerEnd>()

// a count of the spoken parts asked to play, so a player's report from an earlier spoken part is ignored
let spokenPartPlayCount = 0

/**
 * Returns a reply's spoken answer state and re-renders the component only when that reply's state changes.
 */
export function useSpokenAnswerState(spokenAnswerKey: string): SpokenAnswerState {
	// the state's string is the snapshot, so a publish about another reply leaves this component as it is
	const getSpokenAnswerState = (): SpokenAnswerState => toSpokenAnswerState(spokenAnswerKey)
	return useSyncExternalStore(subscribe, getSpokenAnswerState, getSpokenAnswerState)
}

/**
 * Returns a reply's spoken answer state, for a read outside React.
 */
export function toSpokenAnswerState(spokenAnswerKey: string): SpokenAnswerState {
	return spokenAnswer?.spokenAnswerKey === spokenAnswerKey ? spokenAnswer.state : "idle"
}

/**
 * Registers the platform's spoken answer player, and returns the call that stops what it plays and removes it.
 */
export function registerSpokenAnswerPlayer(player: SpokenAnswerPlayerAdapter): () => void {
	spokenAnswerPlayer = player

	// return the call that stops the answer and removes this player, unless a newer player replaced it
	return () => {
		if (spokenAnswerPlayer === player) {
			stopSpokenAnswer()
			spokenAnswerPlayer = null
		}
	}
}

/**
 * Lets the player play carl's spoken parts later, after the tap's gesture has expired, called inside a tap. A play
 * the platform rejects later leaves the reply as text with its play button.
 */
export function unlockSpokenAnswer(): void {
	spokenAnswerPlayer?.unlock()
}

/**
 * Stops any spoken answer and drops the session's spoken audio from memory, for a sign-out or an account switch.
 */
export function clearSpokenAnswers(): void {
	stopSpokenAnswer()
	stoppedSpokenAnswerKeys.clear()
	clearSpokenAudioCache()
}

/**
 * Speaks a whole reply from its start, replacing whatever was playing. Each spoken part's audio is fetched through
 * the speech route, cached for the session, and played in turn through the registered player.
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
	if (!queue || !spokenAnswerPlayer) {
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

	// the queue may have been stopped or replaced, or the player removed, while the audio loaded
	const player = spokenAnswerPlayer
	if (spokenAnswer !== queue || !player) {
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

	// play the spoken part. its reports count only while it is the queue's latest spoken part
	spokenPartPlayCount += 1
	const playCount = spokenPartPlayCount
	const isCurrentSpokenPart = (): boolean => spokenAnswer === queue && playCount === spokenPartPlayCount
	try {
		await player.play(spokenPartAudio, {
			onPlaying: () => isCurrentSpokenPart() && handleSpokenPartPlaying(queue),
			onEnded: () => isCurrentSpokenPart() && handleSpokenPartEnded(queue),
			onSystemPause: () => isCurrentSpokenPart() && stopSpokenAnswer({ isMediaSessionPause: true }),
		})
	} catch {
		// a play the platform rejects stops its own queue, never one that replaced it
		if (spokenAnswer === queue) {
			stopSpokenAnswer()
		}
	}
}

// a spoken part started playing: show it, report the first one, name the host on the lock screen, and load the next
// one
function handleSpokenPartPlaying(queue: SpokenAnswerQueue): void {
	queue.state = "playing"
	publish()

	// the first spoken part's start is what the spoken question event measures
	if (!queue.hasPlayed) {
		queue.hasPlayed = true
		queue.onFirstPlaying?.(Date.now())
	}
	spokenAnswerPlayer?.showSpeaker(toSpokenAnswerSpeakerMetadata(queue))

	// load the next spoken part while this one plays, so carl pauses between spoken parts no longer than he breathes
	if (toNextSpokenPartAction(queue) === "play") {
		void loadSpokenPartAudio(queue, queue.nextSpokenPartIndex)
	}
}

// a spoken part ended: play the next one, wait for it, or finish the queue
function handleSpokenPartEnded(queue: SpokenAnswerQueue): void {
	queue.isSpokenPartActive = false
	void playNextSpokenPart()
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
	// drop the queue and stop the player first, so a listener that reopens the mic finds nothing playing
	const endedQueue = spokenAnswer
	spokenAnswer = null
	spokenPartPlayCount += 1
	spokenAnswerPlayer?.stop()
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

	// the stopped player dropped carl from the lock screen, and a loaded podcast episode takes it back
	refreshPodcastEpisodeMediaSession()
}
