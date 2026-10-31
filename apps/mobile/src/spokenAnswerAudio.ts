// the phone's spoken answer player: a second expo-audio player beside the podcast's, which plays each spoken part
// from a transient cache file, deletes the file once the part ends or stops, reads a system stop from its status, and
// names the host on the lock screen while the host talks. the app passes in the player and the file write
import type { SpokenPartAudio } from "@carlnotes/client/voiceClient"
import { toBaseContentType } from "@carlnotes/contracts/attachmentTypes"
import type { SpokenAnswerPlayerAdapter, SpokenPartPlayCallbacks } from "@carlnotes/core/lib/spokenAnswerPlayer"
import type { AudioLockScreenOptions, AudioPlayer, AudioStatus } from "expo-audio"
import { toLockScreenMetadata } from "./podcastEpisodeAudioAdapter"

// the prefix of every spoken part's cache file
export const SPOKEN_PART_FILE_PREFIX = "spoken-part-"

// how close to a spoken part's end a pause reads as its finish instead of a system stop
const SPOKEN_PART_END_SECONDS = 0.25

// a host's answer has no skips on the lock screen, only the pause that stops the host
const SPOKEN_ANSWER_LOCK_SCREEN_OPTIONS: AudioLockScreenOptions = {
	showSeekBackward: false,
	showSeekForward: false,
	showPreviousTrack: false,
	showNextTrack: false,
}

// the player the adapter drives, as expo-audio's player has it
export type SpokenAnswerAudioPlayer = Pick<
	AudioPlayer,
	"replace" | "play" | "pause" | "addListener" | "setActiveForLockScreen" | "clearLockScreenControls"
>

// a spoken part's written cache file, whose delete logs a failure and never throws
export type SpokenPartFile = { uri: string; delete: () => void }

// what a player status says about the playing spoken part
export type SpokenPartStatusEvent = "playing" | "ended" | "systemStop" | null

// the player and the file write that the app passes in
type ToSpokenAnswerPlayerAdapterOptions = {
	player: SpokenAnswerAudioPlayer
	writeSpokenPartFile: (fileName: string, bytes: Uint8Array) => Promise<SpokenPartFile>
}

/**
 * Returns the extension that a spoken part's file plays as: wav for the speech route's wav, and mp3 for its mp3 and any
 * other type.
 */
export function toSpokenPartExtension(contentType: string): string {
	return toBaseContentType(contentType) === "audio/wav" ? "wav" : "mp3"
}

/**
 * Returns a spoken part's cache file name: the prefix, the time and the count that keep it unique, and its extension.
 */
export function toSpokenPartFileName(spokenPartCount: number, contentType: string, now = Date.now()): string {
	return `${SPOKEN_PART_FILE_PREFIX}${now}-${spokenPartCount}.${toSpokenPartExtension(contentType)}`
}

/**
 * Returns what a player status says: the part started playing, ended or failed, or stopped for the system, a call,
 * a removed headset, or the lock screen's pause. A pause at the very end waits for the finish.
 */
export function toSpokenPartStatusEvent(
	status: Pick<AudioStatus, "playing" | "didJustFinish" | "isBuffering" | "currentTime" | "duration" | "error">,
	hasStartedPlaying: boolean,
): SpokenPartStatusEvent {
	// a finished part, and one that failed to decode, end
	if (status.didJustFinish || status.error) {
		return "ended"
	}

	// the first playing status is the part's start
	if (status.playing) {
		return hasStartedPlaying ? null : "playing"
	}

	// a pause once the part played, mid-part and not buffering, is the system's
	const isAtEnd = status.duration > 0 && status.currentTime >= status.duration - SPOKEN_PART_END_SECONDS
	return hasStartedPlaying && !status.isBuffering && !isAtEnd ? "systemStop" : null
}

/**
 * Returns the spoken answer player over the app's player and file write, and the call that releases it.
 */
export function toSpokenAnswerPlayerAdapter({ player, writeSpokenPartFile }: ToSpokenAnswerPlayerAdapterOptions): {
	adapter: SpokenAnswerPlayerAdapter
	release: () => void
} {
	// the playing part's callbacks and file, whether it started, the parts written, the version that retires a play
	// still writing its file, and whether the host holds the lock screen
	let spokenPartPlayCallbacks: SpokenPartPlayCallbacks | null = null
	let spokenPartFile: SpokenPartFile | null = null
	let hasStartedPlaying = false
	let spokenPartCount = 0
	let playVersion = 0
	let isLockScreenActive = false

	// delete the playing part's file
	const deleteSpokenPartFile = (): void => {
		const file = spokenPartFile
		spokenPartFile = null
		file?.delete()
	}

	// each status reaches the playing part's callbacks. an ended part deletes its file first
	const statusSubscription = player.addListener("playbackStatusUpdate", (status: AudioStatus) => {
		const callbacks = spokenPartPlayCallbacks
		const statusEvent = callbacks ? toSpokenPartStatusEvent(status, hasStartedPlaying) : null
		if (statusEvent === "playing") {
			hasStartedPlaying = true
			callbacks?.onPlaying()
			return
		}

		// an end retires the part's callbacks and deletes its file
		if (statusEvent === "ended") {
			spokenPartPlayCallbacks = null
			deleteSpokenPartFile()
			callbacks?.onEnded()
			return
		}

		// a system stop reports the pause
		if (statusEvent === "systemStop") {
			spokenPartPlayCallbacks = null
			callbacks?.onSystemPause()
		}
	})

	// drop the playing part, its file, and the host's lock screen
	const stop = (): void => {
		playVersion += 1
		spokenPartPlayCallbacks = null
		player.pause()
		player.replace(null)
		deleteSpokenPartFile()

		// the host gives back the lock screen
		if (isLockScreenActive) {
			isLockScreenActive = false
			player.clearLockScreenControls()
		}
	}

	// the adapter that core's spoken answer store drives
	const adapter: SpokenAnswerPlayerAdapter = {
		// a native player needs no gesture to play
		unlock: () => {},
		// write the part's bytes to its own cache file and play it
		play: async (spokenPartAudio: SpokenPartAudio, callbacks) => {
			playVersion += 1
			const version = playVersion
			spokenPartPlayCallbacks = null
			deleteSpokenPartFile()

			// write the part's file. a stop or a newer part during the write deletes it unplayed
			spokenPartCount += 1
			const fileName = toSpokenPartFileName(spokenPartCount, spokenPartAudio.type)
			const bytes = spokenPartAudio instanceof Blob ? await toBytes(spokenPartAudio) : spokenPartAudio.bytes
			const file = await writeSpokenPartFile(fileName, bytes)
			if (version !== playVersion) {
				file.delete()
				return
			}

			// the file plays, and reports to this part's callbacks
			spokenPartFile = file
			hasStartedPlaying = false
			spokenPartPlayCallbacks = callbacks
			player.replace({ uri: file.uri })
			player.play()
		},
		// name the host on the lock screen, with no skips. a rejected update leaves the answer playing
		showSpeaker: (metadata) => {
			try {
				player.setActiveForLockScreen(true, toLockScreenMetadata(metadata), SPOKEN_ANSWER_LOCK_SCREEN_OPTIONS)
				isLockScreenActive = true
			} catch (error) {
				console.error("spoken answer lock screen update failed", error)
			}
		},
		stop,
	}

	// the release stops the part and the status listener
	const release = (): void => {
		stop()
		statusSubscription.remove()
	}
	return { adapter, release }
}

// a Blob's bytes, for a readSpokenPartAudio that returned a Blob
async function toBytes(blob: Blob): Promise<Uint8Array> {
	return new Uint8Array(await blob.arrayBuffer())
}
