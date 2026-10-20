// the voice fixtures the voice tests share: the test topic's voice chat page and a spoken question's timings
import type { SpokenQuestionTimings } from "@/clients/voiceClient"

// the voice chat page of the topic the voice tests speak on
export const TEST_TOPIC_VOICE_CHAT_PAGE = { kind: "topic", topicId: "topic-1" } as const

// the timings a spoken question is asked with: three seconds recorded, transcribed in half a second
export const TEST_SPOKEN_QUESTION_TIMINGS: SpokenQuestionTimings = {
	secondsRecorded: 3,
	transcriptionMs: 500,
	recordingSentAt: 1_000,
}
