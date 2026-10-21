// the voice chat gate: the transcription model's default, its off switch, and the two models voice needs
import { afterEach, expect, test } from "bun:test"
import { saveEnvSettings } from "./savedEnvSettings"
import { chatTranscriptionModel, isVoiceChatConfigured } from "./voiceChat"

const restoreEnvSettings = saveEnvSettings(["CHAT_TRANSCRIPTION_MODEL", "PODCAST_SPEECH_MODEL"])
afterEach(restoreEnvSettings)

// unset names Google's model, a value names another, and empty turns voice off
test("chatTranscriptionModel defaults to gemini-3.5-transcribe and reads empty as off", () => {
	delete Bun.env.CHAT_TRANSCRIPTION_MODEL
	expect(chatTranscriptionModel()).toBe("gemini-3.5-transcribe")
	Bun.env.CHAT_TRANSCRIPTION_MODEL = " gemini-4-transcribe "
	expect(chatTranscriptionModel()).toBe("gemini-4-transcribe")
	Bun.env.CHAT_TRANSCRIPTION_MODEL = ""
	expect(chatTranscriptionModel()).toBeNull()
})

// voice is on only with both models set
test("isVoiceChatConfigured needs the transcription model and the speech model", () => {
	// both defaults are on
	delete Bun.env.CHAT_TRANSCRIPTION_MODEL
	delete Bun.env.PODCAST_SPEECH_MODEL
	expect(isVoiceChatConfigured()).toBe(true)

	// an empty speech model turns voice off
	Bun.env.PODCAST_SPEECH_MODEL = ""
	expect(isVoiceChatConfigured()).toBe(false)

	// an empty transcription model turns voice off
	delete Bun.env.PODCAST_SPEECH_MODEL
	Bun.env.CHAT_TRANSCRIPTION_MODEL = ""
	expect(isVoiceChatConfigured()).toBe(false)
})
