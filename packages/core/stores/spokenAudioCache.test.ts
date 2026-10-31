// the session's spoken audio cache: one fetch per spoken part, and a size limit that drops the least recently played
import { afterEach, expect, type Mock, mock, spyOn, test } from "bun:test"
import * as voiceClient from "@carlnotes/client/voiceClient"
import type { VoiceChatPage } from "@carlnotes/contracts/payloads"
import { clearSpokenAudioCache, configureSpokenAudioCache, loadSpokenPartAudio } from "./spokenAudioCache"

// the page and the three spoken parts every test speaks
const page: VoiceChatPage = { kind: "room", topicId: null, teamId: "team-a" }
const spokenPartSource = { page, speaker: "host" as const, spokenParts: ["First.", "Second.", "Third."] }

// the cache and the fetch spy each test leaves
afterEach(() => {
	clearSpokenAudioCache()
	configureSpokenAudioCache({ maxBytes: 40_000_000 })
	mock.restore()
})

// a fetch spy that returns 100 bytes for every spoken part
function spyOnSpeechFetch(): Mock<typeof voiceClient.fetchSpokenAnswerAudio> {
	return spyOn(voiceClient, "fetchSpokenAnswerAudio").mockImplementation(async () => ({
		bytes: new Uint8Array(100),
		type: "audio/mpeg",
	}))
}

// a replayed spoken part reads the cache
test("a replayed spoken part reads the cache, so its audio is fetched once", async () => {
	const fetchSpokenAnswerAudioSpy = spyOnSpeechFetch()
	await loadSpokenPartAudio(spokenPartSource, 0)
	await loadSpokenPartAudio(spokenPartSource, 0)
	expect(fetchSpokenAnswerAudioSpy).toHaveBeenCalledTimes(1)
})

test("a full cache drops the least recently played spoken part, and a replay keeps one longer", async () => {
	// room for two spoken parts, and the first replayed after the second
	configureSpokenAudioCache({ maxBytes: 200 })
	const fetchSpokenAnswerAudioSpy = spyOnSpeechFetch()
	await loadSpokenPartAudio(spokenPartSource, 0)
	await loadSpokenPartAudio(spokenPartSource, 1)
	await loadSpokenPartAudio(spokenPartSource, 0)

	// the third drops the second, so the first still reads the cache and the second is fetched again
	await loadSpokenPartAudio(spokenPartSource, 2)
	await loadSpokenPartAudio(spokenPartSource, 0)
	expect(fetchSpokenAnswerAudioSpy).toHaveBeenCalledTimes(3)
	await loadSpokenPartAudio(spokenPartSource, 1)
	expect(fetchSpokenAnswerAudioSpy).toHaveBeenCalledTimes(4)
})
