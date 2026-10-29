// the browser media session adapter for shared podcast playback rules
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { toPodcastEpisodeMediaMetadata } from "@carlnotes/core/lib/podcastEpisodePlayback"

// the shared playback rules exposed beside the browser media session
export {
	SKIP_BACK_SECONDS,
	SKIP_FORWARD_SECONDS,
	toChapterAtPosition,
	toChapterIndexAt,
	toNextPlaybackRate,
	toPodcastEpisodeSpeakerMediaMetadata,
} from "@carlnotes/core/lib/podcastEpisodePlayback"

// the commands exposed by the browser's system player
export type MediaSessionControls = {
	togglePlayback: () => void
	skipChapter: (direction: 1 | -1) => void
	skipBack: () => void
	skipForward: () => void
}

/**
 * Returns whether the browser has a media session, which the lock screen shows. A server render has none.
 */
export function isMediaSessionAvailable(): boolean {
	return typeof navigator !== "undefined" && "mediaSession" in navigator
}

/**
 * Names the podcast episode and the player's chapter on the lock screen, and sets what the lock screen's controls do.
 */
export function updatePodcastEpisodeMediaSession(
	podcastEpisode: PodcastEpisode,
	positionSeconds: number,
	mediaSessionControls: MediaSessionControls,
): void {
	if (!isMediaSessionAvailable()) {
		return
	}

	// show the player's chapter, the podcast episode's title, the hosts, and the cover at each size on the lock screen
	navigator.mediaSession.metadata = new MediaMetadata(toPodcastEpisodeMediaMetadata(podcastEpisode, positionSeconds))

	// set what the lock screen's play, pause, chapter skip, and skip back and forward controls do
	navigator.mediaSession.setActionHandler("play", mediaSessionControls.togglePlayback)
	navigator.mediaSession.setActionHandler("pause", mediaSessionControls.togglePlayback)
	navigator.mediaSession.setActionHandler("nexttrack", () => mediaSessionControls.skipChapter(1))
	navigator.mediaSession.setActionHandler("previoustrack", () => mediaSessionControls.skipChapter(-1))
	navigator.mediaSession.setActionHandler("seekbackward", mediaSessionControls.skipBack)
	navigator.mediaSession.setActionHandler("seekforward", mediaSessionControls.skipForward)
}
