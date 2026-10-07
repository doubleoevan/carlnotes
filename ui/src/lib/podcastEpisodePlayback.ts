// the playback helpers that hold no state: the chapter at a position, and the lock screen's media session
import type { PodcastEpisode, PodcastEpisodeChapter } from "@shared/contracts"
import { PODCAST_NAME } from "@shared/podcastEpisodes"

// what the lock screen's controls call: play or pause, skip to the next or the previous chapter, and skip by seconds
export type MediaSessionControls = {
	togglePlayback: () => void
	skipChapter: (direction: 1 | -1) => void
	skipBack: () => void
	skipForward: () => void
}

/**
 * Returns the index of the chapter playing at a position, or -1 if the podcast episode has no chapters.
 */
export function toChapterIndexAt(chapters: PodcastEpisodeChapter[], positionSeconds: number): number {
	const chapterIndex = chapters.findLastIndex((chapter) => chapter.startSeconds <= positionSeconds)
	return chapters.length > 0 ? Math.max(chapterIndex, 0) : -1
}

/**
 * Names the podcast episode and the player's chapter on the lock screen, and sets what the lock screen's controls do.
 */
export function updatePodcastEpisodeMediaSession(
	podcastEpisode: PodcastEpisode,
	positionSeconds: number,
	mediaSessionControls: MediaSessionControls,
): void {
	if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
		return
	}

	// show the player's chapter, the podcast episode's title, the hosts, and the cover at each size on the lock screen
	const playerChapter = podcastEpisode.chapters[toChapterIndexAt(podcastEpisode.chapters, positionSeconds)]
	const artwork = [
		...(podcastEpisode.smallCoverUrl
			? [{ src: podcastEpisode.smallCoverUrl, sizes: "600x600", type: "image/jpeg" }]
			: []),
		...(podcastEpisode.coverUrl ? [{ src: podcastEpisode.coverUrl, sizes: "3000x3000", type: "image/jpeg" }] : []),
	]
	navigator.mediaSession.metadata = new MediaMetadata({
		title: playerChapter?.title ?? podcastEpisode.title ?? PODCAST_NAME,
		artist: "Carl and Vienna",
		album: podcastEpisode.title ?? PODCAST_NAME,
		artwork,
	})

	// set what the lock screen's play, pause, chapter skip, and skip back and forward controls do
	navigator.mediaSession.setActionHandler("play", mediaSessionControls.togglePlayback)
	navigator.mediaSession.setActionHandler("pause", mediaSessionControls.togglePlayback)
	navigator.mediaSession.setActionHandler("nexttrack", () => mediaSessionControls.skipChapter(1))
	navigator.mediaSession.setActionHandler("previoustrack", () => mediaSessionControls.skipChapter(-1))
	navigator.mediaSession.setActionHandler("seekbackward", mediaSessionControls.skipBack)
	navigator.mediaSession.setActionHandler("seekforward", mediaSessionControls.skipForward)
}
