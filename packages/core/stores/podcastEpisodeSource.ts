// the platform players the podcast episode player drives and the source one of them holds: which adapter owns each
// format, which load and which request is current, and how a source is loaded, released, and reloaded

import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { PodcastEpisodeAudioAdapter, TopicPodcastEpisodeVideoAdapter } from "../lib/podcastEpisodeAudio"
import { PODCAST_EPISODE_PLAY_FAILED_TEXT } from "../lib/podcastEpisodeCopy"
import { toPodcastEpisodeSeekSeconds } from "../lib/podcastEpisodePlayback"
import { toPodcastEpisodePlayerState, updatePodcastEpisodePlayerState } from "./podcastEpisodePlayerState"

// one platform owner per format. the load and the request identities reject events and delayed work from a source
// the player has already left, and the reload time limits how often a failed audio source is loaded again
let audioAdapter: PodcastEpisodeAudioAdapter | null = null
let videoAdapter: TopicPodcastEpisodeVideoAdapter | null = null
let hasLoadedSource = false
let loadId = 0
let requestVersion = 0
let lastAudioReloadAt = 0
const AUDIO_RELOAD_INTERVAL_MS = 10_000

/**
 * Makes the given adapter the owner of the audio format, or clears the owner with null.
 */
export function setPodcastEpisodeAudioAdapter(adapter: PodcastEpisodeAudioAdapter | null): void {
	audioAdapter = adapter
}

/**
 * Returns the audio format's adapter, which also reports the app's analytics and checkpoints.
 */
export function toPodcastEpisodeAudioAdapter(): PodcastEpisodeAudioAdapter | null {
	return audioAdapter
}

/**
 * Makes the given film player the owner of the video format, or clears the owner with null.
 */
export function setTopicPodcastEpisodeVideoAdapter(adapter: TopicPodcastEpisodeVideoAdapter | null): void {
	videoAdapter = adapter
}

/**
 * Returns the video format's film player.
 */
export function toTopicPodcastEpisodeVideoAdapter(): TopicPodcastEpisodeVideoAdapter | null {
	return videoAdapter
}

/**
 * Returns the adapter of the format that plays.
 */
export function toPodcastEpisodeSourceAdapter(): TopicPodcastEpisodeVideoAdapter | null {
	return toPodcastEpisodePlayerState().format === "video" ? videoAdapter : audioAdapter
}

/**
 * Returns a podcast episode's source url in the format that plays, or null if it has none in that format.
 */
export function toPodcastEpisodeSourceUrl(podcastEpisode: PodcastEpisode): string | null {
	return toPodcastEpisodePlayerState().format === "video"
		? (podcastEpisode.video?.videoUrl ?? null)
		: podcastEpisode.audioUrl
}

/**
 * Reports whether the playing format holds a loaded source.
 */
export function isPodcastEpisodeSourceLoaded(): boolean {
	return hasLoadedSource
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
 * Reports whether a platform event comes from the source that is loaded now.
 */
export function isPodcastEpisodeLoadCurrent(eventLoadId: number): boolean {
	return eventLoadId === loadId
}

/**
 * Publishes the current episode and chapter to the app's system controls.
 */
export function refreshPodcastEpisodeMediaSession(): void {
	toPodcastEpisodeSourceAdapter()?.updateMetadata(toPodcastEpisodePlayerState())
}

/**
 * Pauses and releases the playing format's source, and retires its events.
 */
export function releasePodcastEpisodeSource(): void {
	const adapter = toPodcastEpisodeSourceAdapter()
	adapter?.pause()
	adapter?.unload()
	retirePodcastEpisodeLoad()
}

// the podcast episode to load, the second it starts from, and the adapter that holds it
type LoadPodcastEpisodeSourceOptions = {
	podcastEpisode: PodcastEpisode
	positionSeconds: number
	adapter: TopicPodcastEpisodeVideoAdapter
}

/**
 * Points an adapter at a podcast episode's source and marks it ready, if no newer load started meanwhile.
 */
export async function loadPodcastEpisodeSource({
	podcastEpisode,
	positionSeconds: requestedSeconds,
	adapter,
}: LoadPodcastEpisodeSourceOptions): Promise<void> {
	// retire the earlier source's events before releasing it
	const currentLoadId = retirePodcastEpisodeLoad()
	adapter.unload()
	// show the podcast episode loading at the requested second
	const positionSeconds = toPodcastEpisodeSeekSeconds({
		positionSeconds: requestedSeconds,
		durationSeconds: podcastEpisode.durationSeconds,
	})
	updatePodcastEpisodePlayerState({
		podcastEpisode: { ...podcastEpisode, isCompleted: false },
		positionSeconds,
		isPlaying: false,
		isLoading: true,
		errorMessage: null,
	})
	// load the source, and mark it ready if no newer load started meanwhile
	await adapter.load({
		podcastEpisode,
		positionSeconds,
		playbackRate: toPodcastEpisodePlayerState().playbackRate,
		loadId: currentLoadId,
	})
	if (currentLoadId === loadId) {
		hasLoadedSource = true
		updatePodcastEpisodePlayerState({ isLoading: false })
		refreshPodcastEpisodeMediaSession()
	}
}

/**
 * Plays the loaded source again, and shows the play error if the attempt fails.
 */
export async function resumePodcastEpisodeSource(
	adapter: TopicPodcastEpisodeVideoAdapter,
	version: number,
): Promise<void> {
	try {
		await adapter.play()
	} catch {
		// show the play error if this adapter and request are still current
		if (toPodcastEpisodeSourceAdapter() === adapter && isPodcastEpisodeRequestCurrent(version)) {
			updatePodcastEpisodePlayerState({ isPlaying: false, errorMessage: PODCAST_EPISODE_PLAY_FAILED_TEXT })
		}
	}
}

/**
 * Loads the selected episode's source again after an audio error, at its position and rate, and plays it on if it was
 * playing. A second error inside the reload interval shows the play error instead.
 */
export async function reloadPodcastEpisodeAudio(): Promise<void> {
	// retry only the selected episode and retain its position and rate
	const { podcastEpisode, positionSeconds, isPlaying } = toPodcastEpisodePlayerState()
	const adapter = toPodcastEpisodeSourceAdapter()
	if (!adapter || !podcastEpisode) {
		return
	}
	if (Date.now() - lastAudioReloadAt < AUDIO_RELOAD_INTERVAL_MS) {
		adapter.pause()
		updatePodcastEpisodePlayerState({
			isPlaying: false,
			isLoading: false,
			errorMessage: PODCAST_EPISODE_PLAY_FAILED_TEXT,
		})
		return
	}
	// refresh the source without counting another playback start
	lastAudioReloadAt = Date.now()
	const version = requestVersion
	updatePodcastEpisodePlayerState({ isLoading: true })
	try {
		await adapter.load({
			podcastEpisode,
			positionSeconds,
			playbackRate: toPodcastEpisodePlayerState().playbackRate,
			loadId,
		})
		// end the loading state and resume a playing podcast episode, if this request is still current
		if (isPodcastEpisodeRequestCurrent(version)) {
			updatePodcastEpisodePlayerState({ isLoading: false })
			refreshPodcastEpisodeMediaSession()
		}
		if (isPlaying && isPodcastEpisodeRequestCurrent(version)) {
			await adapter.play()
		}
	} catch {
		// show the play error if this request is still current
		if (isPodcastEpisodeRequestCurrent(version)) {
			updatePodcastEpisodePlayerState({
				isPlaying: false,
				isLoading: false,
				errorMessage: PODCAST_EPISODE_PLAY_FAILED_TEXT,
			})
		}
	}
}

// start a new load identity, so events from the one before it are rejected, and return it
function retirePodcastEpisodeLoad(): number {
	loadId += 1
	hasLoadedSource = false
	lastAudioReloadAt = 0
	return loadId
}
