// the browser's one film element. it outlives every page, so a film in picture-in-picture keeps playing while the
// user browses. a film player shows the element in its frame while its film is loaded, and the element waits in a
// hidden host the rest of the time. a film that returns from picture-in-picture on a page with no film player names
// its podcast episode, which the layout shows in the Video dialog
import {
	registerTopicPodcastEpisodeVideoAdapter,
	returnToPodcastEpisodeAudio,
	toLoadedPodcastEpisode,
} from "@carlnotes/core/stores/podcastEpisodePlayerStore"
import { toStoreListeners } from "@carlnotes/core/stores/storeListeners"
import { bindPodcastEpisodeMediaElement } from "./podcastEpisodePlayerStore"

// how long after a picture-in-picture window closes the film settles. its close button pauses the film, and its
// return button leaves the film playing
const PICTURE_IN_PICTURE_LEAVE_SETTLE_MS = 150

// a podcast episode whose film returned from picture-in-picture on a page with no film player
type ReturnedPodcastEpisode = { id: string; title: string | null }

// a film element in Safari on iPhone, which enters fullscreen through its own call
type WebkitVideoElement = HTMLVideoElement & { webkitEnterFullscreen?: () => void }

// the film element and the hidden host it waits in
type TopicPodcastEpisodeVideoElements = { videoElement: WebkitVideoElement; hostElement: HTMLDivElement }

// the elements, created on first use in the browser, and whether the film's captions show
let videoElements: TopicPodcastEpisodeVideoElements | null = null
let isCaptionsShown = true

// the podcast episode whose returned film the layout shows in the Video dialog, or null
let returnedPodcastEpisode: ReturnedPodcastEpisode | null = null
const { publish, useStoreVersion } = toStoreListeners()

/**
 * Reads the podcast episode whose film returned from picture-in-picture on a page with no film player, or null.
 */
export function useReturnedTopicPodcastEpisodeVideo(): ReturnedPodcastEpisode | null {
	useStoreVersion()
	return returnedPodcastEpisode
}

/**
 * Forgets the returned film, once its dialog closes or the film goes back into picture-in-picture.
 */
export function clearReturnedTopicPodcastEpisodeVideo(): void {
	if (returnedPodcastEpisode) {
		returnedPodcastEpisode = null
		publish()
	}
}

/**
 * Shows the film element in a film player's frame.
 */
export function showTopicPodcastEpisodeVideoElement(frameElement: HTMLElement): void {
	frameElement.append(toVideoElements().videoElement)
}

/**
 * Takes the film element out of a frame. A film in picture-in-picture plays on, a film that another frame shows right
 * away plays on, and any other pauses for the audio.
 */
export function hideTopicPodcastEpisodeVideoElement(frameElement: HTMLElement, podcastEpisodeId: string): void {
	const { videoElement, hostElement } = toVideoElements()
	if (videoElement.parentElement !== frameElement) {
		return
	}
	// move the element to its host. a film in picture-in-picture, or another podcast episode's film, is left as it is
	hostElement.append(videoElement)
	const isInPictureInPicture = document.pictureInPictureElement === videoElement
	if (isInPictureInPicture || toLoadedPodcastEpisode()?.id !== podcastEpisodeId) {
		return
	}
	// pause the frame's own film once this commit ends, unless a film player took the element back in the same
	// commit, as a remount and the next page's player do
	queueMicrotask(() => {
		if (videoElement.parentElement === hostElement && toLoadedPodcastEpisode()?.id === podcastEpisodeId) {
			returnToPodcastEpisodeAudio()
		}
	})
}

/**
 * Shows or hides the film's captions, now and once a newly loaded film reads its track.
 */
export function showTopicPodcastEpisodeVideoCaptions(isShown: boolean): void {
	isCaptionsShown = isShown
	applyCaptions(toVideoElements().videoElement)
}

/**
 * Turns the film's sound off or on. The podcast episode's audio keeps its own sound.
 */
export function muteTopicPodcastEpisodeVideo(isMuted: boolean): void {
	toVideoElements().videoElement.muted = isMuted
}

/**
 * Reports whether this browser shows a film on the whole screen and in picture-in-picture.
 */
export function toTopicPodcastEpisodeVideoSupport(): { hasFullscreen: boolean; hasPictureInPicture: boolean } {
	// the standard fullscreen call or Safari on iPhone's own. Firefox offers pages no picture-in-picture
	const videoPrototype = HTMLVideoElement.prototype
	return {
		hasFullscreen: "requestFullscreen" in videoPrototype || "webkitEnterFullscreen" in videoPrototype,
		hasPictureInPicture: Boolean(document.pictureInPictureEnabled),
	}
}

/**
 * Shows the film on the whole screen, with the browser's own controls.
 */
export function enterTopicPodcastEpisodeVideoFullscreen(): void {
	const { videoElement } = toVideoElements()
	if (typeof videoElement.requestFullscreen === "function") {
		void videoElement.requestFullscreen().catch(() => {})
		return
	}
	// Safari on iPhone enters fullscreen only once it knows the film's size
	runOnceFilmSizeIsKnown(videoElement, () => videoElement.webkitEnterFullscreen?.())
}

/**
 * Moves the film into the browser's floating picture-in-picture window.
 */
export function enterTopicPodcastEpisodeVideoPictureInPicture(): void {
	const { videoElement } = toVideoElements()
	runOnceFilmSizeIsKnown(videoElement, () => void videoElement.requestPictureInPicture().catch(() => {}))
}

// the film element in its hidden host, created and registered as the shared player's video adapter on first use
function toVideoElements(): TopicPodcastEpisodeVideoElements {
	if (videoElements) {
		return videoElements
	}
	// the film element, which plays inline over its frame's poster
	const videoElement: WebkitVideoElement = document.createElement("video")
	videoElement.preload = "none"
	videoElement.playsInline = true
	videoElement.className = "absolute inset-0 size-full object-contain"

	// the track that each film's captions load into
	const captionsTrackElement = document.createElement("track")
	captionsTrackElement.kind = "captions"
	captionsTrackElement.srclang = "en"
	captionsTrackElement.label = "English"
	captionsTrackElement.default = true
	videoElement.append(captionsTrackElement)

	// the host, out of sight and out of the accessibility tree, at a size that keeps the film playing
	const hostElement = document.createElement("div")
	hostElement.className = "pointer-events-none fixed top-0 left-0 size-px overflow-hidden opacity-0"
	hostElement.setAttribute("aria-hidden", "true")
	hostElement.append(videoElement)
	document.body.append(hostElement)

	// drive the element from the shared player for as long as the app is open
	const videoElementBinding = bindPodcastEpisodeMediaElement({
		mediaElement: videoElement,
		toSourceUrl: (podcastEpisode) => podcastEpisode.video?.videoUrl ?? null,
	})
	registerTopicPodcastEpisodeVideoAdapter({
		...videoElementBinding.adapter,
		load: (options) => {
			// name the film and point the track at its captions before the film loads
			const { title, video } = options.podcastEpisode
			videoElement.setAttribute("aria-label", title ? `Film of ${title}` : "Film")
			captionsTrackElement.src = video?.captionsUrl ?? ""
			return videoElementBinding.adapter.load(options)
		},
		unload: () => {
			// close the film's picture-in-picture window, release the film, and empty the element
			if (document.pictureInPictureElement === videoElement) {
				void document.exitPictureInPicture().catch(() => {})
			}
			videoElementBinding.adapter.unload()
			videoElement.load()
		},
	})

	// show the captions choice on each loaded film, and the browser's controls only while the film fills the screen
	videoElement.addEventListener("loadedmetadata", () => applyCaptions(videoElement))
	document.addEventListener("fullscreenchange", () => {
		videoElement.controls = document.fullscreenElement === videoElement
	})
	// a picture-in-picture window that closes while no film player shows the element. its return button leaves the
	// film playing, so the film opens in the Video dialog on the page the user is on. its close button pauses the
	// film, which goes back to the audio
	videoElement.addEventListener("leavepictureinpicture", () => {
		window.setTimeout(() => {
			// a film player took the element back, so the picture is on the page
			if (videoElement.parentElement !== hostElement) {
				return
			}
			// a paused film was closed, so it goes back to the audio
			const loadedPodcastEpisode = toLoadedPodcastEpisode()
			if (videoElement.paused || !loadedPodcastEpisode) {
				returnToPodcastEpisodeAudio()
				return
			}
			// a film that still plays was returned, so the layout opens it in the Video dialog
			returnedPodcastEpisode = { id: loadedPodcastEpisode.id, title: loadedPodcastEpisode.title }
			publish()
		}, PICTURE_IN_PICTURE_LEAVE_SETTLE_MS)
	})

	// a film that goes back into picture-in-picture closes the dialog it returned to
	videoElement.addEventListener("enterpictureinpicture", clearReturnedTopicPodcastEpisodeVideo)
	videoElements = { videoElement, hostElement }
	return videoElements
}

// show or hide every captions track of the film element
function applyCaptions(videoElement: HTMLVideoElement): void {
	for (const textTrack of Array.from(videoElement.textTracks)) {
		textTrack.mode = isCaptionsShown ? "showing" : "hidden"
	}
}

// run a call now if the film's size is known, or once it is. picture-in-picture and Safari's fullscreen need it
function runOnceFilmSizeIsKnown(videoElement: HTMLVideoElement, call: () => void): void {
	if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA) {
		call()
	} else {
		videoElement.addEventListener("loadedmetadata", call, { once: true })
	}
}
