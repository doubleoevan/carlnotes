// the browser audio element, the binding its film element shares, and voice effects for the shared podcast player
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type {
	PodcastEpisodePlayerState,
	TopicPodcastEpisodeVideoAdapter,
} from "@carlnotes/core/lib/podcastEpisodeAudio"
import {
	registerPodcastEpisodeAudioAdapter,
	reportPodcastEpisodeAudioEvent,
	savePodcastEpisodeProgress,
	skipPlaybackBy,
	skipPodcastEpisodeChapter,
	togglePlayback,
} from "@carlnotes/core/stores/podcastEpisodePlayerStore"
import { PODCAST_EPISODE_QUESTION_AUDIO_CALLBACKS } from "@carlnotes/core/stores/podcastEpisodeQuestionStore"
import { SKIP_BACK_SECONDS, SKIP_FORWARD_SECONDS, updatePodcastEpisodeMediaSession } from "@/lib/podcastEpisodePlayback"
import { addEventListeners } from "@/lib/utils"
import { captureEpisodeVisitEvent, captureFilmVisitEvent } from "@/lib/visitAnalytics"

export { setIsUserSignedIn } from "@carlnotes/core/stores/podcastEpisodeListenStore"
// expose shared state and actions to the browser's player and voice controls
export {
	playPodcastEpisode,
	seekPlaybackTo,
	toLoadedPodcastEpisode,
	unloadPodcastEpisode,
	useIsPodcastPlayerShown,
	usePlayerChapterPosition,
	usePodcastEpisodePlayer,
} from "@carlnotes/core/stores/podcastEpisodePlayerStore"

/**
 * Binds the browser's mounted audio element and page lifecycle to the shared player.
 */
export function registerPodcastEpisodeAudio(audioElement: HTMLAudioElement): () => void {
	// register the element as the shared player's audio adapter, with the spoken questions and the visit events
	const audioElementBinding = bindPodcastEpisodeMediaElement({
		mediaElement: audioElement,
		toSourceUrl: (podcastEpisode) => podcastEpisode.audioUrl,
	})
	const unregisterAdapter = registerPodcastEpisodeAudioAdapter({
		...audioElementBinding.adapter,
		...PODCAST_EPISODE_QUESTION_AUDIO_CALLBACKS,
		onVisitEvent: captureEpisodeVisitEvent,
		onFormatSwitched: (podcastEpisode, format) =>
			captureFilmVisitEvent("visit_episode_format_switched", { podcastEpisodeId: podcastEpisode.id, format }),
	})

	// save progress before the browser hides or leaves the page
	const handleVisibilityChange = (): void => {
		if (document.visibilityState === "hidden") {
			savePodcastEpisodeProgress()
		}
	}
	const handlePageHide = (): void => savePodcastEpisodeProgress()
	document.addEventListener("visibilitychange", handleVisibilityChange)
	window.addEventListener("pagehide", handlePageHide)

	// return the call that removes every listener and the adapter
	return () => {
		audioElementBinding.removeListeners()
		document.removeEventListener("visibilitychange", handleVisibilityChange)
		window.removeEventListener("pagehide", handlePageHide)
		unregisterAdapter()
	}
}

// the media element that a format plays in, and the url of its source for a podcast episode
type BindPodcastEpisodeMediaElementOptions = {
	mediaElement: HTMLMediaElement
	toSourceUrl: (podcastEpisode: PodcastEpisode) => string | null
}

/**
 * Drives a media element from the shared player and reports its events under the current load.
 */
export function bindPodcastEpisodeMediaElement({ mediaElement, toSourceUrl }: BindPodcastEpisodeMediaElementOptions): {
	adapter: TopicPodcastEpisodeVideoAdapter
	removeListeners: () => void
} {
	// bind each event to the current load identity
	let loadId = 0
	const reportPosition = (): void =>
		reportPodcastEpisodeAudioEvent({ type: "position", loadId, positionSeconds: mediaElement.currentTime })
	const reportPlayback = (isPlaying: boolean): void =>
		reportPodcastEpisodeAudioEvent({ type: "playback", loadId, isPlaying })
	const removeListeners = addEventListeners(mediaElement, [
		["timeupdate", reportPosition],
		["play", () => reportPlayback(true)],
		["pause", () => reportPlayback(false)],
		["ended", () => reportPodcastEpisodeAudioEvent({ type: "ended", loadId })],
		["error", () => reportPodcastEpisodeAudioEvent({ type: "error", loadId })],
	])

	// the source operations on the element
	const adapter: TopicPodcastEpisodeVideoAdapter = {
		load: (options) => {
			// point the element at the loaded podcast episode, its position, and its speed
			loadId = options.loadId
			mediaElement.src = toSourceUrl(options.podcastEpisode) ?? ""
			mediaElement.currentTime = options.positionSeconds
			mediaElement.playbackRate = options.playbackRate
		},
		play: () => mediaElement.play(),
		pause: () => mediaElement.pause(),
		seek: (positionSeconds) => {
			mediaElement.currentTime = positionSeconds
		},
		setPlaybackRate: (playbackRate) => {
			mediaElement.playbackRate = playbackRate
		},
		unload: () => {
			loadId = -1
			mediaElement.pause()
			mediaElement.removeAttribute("src")
		},
		updateMetadata: updateBrowserMediaSession,
	}
	return { adapter, removeListeners }
}

// show the loaded podcast episode in the browser's media controls, with its play, chapter, and skip actions
function updateBrowserMediaSession({ podcastEpisode, positionSeconds }: PodcastEpisodePlayerState): void {
	if (podcastEpisode) {
		updatePodcastEpisodeMediaSession(podcastEpisode, positionSeconds, {
			togglePlayback,
			skipChapter: skipPodcastEpisodeChapter,
			skipBack: () => skipPlaybackBy(-SKIP_BACK_SECONDS),
			skipForward: () => skipPlaybackBy(SKIP_FORWARD_SECONDS),
		})
	}
}
