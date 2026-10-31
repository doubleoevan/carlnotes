// the phone's spoken answer player: the file names and extensions, the status reading, and the cache file cleanup
// over a fake player
import { expect, test } from "bun:test"
import type { SpokenAnswerPlayerAdapter, SpokenPartPlayCallbacks } from "@carlnotes/core/lib/spokenAnswerPlayer"
import type { AudioStatus } from "expo-audio"
import { toAudioPlayerFixture } from "./audioPlayerTestFixtures"
import {
	SPOKEN_PART_FILE_PREFIX,
	type SpokenAnswerAudioPlayer,
	toSpokenAnswerPlayerAdapter,
	toSpokenPartExtension,
	toSpokenPartFileName,
	toSpokenPartStatusEvent,
} from "./spokenAnswerAudio"

// a status mid-part, which each test moves
const PLAYING_STATUS = {
	playing: true,
	didJustFinish: false,
	isBuffering: false,
	currentTime: 1,
	duration: 4,
	error: null,
}

test("toSpokenPartExtension plays the speech route's types by their own extension, and an unknown type as mp3", () => {
	expect(toSpokenPartExtension("audio/mpeg")).toBe("mp3")
	expect(toSpokenPartExtension("audio/wav")).toBe("wav")
	expect(toSpokenPartExtension("Audio/WAV; codecs=1")).toBe("wav")
	expect(toSpokenPartExtension("application/octet-stream")).toBe("mp3")
})

test("toSpokenPartFileName names a cache file the sweep finds, unique by the time and the count", () => {
	expect(toSpokenPartFileName(3, "audio/wav", 1_700)).toBe(`${SPOKEN_PART_FILE_PREFIX}1700-3.wav`)
	expect(toSpokenPartFileName(4, "audio/mpeg", 1_700)).not.toBe(toSpokenPartFileName(3, "audio/mpeg", 1_700))
})

test("toSpokenPartStatusEvent reads the start, the end, an error, and a system stop", () => {
	// the first playing status is the start, and later ones change nothing
	expect(toSpokenPartStatusEvent(PLAYING_STATUS, false)).toBe("playing")
	expect(toSpokenPartStatusEvent(PLAYING_STATUS, true)).toBeNull()

	// a finish and an error end the part
	expect(toSpokenPartStatusEvent({ ...PLAYING_STATUS, playing: false, didJustFinish: true }, true)).toBe("ended")
	expect(toSpokenPartStatusEvent({ ...PLAYING_STATUS, playing: false, error: "decode failed" }, false)).toBe("ended")

	// a pause mid-part is the system's, but not before the start, while buffering, or at the very end
	const pausedStatus = { ...PLAYING_STATUS, playing: false }
	expect(toSpokenPartStatusEvent(pausedStatus, true)).toBe("systemStop")
	expect(toSpokenPartStatusEvent(pausedStatus, false)).toBeNull()
	expect(toSpokenPartStatusEvent({ ...pausedStatus, isBuffering: true }, true)).toBeNull()
	expect(toSpokenPartStatusEvent({ ...pausedStatus, currentTime: 3.9 }, true)).toBeNull()
})

// the adapter over a fake player, its release, the status send, and the files that the adapter wrote and deleted
type FakeSpokenAnswerAudio = {
	adapter: SpokenAnswerPlayerAdapter
	release: () => void
	player: SpokenAnswerAudioPlayer
	send: (status: Partial<AudioStatus>) => void
	writtenFileNames: string[]
	deletedFileNames: string[]
}

/**
 * Returns the adapter over a fake player whose status the test sends, with the files it wrote and deleted.
 */
function toFakeSpokenAnswerAudio(): FakeSpokenAnswerAudio {
	// the fake player, and the files that the adapter wrote and deleted
	const { player, emit } = toAudioPlayerFixture()
	const writtenFileNames: string[] = []
	const deletedFileNames: string[] = []

	// the adapter over it, writing to named fake files
	const { adapter, release } = toSpokenAnswerPlayerAdapter({
		player,
		writeSpokenPartFile: async (fileName) => {
			writtenFileNames.push(fileName)
			return { uri: `file:///cache/${fileName}`, delete: () => deletedFileNames.push(fileName) }
		},
	})
	const send = (status: Partial<AudioStatus>): void => emit({ ...PLAYING_STATUS, ...status })
	return { adapter, release, player, send, writtenFileNames, deletedFileNames }
}

/**
 * Returns a spoken part's callbacks, which record what they heard.
 */
function toSpokenPartPlayCallbacks(): SpokenPartPlayCallbacks & { reports: string[] } {
	const reports: string[] = []
	return {
		reports,
		onPlaying: () => reports.push("playing"),
		onEnded: () => reports.push("ended"),
		onSystemPause: () => reports.push("systemPause"),
	}
}

test("a played part plays from its cache file and deletes it once it ends", async () => {
	// the part's bytes become a cache file the player plays
	const spokenAnswerAudio = toFakeSpokenAnswerAudio()
	const callbacks = toSpokenPartPlayCallbacks()
	await spokenAnswerAudio.adapter.play({ bytes: new Uint8Array([1, 2]), type: "audio/mpeg" }, callbacks)
	const fileName = spokenAnswerAudio.writtenFileNames[0] ?? ""
	expect(fileName).toEndWith(".mp3")
	expect(spokenAnswerAudio.player.replace).toHaveBeenCalledWith({ uri: `file:///cache/${fileName}` })

	// its start and its end report once, and the end deletes the file
	spokenAnswerAudio.send({})
	spokenAnswerAudio.send({ playing: false, didJustFinish: true })
	spokenAnswerAudio.send({ playing: false, didJustFinish: true })
	expect(callbacks.reports).toEqual(["playing", "ended"])
	expect(spokenAnswerAudio.deletedFileNames).toEqual([fileName])
})

test("a system stop reports the pause, and the app's stop deletes the file and gives the lock screen back", async () => {
	// a part the system pauses mid-part
	const spokenAnswerAudio = toFakeSpokenAnswerAudio()
	const callbacks = toSpokenPartPlayCallbacks()
	await spokenAnswerAudio.adapter.play({ bytes: new Uint8Array([1]), type: "audio/wav" }, callbacks)
	spokenAnswerAudio.send({})
	spokenAnswerAudio.adapter.showSpeaker({ title: "Carl" })
	spokenAnswerAudio.send({ playing: false })
	expect(callbacks.reports).toEqual(["playing", "systemPause"])

	// the store's stop then deletes the file and clears the host from the lock screen, with no further reports
	spokenAnswerAudio.adapter.stop()
	spokenAnswerAudio.send({ playing: false })
	expect(spokenAnswerAudio.deletedFileNames).toEqual(spokenAnswerAudio.writtenFileNames)
	expect(spokenAnswerAudio.player.clearLockScreenControls).toHaveBeenCalledTimes(1)
	expect(callbacks.reports).toEqual(["playing", "systemPause"])
})

test("a new part retires the last part's file and callbacks, and the release deletes the playing one", async () => {
	// two parts in turn, the first replaced before it ends
	const spokenAnswerAudio = toFakeSpokenAnswerAudio()
	const firstCallbacks = toSpokenPartPlayCallbacks()
	const secondCallbacks = toSpokenPartPlayCallbacks()
	await spokenAnswerAudio.adapter.play({ bytes: new Uint8Array([1]), type: "audio/mpeg" }, firstCallbacks)
	await spokenAnswerAudio.adapter.play({ bytes: new Uint8Array([2]), type: "audio/mpeg" }, secondCallbacks)

	// only the second part hears the start, and the first part's file is gone
	spokenAnswerAudio.send({})
	expect(firstCallbacks.reports).toEqual([])
	expect(secondCallbacks.reports).toEqual(["playing"])
	expect(spokenAnswerAudio.deletedFileNames).toEqual([spokenAnswerAudio.writtenFileNames[0] ?? ""])

	// the release deletes the second part's file, and a host who never showed leaves the lock screen alone
	spokenAnswerAudio.release()
	expect(spokenAnswerAudio.deletedFileNames).toEqual(spokenAnswerAudio.writtenFileNames)
	expect(spokenAnswerAudio.player.clearLockScreenControls).not.toHaveBeenCalled()
})

test("a stop while a part's file is written deletes the file unplayed", async () => {
	// the store stops the answer before the write settles
	const spokenAnswerAudio = toFakeSpokenAnswerAudio()
	const callbacks = toSpokenPartPlayCallbacks()
	const spokenPartPlay = spokenAnswerAudio.adapter.play({ bytes: new Uint8Array([1]), type: "audio/mpeg" }, callbacks)
	spokenAnswerAudio.adapter.stop()
	await spokenPartPlay

	// the written file is gone, and the player never loaded it
	expect(spokenAnswerAudio.deletedFileNames).toEqual(spokenAnswerAudio.writtenFileNames)
	expect(spokenAnswerAudio.player.play).not.toHaveBeenCalled()
	spokenAnswerAudio.send({})
	expect(callbacks.reports).toEqual([])
})
