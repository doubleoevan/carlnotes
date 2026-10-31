// the browser's spoken answer player: the one audio element the layout mounts, the blob url of the spoken part it
// plays, and the lock screen's media session. the queue and its state are shared in core
import type { SpokenPartPlayCallbacks } from "@carlnotes/core/lib/spokenAnswerPlayer"
import { registerSpokenAnswerPlayer } from "@carlnotes/core/stores/spokenAnswerStore"
import { isMediaSessionAvailable } from "@/lib/podcastEpisodePlayback"
import { addEventListeners } from "@/lib/utils"

// ten milliseconds of silence as a WAV data uri, which a tap plays so the element may play carl's later spoken parts
const SILENT_WAV_DATA_URI =
	"data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA=="

/**
 * Registers the mounted audio element as the spoken answer player, and returns the call that removes its listeners
 * and the player.
 */
export function registerSpokenAnswerAudio(audioElement: HTMLAudioElement): () => void {
	// the playing spoken part's callbacks and its blob url. the silence played in a tap has no callbacks, so its events
	// are ignored
	let spokenPartPlayCallbacks: SpokenPartPlayCallbacks | null = null
	let spokenPartObjectUrl: string | null = null

	// free the blob url of the spoken part that played
	const revokeSpokenPartObjectUrl = (): void => {
		if (spokenPartObjectUrl) {
			URL.revokeObjectURL(spokenPartObjectUrl)
			spokenPartObjectUrl = null
		}
	}

	// each playback event reaches the playing spoken part. a spoken part that failed to decode ends like one that
	// finished
	const removeAudioEventListeners = addEventListeners(audioElement, [
		["playing", () => spokenPartPlayCallbacks?.onPlaying()],
		["ended", () => spokenPartPlayCallbacks?.onEnded()],
		["error", () => spokenPartPlayCallbacks?.onEnded()],
	])

	// the element is the shared queue's player
	const unregisterSpokenAnswerPlayer = registerSpokenAnswerPlayer({
		// play a moment of silence inside the tap, so the element may play the spoken parts after the gesture expires
		unlock: () => {
			spokenPartPlayCallbacks = null
			revokeSpokenPartObjectUrl()
			audioElement.src = SILENT_WAV_DATA_URI
			void audioElement.play().catch(() => {})
		},
		// play the spoken part as a blob url
		play: (spokenPartAudio, callbacks) => {
			revokeSpokenPartObjectUrl()
			const spokenPartBlob =
				spokenPartAudio instanceof Blob
					? spokenPartAudio
					: new Blob([spokenPartAudio.bytes], { type: spokenPartAudio.type })

			// the element plays the blob url and reports to this spoken part's callbacks
			spokenPartObjectUrl = URL.createObjectURL(spokenPartBlob)
			spokenPartPlayCallbacks = callbacks
			audioElement.src = spokenPartObjectUrl
			return audioElement.play()
		},
		// name the host on the lock screen, with its play and pause controls stopping the spoken answer
		showSpeaker: (metadata) => {
			if (!isMediaSessionAvailable()) {
				return
			}
			navigator.mediaSession.metadata = new MediaMetadata(metadata)
			const handleMediaSessionPause = (): void => spokenPartPlayCallbacks?.onSystemPause()
			navigator.mediaSession.setActionHandler("play", handleMediaSessionPause)
			navigator.mediaSession.setActionHandler("pause", handleMediaSessionPause)
		},
		// an element with no source drops the speaking host from the lock screen. the next silence or spoken part sets the
		// source again
		stop: () => {
			spokenPartPlayCallbacks = null
			audioElement.pause()
			revokeSpokenPartObjectUrl()
			audioElement.removeAttribute("src")
			audioElement.load()
		},
	})

	// return the call that removes the player and every listener
	return () => {
		unregisterSpokenAnswerPlayer()
		removeAudioEventListeners()
	}
}
