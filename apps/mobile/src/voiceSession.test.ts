// the voice's part of a session's exit: the recordings end at once, and only an accepted sign-out drops the audio
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as podcastEpisodeQuestionStore from "@carlnotes/core/stores/podcastEpisodeQuestionStore"
import * as spokenAnswerStore from "@carlnotes/core/stores/spokenAnswerStore"
import { subscribeToVoiceRecordingEnd, toVoiceExit } from "./voiceSession"

// the store spies each test makes
afterEach(() => {
	mock.restore()
})

test("an exit ends every mounted recording and stops the answer before the sign-out settles", () => {
	// the order that the question and the recordings end in
	const endings: string[] = []
	const stopSpokenAnswer = spyOn(spokenAnswerStore, "stopSpokenAnswer")
	spyOn(podcastEpisodeQuestionStore, "endPodcastEpisodeQuestionOnSignOut").mockImplementation(() => {
		endings.push("question")
	})

	// two mounted recordings, one already unmounted
	const composerEnd = mock(() => {
		endings.push("recording")
	})
	const podcastEpisodeQuestionEnd = mock(() => {})
	const unmountedEnd = mock(() => {})
	subscribeToVoiceRecordingEnd(composerEnd)
	subscribeToVoiceRecordingEnd(podcastEpisodeQuestionEnd)
	subscribeToVoiceRecordingEnd(unmountedEnd)()

	// the exit's start ends the question before the recordings, so no stop resumes the podcast episode
	toVoiceExit()
	expect(endings).toEqual(["question", "recording"])
	expect(composerEnd).toHaveBeenCalledTimes(1)
	expect(podcastEpisodeQuestionEnd).toHaveBeenCalledTimes(1)
	expect(unmountedEnd).not.toHaveBeenCalled()
	expect(stopSpokenAnswer).toHaveBeenCalledTimes(1)
})

test("only an accepted sign-out drops the spoken audio from memory", () => {
	const clearSpokenAnswers = spyOn(spokenAnswerStore, "clearSpokenAnswers")
	toVoiceExit()(false)
	expect(clearSpokenAnswers).not.toHaveBeenCalled()
	toVoiceExit()(true)
	expect(clearSpokenAnswers).toHaveBeenCalledTimes(1)
})
