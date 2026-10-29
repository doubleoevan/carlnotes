import type { PodcastEpisode, PodcastEpisodeChapter } from "@carlnotes/contracts/podcast"
import type { PodcastEpisodePlayerState } from "../lib/podcastEpisodeAudio"
import { toChapterIndexAt } from "../lib/podcastEpisodePlayback"
import { toStoreListeners } from "./storeListeners"

// playback state outlives the screen that started the episode
let playerState: PodcastEpisodePlayerState = {
	podcastEpisode: null,
	isPlaying: false,
	isLoading: false,
	positionSeconds: 0,
	playbackRate: 1,
	errorMessage: null,
}
const { publish, useStoreVersion } = toStoreListeners()
const { publish: publishPosition, useStoreVersion: usePositionVersion } = toStoreListeners()

/**
 * Returns the episode and playback state without subscribing to every position tick.
 */
export function usePodcastEpisodePlayer(): Omit<PodcastEpisodePlayerState, "positionSeconds"> {
	useStoreVersion()
	return playerState
}

/**
 * Returns the current state for platform lifecycle and persistence adapters.
 */
export function toPodcastEpisodePlayerState(): Readonly<PodcastEpisodePlayerState> {
	return playerState
}

/**
 * Returns the playback position and subscribes to its changes.
 */
export function usePlayerPositionSeconds(): number {
	usePositionVersion()
	return playerState.positionSeconds
}

/**
 * Returns the loaded episode's current chapter.
 */
export function usePlayerChapter(): PodcastEpisodeChapter | undefined {
	useStoreVersion()
	return toPlayerChapter()
}

/**
 * Returns the current chapter position for the named episode.
 */
export function usePlayerChapterPosition(podcastEpisodeId: string): number | undefined {
	useStoreVersion()
	return toPlayerChapterPosition(podcastEpisodeId)
}

/**
 * Returns the loaded episode without subscribing to changes.
 */
export function toLoadedPodcastEpisode(): PodcastEpisode | null {
	return playerState.podcastEpisode
}

/**
 * Returns the selected chapter position when the named episode is loaded.
 */
export function toPlayerChapterPosition(podcastEpisodeId: string): number | undefined {
	return playerState.podcastEpisode?.id === podcastEpisodeId ? toPlayerChapter()?.position : undefined
}

/**
 * Returns the episode and chapter a spoken question would address.
 */
export function toPodcastEpisodeQuestionStart(): {
	podcastEpisode: PodcastEpisode
	chapterPosition: number
	isPlaying: boolean
} | null {
	// select the loaded episode's current chapter
	const { podcastEpisode, isPlaying } = playerState
	const playerChapter = toPlayerChapter()
	return podcastEpisode && playerChapter ? { podcastEpisode, chapterPosition: playerChapter.position, isPlaying } : null
}

/**
 * Reports whether a loaded episode has a visible player.
 */
export function useIsPodcastPlayerShown(): boolean {
	useStoreVersion()
	return playerState.podcastEpisode !== null
}

/**
 * Reports whether the named episode is playing.
 */
export function useIsPodcastEpisodePlaying(podcastEpisodeId: string | undefined): boolean {
	useStoreVersion()
	return playerState.isPlaying && podcastEpisodeId !== undefined && playerState.podcastEpisode?.id === podcastEpisodeId
}

/**
 * Publishes progress separately and reports whether its selected chapter changed.
 */
export function updatePodcastEpisodePosition(positionSeconds: number): boolean {
	// notify chapter subscribers only when playback crosses a chapter boundary
	const previousChapter = toPlayerChapter()
	playerState = { ...playerState, positionSeconds }
	publishPosition()
	const hasChapterChanged = toPlayerChapter() !== previousChapter
	if (hasChapterChanged) {
		publish()
	}
	return hasChapterChanged
}

/**
 * Publishes a discrete playback-state change to both sets of subscribers.
 */
export function updatePodcastEpisodePlayerState(stateChange: Partial<PodcastEpisodePlayerState>): void {
	// publish controls and progress together after a discrete action
	playerState = { ...playerState, ...stateChange }
	publish()
	publishPosition()
}

function toPlayerChapter(): PodcastEpisodeChapter | undefined {
	const chapters = playerState.podcastEpisode?.chapters ?? []
	return chapters[toChapterIndexAt(chapters, playerState.positionSeconds)]
}
