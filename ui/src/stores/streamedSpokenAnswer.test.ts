// a spoken question's streamed reply: its spoken parts in the voice of the host who answers, and its event once
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as voiceClient from "@/clients/voiceClient"
import { TEST_SPOKEN_QUESTION_TIMINGS, TEST_TOPIC_VOICE_CHAT_PAGE } from "@/clients/voiceClientTestFixtures"
import * as spokenAnswerStore from "@/stores/spokenAnswerStore"
import { toStreamedSpokenAnswer } from "@/stores/streamedSpokenAnswer"

afterEach(() => mock.restore())

// a reply is spoken a finished spoken part at a time in the voice set before it, and the rest at its end
test("a streamed reply speaks its spoken parts in the voice set for it", () => {
	const appendSpokenAnswerPartSpy = spyOn(spokenAnswerStore, "appendSpokenAnswerPart").mockImplementation(() => {})
	spyOn(spokenAnswerStore, "completeSpokenAnswer").mockImplementation(() => {})
	spyOn(spokenAnswerStore, "toSpokenAnswerState").mockReturnValue("playing")
	const streamedSpokenAnswer = toStreamedSpokenAnswer({
		spokenAnswerKey: "turn-1",
		page: TEST_TOPIC_VOICE_CHAT_PAGE,
		spokenQuestionTimings: TEST_SPOKEN_QUESTION_TIMINGS,
		chatTurnKind: "podcast",
	})

	// vienna answers, named on the lock screen
	streamedSpokenAnswer.setSpeaker("cohost", { title: "Vienna" })
	const firstSentence = "It matters because you follow this topic every single week, and it moves. "
	streamedSpokenAnswer.appendChunk(firstSentence)
	streamedSpokenAnswer.finish(`${firstSentence}\n\nAnd the rest.`, null)
	expect(
		appendSpokenAnswerPartSpy.mock.calls.map(([options]) => [options.speaker, options.mediaSessionMetadata]),
	).toEqual([
		["cohost", { title: "Vienna" }],
		["cohost", { title: "Vienna" }],
	])
})

// a stopped stream goes quiet and posts the spoken question event once, naming where it was asked from
test("a stopped streamed reply goes quiet and posts its event once", () => {
	const stopSpokenAnswerKeySpy = spyOn(spokenAnswerStore, "stopSpokenAnswerKey").mockImplementation(() => {})
	const sendSpokenQuestionEventSpy = spyOn(voiceClient, "sendSpokenQuestionEvent").mockImplementation(() => {})
	const streamedSpokenAnswer = toStreamedSpokenAnswer({
		spokenAnswerKey: "turn-2",
		page: TEST_TOPIC_VOICE_CHAT_PAGE,
		spokenQuestionTimings: TEST_SPOKEN_QUESTION_TIMINGS,
		chatTurnKind: "podcast",
	})
	streamedSpokenAnswer.finish("", "stopped")
	streamedSpokenAnswer.finish("", "stopped")
	expect(stopSpokenAnswerKeySpy).toHaveBeenCalledWith("turn-2")
	expect(sendSpokenQuestionEventSpy).toHaveBeenCalledTimes(1)
	expect(sendSpokenQuestionEventSpy).toHaveBeenCalledWith({
		page: TEST_TOPIC_VOICE_CHAT_PAGE,
		spokenQuestionTimings: TEST_SPOKEN_QUESTION_TIMINGS,
		playingAt: null,
		chatTurnKind: "podcast",
	})
})
