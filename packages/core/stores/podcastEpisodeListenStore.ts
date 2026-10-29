// a signed-in user's listening: whether the user is signed in, the progress saves in a podcast episode, and whether
// the loaded episode's playback start was saved

import { sendPodcastEpisodeListen } from "@carlnotes/client/podcastEpisodeClient"
import type { PodcastEpisodeListenPayload } from "@carlnotes/contracts/payloads"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"

// how often a playing podcast episode saves the user's progress
const LISTEN_SAVE_INTERVAL_MS = 30_000

// whether the user is signed in. only a signed-in user's progress is saved
let isSignedIn = false
let accountId: string | null = null
let accountRequest: AbortController | undefined

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
 * Retires queued progress writes when the mobile account changes or exits.
 */
export function setPodcastEpisodeListenAccount(userId: string | null): void {
	if (accountId === userId) {
		return
	}
	// retire the previous account before accepting new progress writes
	accountRequest?.abort()
	accountRequest = new AbortController()
	accountId = userId
	isSignedIn = userId !== null
	resetPodcastEpisodePlaybackStart()
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
	sendPodcastEpisodeListen({
		podcastEpisodeId: podcastEpisode.id,
		podcastEpisodeListen: { progressSeconds: Math.floor(positionSeconds), ...listen },
		signal: accountRequest?.signal,
	})
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
