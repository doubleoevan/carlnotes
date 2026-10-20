// the podcast episode player's state, which outlives the page that started playback
import type { PodcastEpisode, PodcastEpisodeChapter } from "@shared/contracts/podcast"
import { fetchNextUnplayedPodcastEpisode } from "@/clients/podcastEpisodeClient"
import {
	SKIP_BACK_SECONDS,
	SKIP_FORWARD_SECONDS,
	toChapterIndexAt,
	toNextPlaybackRate,
	updatePodcastEpisodeMediaSession,
} from "@/lib/podcastEpisodePlayback"
import { addEventListeners } from "@/lib/utils"
import { captureEpisodeVisitEvent } from "@/lib/visitAnalytics"
import {
	isPodcastEpisodeListenDue,
	isUserSignedIn,
	resetPodcastEpisodePlaybackStart,
	type SavePodcastEpisodeListenOptions,
	savePodcastEpisodeListen,
} from "@/stores/podcastEpisodeListenStore"
import { endPodcastEpisodeQuestion } from "@/stores/podcastEpisodeQuestionStore"
import { stopSpokenAnswer } from "@/stores/spokenAnswerStore"
import { toStoreListeners } from "@/stores/storeListeners"

// the shortest time between two reloads of the audio after a failed load
const AUDIO_RELOAD_INTERVAL_MS = 10_000

// the loaded podcast episode, whether the episode is playing, the playback position, and the playback rate
type PodcastEpisodePlayerState = {
	podcastEpisode: PodcastEpisode | null
	isPlaying: boolean
	positionSeconds: number
	playbackRate: number
}

// the player's state, the mounted audio element, and the store's listeners
let playerState: PodcastEpisodePlayerState = {
	podcastEpisode: null,
	isPlaying: false,
	positionSeconds: 0,
	playbackRate: 1,
}
let audioElement: HTMLAudioElement | null = null
const { publish, useStoreVersion } = toStoreListeners()

// the position has its own store listeners. the position changes several times a second
const { publish: publishPosition, useStoreVersion: usePositionVersion } = toStoreListeners()

// when the audio was last reloaded after a failed load
let lastAudioReloadAt = 0

// the audio element's owner sets whether the user is signed in, which the listen store keeps
export { setIsUserSignedIn } from "@/stores/podcastEpisodeListenStore"

/**
 * Returns the player's state without the position and re-renders the component each time the state changes.
 */
export function usePodcastEpisodePlayer(): Omit<PodcastEpisodePlayerState, "positionSeconds"> {
	useStoreVersion()
	return playerState
}

/**
 * Returns the playback position in seconds and re-renders the component each time the position or the state changes.
 */
export function usePlayerPositionSeconds(): number {
	usePositionVersion()
	return playerState.positionSeconds
}

/**
 * Returns the loaded podcast episode's chapter at the playback position, or undefined if there is none.
 */
export function usePlayerChapter(): PodcastEpisodeChapter | undefined {
	useStoreVersion()
	return toPlayerChapter()
}

/**
 * Returns the position of the chapter that the player is at if this podcast episode is the loaded one, or undefined
 * otherwise, and re-renders the component each time the state changes.
 */
export function usePlayerChapterPosition(podcastEpisodeId: string): number | undefined {
	useStoreVersion()
	return toPlayerChapterPosition(podcastEpisodeId)
}

/**
 * Returns the loaded podcast episode, or null with none loaded.
 */
export function toLoadedPodcastEpisode(): PodcastEpisode | null {
	return playerState.podcastEpisode
}

// the loaded podcast episode's chapter at the playback position, or undefined if there is none
function toPlayerChapter(): PodcastEpisodeChapter | undefined {
	const chapters = playerState.podcastEpisode?.chapters ?? []
	return chapters[toChapterIndexAt(chapters, playerState.positionSeconds)]
}

/**
 * Returns the position of the chapter that the player is at if this podcast episode is the loaded one, or undefined
 * otherwise.
 */
export function toPlayerChapterPosition(podcastEpisodeId: string): number | undefined {
	return playerState.podcastEpisode?.id === podcastEpisodeId ? toPlayerChapter()?.position : undefined
}

/**
 * Returns the loaded podcast episode, its chapter at the playback position, and whether it is playing, or null with no
 * podcast episode loaded.
 */
export function toPodcastEpisodeQuestionStart(): {
	podcastEpisode: PodcastEpisode
	chapterPosition: number
	isPlaying: boolean
} | null {
	// the loaded podcast episode, and the chapter the chapter line names
	const { podcastEpisode, isPlaying } = playerState
	const playerChapter = toPlayerChapter()
	return podcastEpisode && playerChapter ? { podcastEpisode, chapterPosition: playerChapter.position, isPlaying } : null
}

/**
 * Plays the loaded podcast episode from where it paused. A play the browser rejects leaves the player showing play.
 */
export function resumePodcastEpisode(): void {
	if (audioElement && playerState.podcastEpisode) {
		void audioElement.play().catch(() => {})
	}
}

/**
 * Returns whether the podcast player shows. The podcast player shows while a podcast episode is loaded.
 */
export function useIsPodcastPlayerShown(): boolean {
	useStoreVersion()
	return playerState.podcastEpisode !== null
}

/**
 * Returns whether the podcast episode with this id is loaded and playing.
 */
export function useIsPodcastEpisodePlaying(podcastEpisodeId: string | undefined): boolean {
	useStoreVersion()
	return playerState.isPlaying && podcastEpisodeId !== undefined && playerState.podcastEpisode?.id === podcastEpisodeId
}

/**
 * Keeps the mounted audio element, adds the audio and page listeners, and returns the call that removes the listeners.
 */
export function registerPodcastEpisodeAudio(mountedAudioElement: HTMLAudioElement): () => void {
	// keep the element, and add a listener for each playback event
	audioElement = mountedAudioElement
	const removeAudioEventListeners = addEventListeners(mountedAudioElement, [
		["timeupdate", handleTimeUpdate],
		["play", () => handlePlaybackChange(true)],
		["pause", () => handlePlaybackChange(false)],
		["ended", handleEnded],
		["error", reloadAudio],
	])

	// save the user's progress when the page is hidden
	const handleVisibilityChange = (): void => {
		if (document.visibilityState === "hidden") {
			saveListen()
		}
	}

	// save the user's progress when the page unloads, and add both page listeners
	const handlePageHide = (): void => saveListen()
	document.addEventListener("visibilitychange", handleVisibilityChange)
	window.addEventListener("pagehide", handlePageHide)

	// return the call that removes every listener and clears the element
	return () => {
		removeAudioEventListeners()
		document.removeEventListener("visibilitychange", handleVisibilityChange)
		window.removeEventListener("pagehide", handlePageHide)
		audioElement = null
	}
}

/**
 * Plays a podcast episode from startSeconds, or from where the user left off, and returns whether playback started.
 */
export async function playPodcastEpisode(podcastEpisode: PodcastEpisode, startSeconds?: number): Promise<boolean> {
	if (!audioElement || !podcastEpisode.audioUrl) {
		return false
	}

	// start a completed podcast episode over, and any other episode from the user's saved progress
	const savedProgressSeconds = podcastEpisode.isCompleted ? 0 : podcastEpisode.progressSeconds
	if (playerState.podcastEpisode?.id !== podcastEpisode.id) {
		// save the previous podcast episode's progress, then load the new episode at its start position
		saveListen()
		resetPodcastEpisodePlaybackStart()
		audioElement.src = podcastEpisode.audioUrl
		audioElement.currentTime = startSeconds ?? savedProgressSeconds
		audioElement.playbackRate = playerState.playbackRate
		updatePlayerState({ podcastEpisode, positionSeconds: startSeconds ?? savedProgressSeconds })
	} else if (startSeconds !== undefined) {
		// seek the loaded podcast episode to startSeconds
		seekPlaybackTo(startSeconds)
	}

	// start playback. a start that the browser blocks leaves the podcast episode loaded and ready to play
	try {
		await audioElement.play()
	} catch {
		return false
	}
	captureEpisodeVisitEvent("visit_episode_played", podcastEpisode)
	return true
}

/**
 * Pauses the loaded podcast episode if it is playing.
 */
export function pausePodcastEpisode(): void {
	if (audioElement && playerState.isPlaying) {
		audioElement.pause()
	}
}

/**
 * Names the loaded podcast episode on the lock screen again.
 */
export function refreshPodcastEpisodeMediaSession(): void {
	updateMediaSession()
}

/**
 * Plays or pauses the loaded podcast episode.
 */
export function togglePlayback(): void {
	if (!audioElement || !playerState.podcastEpisode) {
		return
	}

	// play or pause the audio
	if (audioElement.paused) {
		void audioElement.play().catch(() => {})
	} else {
		audioElement.pause()
	}
}

/**
 * Moves playback to a position in the loaded podcast episode.
 */
export function seekPlaybackTo(positionSeconds: number): void {
	if (!audioElement || !playerState.podcastEpisode) {
		return
	}

	// a seek or a chapter skip ends a question asked from the podcast player and leaves the podcast episode paused
	endPodcastEpisodeQuestion("skipped")

	// keep the position inside the podcast episode, then move the audio there
	const durationSeconds = playerState.podcastEpisode.durationSeconds ?? 0
	audioElement.currentTime = Math.min(Math.max(positionSeconds, 0), durationSeconds)
	updatePlayerState({ positionSeconds: audioElement.currentTime })

	// name the new position's chapter on the lock screen
	updateMediaSession()
}

/**
 * Skips back or forward by a number of seconds.
 */
export function skipPlaybackBy(skipSeconds: number): void {
	seekPlaybackTo(playerState.positionSeconds + skipSeconds)
}

// skip to the next or the previous chapter of the loaded podcast episode
function skipChapter(direction: 1 | -1): void {
	const chapters = playerState.podcastEpisode?.chapters ?? []
	const adjacentChapter = chapters[toChapterIndexAt(chapters, playerState.positionSeconds) + direction]
	if (adjacentChapter) {
		seekPlaybackTo(adjacentChapter.startSeconds)
	}
}

/**
 * Changes the playback rate to the next rate in the list, or to the first rate after the last.
 */
export function cyclePlaybackRate(): void {
	const playbackRate = toNextPlaybackRate(playerState.playbackRate)
	if (audioElement) {
		audioElement.playbackRate = playbackRate
	}
	updatePlayerState({ playbackRate })
}

/**
 * Stops playback and unloads the podcast episode with this id if that episode is loaded.
 */
export function unloadPodcastEpisode(podcastEpisodeId: string): void {
	if (playerState.podcastEpisode?.id !== podcastEpisodeId) {
		return
	}

	// stop the audio, and clear the podcast episode from the element and the state
	audioElement?.pause()
	audioElement?.removeAttribute("src")
	updatePlayerState({ podcastEpisode: null, isPlaying: false, positionSeconds: 0 })
}

// merge a change into the state, and notify every subscriber
function updatePlayerState(stateChange: Partial<PodcastEpisodePlayerState>): void {
	playerState = { ...playerState, ...stateChange }
	publish()
	publishPosition()
}

// keep the audio's position, save the user's progress at each save interval, and show a new chapter on the lock screen
function handleTimeUpdate(): void {
	if (!audioElement || !playerState.podcastEpisode) {
		return
	}

	// keep the audio's position, and notify the position's subscribers
	const { chapters } = playerState.podcastEpisode
	const previousChapterIndex = toChapterIndexAt(chapters, playerState.positionSeconds)
	playerState = { ...playerState, positionSeconds: audioElement.currentTime }
	publishPosition()

	// notify every subscriber of a new chapter, and name the chapter on the lock screen
	if (toChapterIndexAt(chapters, audioElement.currentTime) !== previousChapterIndex) {
		publish()
		updateMediaSession()
	}

	// save a playing podcast episode's progress once the save interval has passed
	if (playerState.isPlaying && isPodcastEpisodeListenDue()) {
		saveListen()
	}
}

// keep whether the audio is playing. a pause saves the user's progress, and the first play saves the playback start
function handlePlaybackChange(isPlaying: boolean): void {
	updatePlayerState({ isPlaying })
	if (!isPlaying) {
		saveListen()
		return
	}

	// one voice at a time. the podcast episode playing ends a question asked from the podcast player and stops a spoken
	// answer
	endPodcastEpisodeQuestion("played")
	stopSpokenAnswer()

	// name the podcast episode on the lock screen, and save the episode's first play
	updateMediaSession()
	saveListen({ isPlaybackStart: true })
}

// save that the podcast episode finished, then play the user's next unplayed episode from another topic
async function handleEnded(): Promise<void> {
	const endedPodcastEpisode = playerState.podcastEpisode
	if (!endedPodcastEpisode) {
		return
	}
	saveListen({ isCompleted: true })
	updatePlayerState({ isPlaying: false })
	captureEpisodeVisitEvent("visit_episode_completed", endedPodcastEpisode)

	// only a signed-in user has a next unplayed podcast episode
	const nextUnplayedPodcastEpisode = isUserSignedIn()
		? await fetchNextUnplayedPodcastEpisode(endedPodcastEpisode.topicId)
		: null
	if (nextUnplayedPodcastEpisode) {
		await playPodcastEpisode(nextUnplayedPodcastEpisode)
	}
}

// load the audio again from its stable url, and return to where playback was.
// the stable url redirects to a short-lived url, so a seek or a resume fails once the short-lived url expires
function reloadAudio(): void {
	// reload only a podcast episode that has audio, at most once per reload interval
	const { podcastEpisode, positionSeconds, isPlaying } = playerState
	if (!audioElement || !podcastEpisode?.audioUrl || Date.now() - lastAudioReloadAt < AUDIO_RELOAD_INTERVAL_MS) {
		return
	}

	// load from the stable url, at the same position and playback rate
	lastAudioReloadAt = Date.now()
	audioElement.src = podcastEpisode.audioUrl
	audioElement.currentTime = positionSeconds
	audioElement.playbackRate = playerState.playbackRate
	if (isPlaying) {
		void audioElement.play().catch(() => {})
	}
}

// save the user's progress in the loaded podcast episode, with whether playback just started or just finished
function saveListen(listen?: SavePodcastEpisodeListenOptions["listen"]): void {
	const { podcastEpisode, positionSeconds } = playerState
	if (podcastEpisode) {
		savePodcastEpisodeListen({ podcastEpisode, positionSeconds, listen })
	}
}

// name the podcast episode and the player's chapter on the lock screen, with the store's own controls
function updateMediaSession(): void {
	if (!playerState.podcastEpisode) {
		return
	}
	updatePodcastEpisodeMediaSession(playerState.podcastEpisode, playerState.positionSeconds, {
		togglePlayback,
		skipChapter,
		skipBack: () => skipPlaybackBy(-SKIP_BACK_SECONDS),
		skipForward: () => skipPlaybackBy(SKIP_FORWARD_SECONDS),
	})
}
