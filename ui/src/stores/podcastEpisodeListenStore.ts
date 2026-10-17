// a signed-in user's listening: whether the user is signed in, the progress saves in a podcast episode, and whether
// the loaded episode's playback start was saved
import type { PodcastEpisode } from "@shared/contracts/podcast"
import type { PodcastEpisodeListenPayload } from "@shared/payloads"
import { sendPodcastEpisodeListen } from "@/clients/podcastEpisodeClient"

// how often a playing podcast episode saves the user's progress
const LISTEN_SAVE_INTERVAL_MS = 30_000

// whether the user is signed in. only a signed-in user's progress is saved
let isSignedIn = false

// when the user's progress was last saved, and whether the loaded podcast episode's playback start was saved
let lastListenSavedAt = 0
let hasSavedPlaybackStart = false

export type SavePodcastEpisodeListenOptions = {
	podcastEpisode: PodcastEpisode
	positionSeconds: number
	// whether playback just started or just finished
	listen?: Omit<PodcastEpisodeListenPayload, "progressSeconds">
}

/**
 * Sets whether the user is signed in. Only a signed-in user's progress is saved.
 */
export function setIsUserSignedIn(isUserSignedIn: boolean): void {
	isSignedIn = isUserSignedIn
}

/**
 * Returns whether the user is signed in.
 */
export function isUserSignedIn(): boolean {
	return isSignedIn
}

/**
 * Saves a signed-in user's progress in a podcast episode, with whether playback just started or just finished.
 * A playback start is saved once per load.
 */
export function savePodcastEpisodeListen({
	podcastEpisode,
	positionSeconds,
	listen = {},
}: SavePodcastEpisodeListenOptions): void {
	// the first play of a loaded episode saves its playback start, and a later play saves nothing
	if (listen.isPlaybackStart) {
		if (hasSavedPlaybackStart) {
			return
		}
		hasSavedPlaybackStart = true
	}

	// only a signed-in user's progress is saved
	if (!isSignedIn) {
		return
	}
	lastListenSavedAt = Date.now()
	sendPodcastEpisodeListen(podcastEpisode.id, { progressSeconds: Math.floor(positionSeconds), ...listen })
}

/**
 * Returns whether the save interval has passed since the user's progress was last saved.
 */
export function isPodcastEpisodeListenDue(): boolean {
	return Date.now() - lastListenSavedAt >= LISTEN_SAVE_INTERVAL_MS
}

/**
 * Forgets that the loaded podcast episode's playback start was saved, for the episode loading in its place.
 */
export function resetPodcastEpisodePlaybackStart(): void {
	hasSavedPlaybackStart = false
}
