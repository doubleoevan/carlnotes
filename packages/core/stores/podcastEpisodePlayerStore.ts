import { fetchNextUnplayedPodcastEpisode } from "@carlnotes/client/podcastEpisodeClient"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { PodcastEpisodeAudioAdapter, PodcastEpisodeAudioEvent } from "../lib/podcastEpisodeAudio"
import { toChapterIndexAt, toNextPlaybackRate, toPodcastEpisodeSeekSeconds } from "../lib/podcastEpisodePlayback"
import {
	isPodcastEpisodeListenDue,
	isUserSignedIn,
	resetPodcastEpisodePlaybackStart,
	type SavePodcastEpisodeListenOptions,
	savePodcastEpisodeListen,
} from "./podcastEpisodeListenStore"
import {
	toPodcastEpisodePlayerState,
	updatePodcastEpisodePlayerState,
	updatePodcastEpisodePosition,
} from "./podcastEpisodePlayerState"

// retain the established player imports while state subscriptions live separately
export {
	toLoadedPodcastEpisode,
	toPlayerChapterPosition,
	toPodcastEpisodePlayerState,
	toPodcastEpisodeQuestionStart,
	useIsPodcastEpisodePlaying,
	useIsPodcastPlayerShown,
	usePlayerChapter,
	usePlayerChapterPosition,
	usePlayerPositionSeconds,
	usePodcastEpisodePlayer,
} from "./podcastEpisodePlayerState"

// retain one platform owner and reject events from retired loads or requests
let audioAdapter: PodcastEpisodeAudioAdapter | null = null
let hasLoadedAudio = false
let loadId = 0
let requestVersion = 0
let lastAudioReloadAt = 0
const AUDIO_RELOAD_INTERVAL_MS = 10_000

/**
 * Registers the app's single audio adapter and returns its cleanup.
 */
export function registerPodcastEpisodeAudioAdapter(adapter: PodcastEpisodeAudioAdapter): () => void {
	// release the previous adapter before replacing its event owner
	clearPodcastEpisodePlayer()
	audioAdapter = adapter
	return () => {
		if (audioAdapter === adapter) {
			clearPodcastEpisodePlayer()
			audioAdapter = null
		}
	}
}

/**
 * Invalidates delayed playback requests and returns the current request identity.
 */
export function retirePodcastEpisodeRequests(): number {
	// advance the identity before another asynchronous action starts
	requestVersion += 1
	return requestVersion
}

/**
 * Reports whether a delayed playback request still represents the latest action.
 */
export function isPodcastEpisodeRequestCurrent(version: number): boolean {
	return requestVersion === version
}

/**
 * Loads and plays an episode from an explicit position or its saved progress.
 */
export async function playPodcastEpisode(podcastEpisode: PodcastEpisode, startSeconds?: number): Promise<boolean> {
	if (!audioAdapter || !podcastEpisode.audioUrl) {
		return false
	}
	// retire earlier requests before changing the loaded episode
	const version = retirePodcastEpisodeRequests()
	const adapter = audioAdapter
	try {
		// reuse healthy loaded audio and preserve explicit chapter selection
		const playerState = toPodcastEpisodePlayerState()
		if (!hasLoadedAudio || playerState.podcastEpisode?.id !== podcastEpisode.id || playerState.errorMessage) {
			await loadPodcastEpisode({ podcastEpisode, startSeconds, adapter })
		} else if (startSeconds !== undefined || toPodcastEpisodePlayerState().podcastEpisode?.isCompleted) {
			seekTo(startSeconds ?? 0)
		}
		if (!isPodcastEpisodeRequestCurrent(version) || audioAdapter !== adapter) {
			return false
		}
		await adapter.play()
		if (!isPodcastEpisodeRequestCurrent(version)) {
			return false
		}
		adapter.onVisitEvent?.("visit_episode_played", podcastEpisode)
		return true
	} catch {
		if (isPodcastEpisodeRequestCurrent(version)) {
			updatePodcastEpisodePlayerState({
				isPlaying: false,
				isLoading: false,
				errorMessage: "This episode could not play. Try again.",
			})
		}
		return false
	}
}

/**
 * Restores an authorized episode paused, without resolving or counting an audio source.
 */
export function restorePodcastEpisode({
	podcastEpisode,
	positionSeconds,
	playbackRate,
}: {
	podcastEpisode: PodcastEpisode
	positionSeconds: number
	playbackRate: number
}): void {
	// restore controls without resolving or starting an audio source
	clearPodcastEpisodePlayer()
	updatePodcastEpisodePlayerState({
		podcastEpisode,
		positionSeconds: toPodcastEpisodeSeekSeconds({
			positionSeconds: podcastEpisode.isCompleted ? 0 : positionSeconds,
			durationSeconds: podcastEpisode.durationSeconds,
		}),
		playbackRate,
	})
}

/**
 * Resumes the loaded episode at its current position.
 */
export function resumePodcastEpisode(): void {
	// retain the current episode while deciding how to resume it
	const { podcastEpisode, errorMessage, positionSeconds } = toPodcastEpisodePlayerState()
	if (!audioAdapter || !podcastEpisode) {
		return
	}
	// retry failed audio at the current position and retain ordinary resume analytics
	if (podcastEpisode.isCompleted) {
		void playPodcastEpisode(podcastEpisode, 0)
		return
	}
	if (errorMessage || !hasLoadedAudio) {
		void playPodcastEpisode(podcastEpisode, positionSeconds)
		return
	}
	const version = retirePodcastEpisodeRequests()
	void resumeAudio(audioAdapter, version)
}

/**
 * Pauses playback and cancels any pending automatic start.
 */
export function pausePodcastEpisode(): void {
	// retire automatic starts before pausing and saving progress
	retirePodcastEpisodeRequests()
	audioAdapter?.pause()
	updatePodcastEpisodePlayerState({ isPlaying: false })
	savePodcastEpisodeProgress()
}

/**
 * Toggles the loaded episode between playing and paused.
 */
export function togglePlayback(): void {
	if (toPodcastEpisodePlayerState().isPlaying) {
		pausePodcastEpisode()
	} else {
		resumePodcastEpisode()
	}
}

/**
 * Moves the loaded episode while preserving its playing state.
 */
export function seekPlaybackTo(positionSeconds: number): void {
	// let this explicit seek supersede delayed automatic playback
	retirePodcastEpisodeRequests()
	seekTo(positionSeconds)
}

/**
 * Skips the loaded episode by the given number of seconds.
 */
export function skipPlaybackBy(skipSeconds: number): void {
	seekPlaybackTo(toPodcastEpisodePlayerState().positionSeconds + skipSeconds)
}

/**
 * Moves to the adjacent chapter's start when that chapter exists.
 */
export function skipPodcastEpisodeChapter(direction: 1 | -1): void {
	// retain the first and last chapter when no adjacent chapter exists
	const chapters = toPodcastEpisodePlayerState().podcastEpisode?.chapters ?? []
	const chapter = chapters[toChapterIndexAt(chapters, toPodcastEpisodePlayerState().positionSeconds) + direction]
	if (chapter) {
		seekPlaybackTo(chapter.startSeconds)
	}
}

/**
 * Cycles the playback rate through the shared speed order.
 */
export function cyclePlaybackRate(): void {
	// apply and persist the same rate in app controls and system metadata
	const playbackRate = toNextPlaybackRate(toPodcastEpisodePlayerState().playbackRate)
	audioAdapter?.setPlaybackRate(playbackRate)
	updatePodcastEpisodePlayerState({ playbackRate })
	refreshPodcastEpisodeMediaSession()
	audioAdapter?.onCheckpoint?.(toPodcastEpisodePlayerState())
}

/**
 * Stops and unloads the named episode if it is currently selected.
 */
export function unloadPodcastEpisode(podcastEpisodeId: string): void {
	if (toPodcastEpisodePlayerState().podcastEpisode?.id === podcastEpisodeId) {
		clearPodcastEpisodePlayer()
	}
}

/**
 * Clears playback and rejects events and requests from the retired load.
 */
export function clearPodcastEpisodePlayer(): void {
	// invalidate pending work before releasing the platform source
	retirePodcastEpisodeRequests()
	loadId += 1
	hasLoadedAudio = false
	lastAudioReloadAt = 0
	audioAdapter?.unload()
	resetPodcastEpisodePlaybackStart()
	updatePodcastEpisodePlayerState({
		podcastEpisode: null,
		isPlaying: false,
		isLoading: false,
		positionSeconds: 0,
		errorMessage: null,
	})
	audioAdapter?.updateMetadata(toPodcastEpisodePlayerState())
}

/**
 * Publishes the current episode and chapter to the app's system controls.
 */
export function refreshPodcastEpisodeMediaSession(): void {
	audioAdapter?.updateMetadata(toPodcastEpisodePlayerState())
}

/**
 * Saves the current episode's progress and the platform checkpoint.
 */
export function savePodcastEpisodeProgress(listen?: SavePodcastEpisodeListenOptions["listen"]): void {
	// save network progress and the app checkpoint for the same selected episode
	const { podcastEpisode, positionSeconds } = toPodcastEpisodePlayerState()
	if (podcastEpisode) {
		savePodcastEpisodeListen({ podcastEpisode, positionSeconds, listen })
		audioAdapter?.onCheckpoint?.(toPodcastEpisodePlayerState())
	}
}

/**
 * Reconciles a status event only while its episode load is current.
 */
export function reportPodcastEpisodeAudioEvent(event: PodcastEpisodeAudioEvent): void {
	if (event.loadId !== loadId || !toPodcastEpisodePlayerState().podcastEpisode) {
		return
	}
	// route platform events through the same playback rules
	if (event.type === "position") {
		receivePosition(event.positionSeconds)
	} else if (event.type === "playback") {
		receivePlayback(event.isPlaying)
	} else if (event.type === "buffering") {
		if (toPodcastEpisodePlayerState().isLoading !== event.isBuffering) {
			updatePodcastEpisodePlayerState({ isLoading: event.isBuffering })
		}
	} else if (event.type === "ended") {
		void finishPodcastEpisode()
	} else {
		void reloadPodcastEpisodeAudio()
	}
}

async function loadPodcastEpisode({
	podcastEpisode,
	startSeconds,
	adapter,
}: {
	podcastEpisode: PodcastEpisode
	startSeconds: number | undefined
	adapter: PodcastEpisodeAudioAdapter
}): Promise<void> {
	// checkpoint the old episode and retire its audio events
	savePodcastEpisodeProgress()
	loadId += 1
	adapter.unload()
	resetPodcastEpisodePlaybackStart()
	hasLoadedAudio = false
	lastAudioReloadAt = 0
	const currentLoadId = loadId
	const savedProgressSeconds = podcastEpisode.isCompleted ? 0 : podcastEpisode.progressSeconds
	const positionSeconds = toPodcastEpisodeSeekSeconds({
		positionSeconds: startSeconds ?? savedProgressSeconds,
		durationSeconds: podcastEpisode.durationSeconds,
	})
	updatePodcastEpisodePlayerState({
		podcastEpisode: { ...podcastEpisode, isCompleted: false },
		positionSeconds,
		isPlaying: false,
		isLoading: true,
		errorMessage: null,
	})
	await adapter.load({
		podcastEpisode,
		positionSeconds,
		playbackRate: toPodcastEpisodePlayerState().playbackRate,
		loadId: currentLoadId,
	})
	if (currentLoadId === loadId) {
		hasLoadedAudio = true
		updatePodcastEpisodePlayerState({ isLoading: false })
		refreshPodcastEpisodeMediaSession()
	}
}

async function resumeAudio(adapter: PodcastEpisodeAudioAdapter, version: number): Promise<void> {
	try {
		await adapter.play()
	} catch {
		if (audioAdapter === adapter && isPodcastEpisodeRequestCurrent(version)) {
			updatePodcastEpisodePlayerState({ isPlaying: false, errorMessage: "This episode could not play. Try again." })
		}
	}
}

function seekTo(positionSeconds: number): void {
	// retain the authorized loaded episode across the synchronous seek
	const { podcastEpisode } = toPodcastEpisodePlayerState()
	if (!audioAdapter || !podcastEpisode) {
		return
	}
	// stop any spoken question before applying the seek
	audioAdapter.onSeek?.()
	if (podcastEpisode.isCompleted) {
		resetPodcastEpisodePlaybackStart()
		updatePodcastEpisodePlayerState({ podcastEpisode: { ...podcastEpisode, isCompleted: false } })
	}
	const seekSeconds = toPodcastEpisodeSeekSeconds({
		positionSeconds,
		durationSeconds: podcastEpisode.durationSeconds,
	})
	audioAdapter.seek(seekSeconds)
	updatePodcastEpisodePlayerState({ positionSeconds: seekSeconds })
	refreshPodcastEpisodeMediaSession()
	audioAdapter.onCheckpoint?.(toPodcastEpisodePlayerState())
}

function receivePosition(positionSeconds: number): void {
	// notify chapter subscribers only when the selected chapter changes
	if (updatePodcastEpisodePosition(positionSeconds)) {
		refreshPodcastEpisodeMediaSession()
	}
	if (toPodcastEpisodePlayerState().isPlaying && isPodcastEpisodeListenDue()) {
		savePodcastEpisodeProgress()
	}
}

function receivePlayback(isPlaying: boolean): void {
	if (toPodcastEpisodePlayerState().isPlaying === isPlaying) {
		return
	}
	updatePodcastEpisodePlayerState({ isPlaying, isLoading: false, errorMessage: null })
	if (isPlaying) {
		audioAdapter?.onPlaybackStarted?.()
		refreshPodcastEpisodeMediaSession()
		savePodcastEpisodeProgress({ isPlaybackStart: true })
	} else {
		savePodcastEpisodeProgress()
	}
}

async function finishPodcastEpisode(): Promise<void> {
	// ignore completion after an episode has already been retired
	const endedPodcastEpisode = toPodcastEpisodePlayerState().podcastEpisode
	if (!endedPodcastEpisode) {
		return
	}
	// complete this load before requesting another episode
	const version = retirePodcastEpisodeRequests()
	updatePodcastEpisodePlayerState({
		isPlaying: false,
		isLoading: false,
		podcastEpisode: { ...endedPodcastEpisode, isCompleted: true },
	})
	savePodcastEpisodeProgress({ isCompleted: true })
	audioAdapter?.onVisitEvent?.("visit_episode_completed", endedPodcastEpisode)
	const nextPodcastEpisode = isUserSignedIn()
		? await fetchNextUnplayedPodcastEpisode(endedPodcastEpisode.topicId).catch(() => null)
		: null
	if (nextPodcastEpisode && isPodcastEpisodeRequestCurrent(version)) {
		await playPodcastEpisode(nextPodcastEpisode)
	}
}

async function reloadPodcastEpisodeAudio(): Promise<void> {
	// retry only the selected episode and retain its position and rate
	const { podcastEpisode, positionSeconds, isPlaying } = toPodcastEpisodePlayerState()
	if (!audioAdapter || !podcastEpisode) {
		return
	}
	if (Date.now() - lastAudioReloadAt < AUDIO_RELOAD_INTERVAL_MS) {
		audioAdapter.pause()
		updatePodcastEpisodePlayerState({
			isPlaying: false,
			isLoading: false,
			errorMessage: "This episode could not play. Try again.",
		})
		return
	}
	// refresh the source without counting another playback start
	lastAudioReloadAt = Date.now()
	const version = requestVersion
	const adapter = audioAdapter
	updatePodcastEpisodePlayerState({ isLoading: true })
	try {
		await adapter.load({
			podcastEpisode,
			positionSeconds,
			playbackRate: toPodcastEpisodePlayerState().playbackRate,
			loadId,
		})
		if (isPodcastEpisodeRequestCurrent(version)) {
			updatePodcastEpisodePlayerState({ isLoading: false })
			refreshPodcastEpisodeMediaSession()
		}
		if (isPlaying && isPodcastEpisodeRequestCurrent(version)) {
			await adapter.play()
		}
	} catch {
		if (isPodcastEpisodeRequestCurrent(version)) {
			updatePodcastEpisodePlayerState({
				isPlaying: false,
				isLoading: false,
				errorMessage: "This episode could not play. Try again.",
			})
		}
	}
}
