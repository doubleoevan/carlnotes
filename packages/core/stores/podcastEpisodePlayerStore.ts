import { fetchNextUnplayedPodcastEpisode } from "@carlnotes/client/podcastEpisodeClient"
import type { PodcastEpisode, PodcastEpisodeFormat } from "@carlnotes/contracts/podcast"
import { toDiscussionTopicPostId } from "@carlnotes/contracts/topicPosts"
import type {
	PodcastEpisodeAudioAdapter,
	PodcastEpisodeAudioEvent,
	TopicPodcastEpisodeVideoAdapter,
} from "../lib/podcastEpisodeAudio"
import { PODCAST_EPISODE_PLAY_FAILED_TEXT } from "../lib/podcastEpisodeCopy"
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
import {
	isPodcastEpisodeLoadCurrent,
	isPodcastEpisodeRequestCurrent,
	isPodcastEpisodeSourceLoaded,
	loadPodcastEpisodeSource,
	refreshPodcastEpisodeMediaSession,
	releasePodcastEpisodeSource,
	reloadPodcastEpisodeAudio,
	resumePodcastEpisodeSource,
	retirePodcastEpisodeRequests,
	setPodcastEpisodeAudioAdapter,
	setTopicPodcastEpisodeVideoAdapter,
	toPodcastEpisodeAudioAdapter,
	toPodcastEpisodeSourceAdapter,
	toPodcastEpisodeSourceUrl,
	toTopicPodcastEpisodeVideoAdapter,
} from "./podcastEpisodeSource"

// the state subscriptions and the source bookkeeping an app reaches through the player
export {
	toLoadedPodcastEpisode,
	toPodcastEpisodePlayerState,
	toPodcastEpisodeQuestionStart,
	useIsPodcastEpisodePlaying,
	useIsPodcastPlayerShown,
	usePlayerChapter,
	usePlayerChapterPosition,
	usePlayerPositionSeconds,
	usePodcastEpisodePlayer,
} from "./podcastEpisodePlayerState"
export {
	isPodcastEpisodeRequestCurrent,
	refreshPodcastEpisodeMediaSession,
	retirePodcastEpisodeRequests,
} from "./podcastEpisodeSource"

/**
 * Registers the app's single audio adapter and returns its cleanup.
 */
export function registerPodcastEpisodeAudioAdapter(adapter: PodcastEpisodeAudioAdapter): () => void {
	// release the previous adapter before replacing its event owner
	clearPodcastEpisodePlayer()
	setPodcastEpisodeAudioAdapter(adapter)
	// return a cleanup that clears the player if this adapter is still the registered one
	return () => {
		if (toPodcastEpisodeAudioAdapter() === adapter) {
			clearPodcastEpisodePlayer()
			setPodcastEpisodeAudioAdapter(null)
		}
	}
}

/**
 * Registers a film player as the video adapter and returns its cleanup, which returns a playing film to audio.
 */
export function registerTopicPodcastEpisodeVideoAdapter(adapter: TopicPodcastEpisodeVideoAdapter): () => void {
	// a film player that replaces another starts from audio
	returnToPodcastEpisodeAudio()
	setTopicPodcastEpisodeVideoAdapter(adapter)
	// return a cleanup that leaves the film if this film player is still the registered one
	return () => {
		if (toTopicPodcastEpisodeVideoAdapter() === adapter) {
			returnToPodcastEpisodeAudio()
			setTopicPodcastEpisodeVideoAdapter(null)
		}
	}
}

/**
 * Plays a podcast episode's film from an explicit position, or from where its audio stands or its saved progress.
 */
export async function playTopicPodcastEpisodeVideo(
	podcastEpisode: PodcastEpisode,
	startSeconds?: number,
): Promise<boolean> {
	if (!toTopicPodcastEpisodeVideoAdapter() || !podcastEpisode.video) {
		return false
	}
	// stop the audio before the film plays
	takePodcastEpisodeFormat("video", podcastEpisode)
	return playPodcastEpisodeSource(podcastEpisode, startSeconds)
}

/**
 * Skips the loaded film, or starts a podcast episode's film a skip away from the second it would start from.
 */
export function skipTopicPodcastEpisodeVideoBy(podcastEpisode: PodcastEpisode, skipSeconds: number): void {
	// skip the loaded film where it stands
	if (isTopicPodcastEpisodeVideoLoaded(podcastEpisode)) {
		skipPlaybackBy(skipSeconds)
		return
	}
	// start any other film, with the audio stopped, a skip away from its start
	void playTopicPodcastEpisodeVideo(podcastEpisode, toPodcastEpisodeStartSeconds(podcastEpisode) + skipSeconds)
}

/**
 * Steps the playback rate, and starts a podcast episode's film if it is not the loaded one.
 */
export function cycleTopicPodcastEpisodeVideoPlaybackRate(podcastEpisode: PodcastEpisode): void {
	// step the rate first, so a film that starts loads at the new rate
	cyclePlaybackRate()
	if (!isTopicPodcastEpisodeVideoLoaded(podcastEpisode)) {
		void playTopicPodcastEpisodeVideo(podcastEpisode)
	}
}

/**
 * Plays a podcast episode's audio from an explicit position, or from where its film stands or its saved progress.
 */
export async function playPodcastEpisodeAudio(podcastEpisode: PodcastEpisode, startSeconds?: number): Promise<boolean> {
	// stop a film before the audio plays
	takePodcastEpisodeFormat("audio", podcastEpisode)
	return playPodcastEpisodeSource(podcastEpisode, startSeconds)
}

/**
 * Pauses a film where it stands and gives the source back to the audio, so the docked player continues as audio.
 */
export function returnToPodcastEpisodeAudio(): void {
	if (toPodcastEpisodePlayerState().format !== "video") {
		return
	}
	// pause and save the film, then release its source
	pausePodcastEpisode()
	releasePodcastEpisodeSource()
	updatePodcastEpisodePlayerState({ format: "audio", isLoading: false })
}

/**
 * Loads and plays an episode from an explicit position or its saved progress, as audio unless it is the loaded film.
 */
export async function playPodcastEpisode(podcastEpisode: PodcastEpisode, startSeconds?: number): Promise<boolean> {
	// keep the film's format only for the film's own podcast episode
	const { format, podcastEpisode: loadedPodcastEpisode } = toPodcastEpisodePlayerState()
	if (format === "video" && loadedPodcastEpisode?.id !== podcastEpisode.id) {
		takePodcastEpisodeFormat("audio", podcastEpisode)
	}
	return playPodcastEpisodeSource(podcastEpisode, startSeconds)
}

// load and play a podcast episode's source in the format that plays
async function playPodcastEpisodeSource(podcastEpisode: PodcastEpisode, startSeconds?: number): Promise<boolean> {
	const adapter = toPodcastEpisodeSourceAdapter()
	if (!adapter || !toPodcastEpisodeSourceUrl(podcastEpisode)) {
		return false
	}
	// retire earlier requests before changing the loaded episode
	const version = retirePodcastEpisodeRequests()
	try {
		// load a new or failed podcast episode, load the source of the format that took over, or seek the loaded source
		const playerState = toPodcastEpisodePlayerState()
		const loadedPodcastEpisode = playerState.podcastEpisode
		if (loadedPodcastEpisode?.id !== podcastEpisode.id || playerState.errorMessage) {
			await loadPodcastEpisode({ podcastEpisode, startSeconds, adapter })
		} else if (!isPodcastEpisodeSourceLoaded()) {
			// the format that took over loads its own source of the same podcast episode
			await reloadPodcastEpisodeFormat({ loadedPodcastEpisode, startSeconds, adapter })
		} else if (startSeconds !== undefined || loadedPodcastEpisode.isCompleted) {
			seekTo(startSeconds ?? 0)
		}
		// stop if a newer request started or the adapter changed
		if (!isPodcastEpisodeRequestCurrent(version) || toPodcastEpisodeSourceAdapter() !== adapter) {
			return false
		}
		// play the source, and report the visit event if no newer request started meanwhile
		await adapter.play()
		if (!isPodcastEpisodeRequestCurrent(version)) {
			return false
		}
		toPodcastEpisodeAudioAdapter()?.onVisitEvent?.("visit_episode_played", podcastEpisode)
		return true
	} catch {
		// show the play error if this request is still the latest
		if (isPodcastEpisodeRequestCurrent(version)) {
			updatePodcastEpisodePlayerState({
				isPlaying: false,
				isLoading: false,
				errorMessage: PODCAST_EPISODE_PLAY_FAILED_TEXT,
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
	const adapter = toPodcastEpisodeSourceAdapter()
	if (!adapter || !podcastEpisode) {
		return
	}
	// retry failed audio at the current position and retain ordinary resume analytics
	if (podcastEpisode.isCompleted) {
		void playPodcastEpisode(podcastEpisode, 0)
		return
	}
	if (errorMessage || !isPodcastEpisodeSourceLoaded()) {
		void playPodcastEpisode(podcastEpisode, positionSeconds)
		return
	}
	// otherwise resume the loaded audio as the newest request
	const version = retirePodcastEpisodeRequests()
	void resumePodcastEpisodeSource(adapter, version)
}

/**
 * Pauses playback and cancels any pending automatic start.
 */
export function pausePodcastEpisode(): void {
	// retire automatic starts before pausing and saving progress
	retirePodcastEpisodeRequests()
	toPodcastEpisodeSourceAdapter()?.pause()
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
	toPodcastEpisodeSourceAdapter()?.setPlaybackRate(playbackRate)
	updatePodcastEpisodePlayerState({ playbackRate })
	refreshPodcastEpisodeMediaSession()
	toPodcastEpisodeAudioAdapter()?.onCheckpoint?.(toPodcastEpisodePlayerState())
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
	releasePodcastEpisodeSource()
	resetPodcastEpisodePlaybackStart()
	updatePodcastEpisodePlayerState({
		podcastEpisode: null,
		format: "audio",
		isPlaying: false,
		isLoading: false,
		positionSeconds: 0,
		errorMessage: null,
	})
	toPodcastEpisodeAudioAdapter()?.updateMetadata(toPodcastEpisodePlayerState())
}

/**
 * Saves the current episode's progress and the platform checkpoint.
 */
export function savePodcastEpisodeProgress(listen?: SavePodcastEpisodeListenOptions["listen"]): void {
	// save network progress and the app checkpoint for the same selected episode
	const { podcastEpisode, positionSeconds } = toPodcastEpisodePlayerState()
	if (podcastEpisode) {
		savePodcastEpisodeListen({ podcastEpisode, positionSeconds, listen })
		toPodcastEpisodeAudioAdapter()?.onCheckpoint?.(toPodcastEpisodePlayerState())
	}
}

/**
 * Reconciles a status event only while its episode load is current.
 */
export function reportPodcastEpisodeAudioEvent(event: PodcastEpisodeAudioEvent): void {
	if (!isPodcastEpisodeLoadCurrent(event.loadId) || !toPodcastEpisodePlayerState().podcastEpisode) {
		return
	}
	// route platform events through the same playback rules
	if (event.type === "position") {
		receivePosition(event.positionSeconds)
	} else if (event.type === "playback") {
		receivePlayback(event.isPlaying)
	} else if (event.type === "buffering") {
		// match the loading state to the buffering state, if it changed
		if (toPodcastEpisodePlayerState().isLoading !== event.isBuffering) {
			updatePodcastEpisodePlayerState({ isLoading: event.isBuffering })
		}
	} else if (event.type === "ended") {
		void finishPodcastEpisode()
	} else {
		// reload the source after an audio error
		void reloadPodcastEpisodeAudio()
	}
}

// whether a podcast episode is the loaded one, in its film format
function isTopicPodcastEpisodeVideoLoaded(podcastEpisode: PodcastEpisode): boolean {
	const { podcastEpisode: loadedPodcastEpisode, format } = toPodcastEpisodePlayerState()
	return loadedPodcastEpisode?.id === podcastEpisode.id && format === "video"
}

// the second a podcast episode starts from with no explicit position. the loaded one starts where it stands, and any
// other or a failed one from its saved progress. a completed podcast episode starts over
function toPodcastEpisodeStartSeconds(podcastEpisode: PodcastEpisode): number {
	const { podcastEpisode: loadedPodcastEpisode, positionSeconds, errorMessage } = toPodcastEpisodePlayerState()
	if (loadedPodcastEpisode?.id !== podcastEpisode.id || errorMessage) {
		return podcastEpisode.isCompleted ? 0 : podcastEpisode.progressSeconds
	}
	return loadedPodcastEpisode.isCompleted ? 0 : positionSeconds
}

// stop the playing format's source where it stands, save its progress, and give the source to the other format,
// for the podcast episode that plays next
function takePodcastEpisodeFormat(format: PodcastEpisodeFormat, nextPodcastEpisode: PodcastEpisode): void {
	const { format: playingFormat, podcastEpisode: loadedPodcastEpisode } = toPodcastEpisodePlayerState()
	if (playingFormat === format) {
		return
	}
	// retire pending starts, save the progress, and release the source
	retirePodcastEpisodeRequests()
	savePodcastEpisodeProgress()
	releasePodcastEpisodeSource()
	updatePodcastEpisodePlayerState({ format, isPlaying: false, isLoading: false })

	// report a switch of the loaded podcast episode to its other format
	if (loadedPodcastEpisode?.id === nextPodcastEpisode.id) {
		toPodcastEpisodeAudioAdapter()?.onFormatSwitched?.(loadedPodcastEpisode, format)
	}
}

async function loadPodcastEpisode({
	podcastEpisode,
	startSeconds,
	adapter,
}: {
	podcastEpisode: PodcastEpisode
	startSeconds: number | undefined
	adapter: TopicPodcastEpisodeVideoAdapter
}): Promise<void> {
	// checkpoint the old episode, and count the new one's playback start once
	savePodcastEpisodeProgress()
	resetPodcastEpisodePlaybackStart()
	// show the new podcast episode loading at the requested start or its saved progress
	await loadPodcastEpisodeSource({
		podcastEpisode,
		positionSeconds: startSeconds ?? toPodcastEpisodeStartSeconds(podcastEpisode),
		adapter,
	})
}

// load the loaded podcast episode's source again in the format that now plays, at the requested start or where it
// stood. a completed podcast episode starts over and counts another playback start
async function reloadPodcastEpisodeFormat({
	loadedPodcastEpisode,
	startSeconds,
	adapter,
}: {
	loadedPodcastEpisode: PodcastEpisode
	startSeconds: number | undefined
	adapter: TopicPodcastEpisodeVideoAdapter
}): Promise<void> {
	// start a completed podcast episode over
	if (loadedPodcastEpisode.isCompleted) {
		resetPodcastEpisodePlaybackStart()
	}
	await loadPodcastEpisodeSource({
		podcastEpisode: loadedPodcastEpisode,
		positionSeconds: startSeconds ?? toPodcastEpisodeStartSeconds(loadedPodcastEpisode),
		adapter,
	})
}

function seekTo(positionSeconds: number): void {
	// retain the authorized loaded episode across the synchronous seek
	const { podcastEpisode } = toPodcastEpisodePlayerState()
	const adapter = toPodcastEpisodeSourceAdapter()
	if (!adapter || !podcastEpisode) {
		return
	}
	// stop any spoken question before applying the seek
	toPodcastEpisodeAudioAdapter()?.onSeek?.()
	if (podcastEpisode.isCompleted) {
		resetPodcastEpisodePlaybackStart()
		updatePodcastEpisodePlayerState({ podcastEpisode: { ...podcastEpisode, isCompleted: false } })
	}
	const seekSeconds = toPodcastEpisodeSeekSeconds({
		positionSeconds,
		durationSeconds: podcastEpisode.durationSeconds,
	})
	adapter.seek(seekSeconds)
	updatePodcastEpisodePlayerState({ positionSeconds: seekSeconds })
	refreshPodcastEpisodeMediaSession()
	toPodcastEpisodeAudioAdapter()?.onCheckpoint?.(toPodcastEpisodePlayerState())
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
	// save the progress, and report a playback start if the audio began playing
	if (isPlaying) {
		toPodcastEpisodeAudioAdapter()?.onPlaybackStarted?.()
		refreshPodcastEpisodeMediaSession()
		savePodcastEpisodeProgress({ isPlaybackStart: true, format: toPodcastEpisodePlayerState().format })
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
	// complete this load before requesting another episode. the format is read before the state changes
	const isFilmEnded = toPodcastEpisodePlayerState().format === "video"
	const version = retirePodcastEpisodeRequests()
	updatePodcastEpisodePlayerState({
		isPlaying: false,
		isLoading: false,
		podcastEpisode: { ...endedPodcastEpisode, isCompleted: true },
	})
	savePodcastEpisodeProgress({ isCompleted: true })
	toPodcastEpisodeAudioAdapter()?.onVisitEvent?.("visit_episode_completed", endedPodcastEpisode)
	// ask for the topic's next unplayed podcast episode for a signed-in user. a film and a Topic Post's discussion
	// end with nothing after them
	const isNextPodcastEpisodePlayed =
		isUserSignedIn() && !isFilmEnded && !toDiscussionTopicPostId(endedPodcastEpisode.id)
	const nextPodcastEpisode = isNextPodcastEpisodePlayed
		? await fetchNextUnplayedPodcastEpisode(endedPodcastEpisode.topicId).catch(() => null)
		: null

	// play it if no newer request started meanwhile
	if (nextPodcastEpisode && isPodcastEpisodeRequestCurrent(version)) {
		await playPodcastEpisode(nextPodcastEpisode)
	}
}
