// the browser audio element and voice effects for the shared podcast player
import {
	registerPodcastEpisodeAudioAdapter,
	reportPodcastEpisodeAudioEvent,
	savePodcastEpisodeProgress,
	skipPlaybackBy,
	skipPodcastEpisodeChapter,
	togglePlayback,
} from "@carlnotes/core/stores/podcastEpisodePlayerStore"
import { SKIP_BACK_SECONDS, SKIP_FORWARD_SECONDS, updatePodcastEpisodeMediaSession } from "@/lib/podcastEpisodePlayback"
import { addEventListeners } from "@/lib/utils"
import { captureEpisodeVisitEvent } from "@/lib/visitAnalytics"
import { endPodcastEpisodeQuestion } from "./podcastEpisodeQuestionStore"
import { stopSpokenAnswer } from "./spokenAnswerStore"

export { setIsUserSignedIn } from "@carlnotes/core/stores/podcastEpisodeListenStore"
// expose shared state and actions to the browser's player and voice controls
export {
	cyclePlaybackRate,
	pausePodcastEpisode,
	playPodcastEpisode,
	refreshPodcastEpisodeMediaSession,
	resumePodcastEpisode,
	seekPlaybackTo,
	skipPlaybackBy,
	togglePlayback,
	toLoadedPodcastEpisode,
	toPlayerChapterPosition,
	toPodcastEpisodeQuestionStart,
	unloadPodcastEpisode,
	useIsPodcastEpisodePlaying,
	useIsPodcastPlayerShown,
	usePlayerChapter,
	usePlayerChapterPosition,
	usePlayerPositionSeconds,
	usePodcastEpisodePlayer,
} from "@carlnotes/core/stores/podcastEpisodePlayerStore"

/**
 * Binds the browser's mounted audio element and page lifecycle to the shared player.
 */
export function registerPodcastEpisodeAudio(audioElement: HTMLAudioElement): () => void {
	// bind each event to the current load identity
	let loadId = 0
	const reportPosition = (): void =>
		reportPodcastEpisodeAudioEvent({ type: "position", loadId, positionSeconds: audioElement.currentTime })
	const reportPlayback = (isPlaying: boolean): void =>
		reportPodcastEpisodeAudioEvent({ type: "playback", loadId, isPlaying })
	const unregisterAdapter = registerPodcastEpisodeAudioAdapter({
		load: (options) => {
			loadId = options.loadId
			audioElement.src = options.podcastEpisode.audioUrl ?? ""
			audioElement.currentTime = options.positionSeconds
			audioElement.playbackRate = options.playbackRate
		},
		play: () => audioElement.play(),
		pause: () => audioElement.pause(),
		seek: (positionSeconds) => {
			audioElement.currentTime = positionSeconds
		},
		setPlaybackRate: (playbackRate) => {
			audioElement.playbackRate = playbackRate
		},
		unload: () => {
			loadId = -1
			audioElement.pause()
			audioElement.removeAttribute("src")
		},
		updateMetadata: ({ podcastEpisode, positionSeconds }) => {
			if (podcastEpisode) {
				updatePodcastEpisodeMediaSession(podcastEpisode, positionSeconds, {
					togglePlayback,
					skipChapter: skipPodcastEpisodeChapter,
					skipBack: () => skipPlaybackBy(-SKIP_BACK_SECONDS),
					skipForward: () => skipPlaybackBy(SKIP_FORWARD_SECONDS),
				})
			}
		},
		onPlaybackStarted: () => {
			endPodcastEpisodeQuestion("played")
			stopSpokenAnswer()
		},
		onSeek: () => endPodcastEpisodeQuestion("skipped"),
		onVisitEvent: captureEpisodeVisitEvent,
	})

	// save progress before the browser hides or leaves the page
	const handleVisibilityChange = (): void => {
		if (document.visibilityState === "hidden") {
			savePodcastEpisodeProgress()
		}
	}
	const handlePageHide = (): void => savePodcastEpisodeProgress()
	const removeAudioListeners = addEventListeners(audioElement, [
		["timeupdate", reportPosition],
		["play", () => reportPlayback(true)],
		["pause", () => reportPlayback(false)],
		["ended", () => reportPodcastEpisodeAudioEvent({ type: "ended", loadId })],
		["error", () => reportPodcastEpisodeAudioEvent({ type: "error", loadId })],
	])
	document.addEventListener("visibilitychange", handleVisibilityChange)
	window.addEventListener("pagehide", handlePageHide)
	return () => {
		removeAudioListeners()
		document.removeEventListener("visibilitychange", handleVisibilityChange)
		window.removeEventListener("pagehide", handlePageHide)
		unregisterAdapter()
	}
}
