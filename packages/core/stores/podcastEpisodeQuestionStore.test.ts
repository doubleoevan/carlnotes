// a question asked from the podcast player: one question at a time, the send every podcast mic slot shows, the
// conversation it loads, the chat turn snapshots it announces, the rejections that end it, and which resume runs
import { afterEach, expect, jest, type Mock, mock, spyOn, test } from "bun:test"
import * as chatClient from "@carlnotes/client/chatClient"
import { TEST_SPOKEN_QUESTION_TIMINGS } from "@carlnotes/client/voiceClientTestFixtures"
import type { ChatConversation } from "@carlnotes/contracts/chat"
import { withPodcastEpisodeNote } from "@carlnotes/contracts/chatQuestionNotes"
import type { PodcastEpisodeSpeaker } from "@carlnotes/contracts/enums"
import { PODCAST_NAME } from "@carlnotes/contracts/podcastEpisodes"
import {
	toPodcastEpisodeChapterFixture,
	toPodcastEpisodeFixture,
} from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { CHAT_FAILED_NOTICE } from "../lib/chatRejectionCopy"
import { RESUME_BEAT_MS } from "./podcastEpisodeQuestionRules"
import {
	askPodcastEpisodeQuestion,
	endPodcastEpisodeQuestion,
	endPodcastEpisodeQuestionOnSignOut,
	loadPodcastEpisodeQuestionConversation,
	markPodcastEpisodeQuestionRecording,
	type PodcastEpisodeQuestionChatTurn,
	sendPodcastEpisodeQuestionRecording,
	startPodcastEpisodeQuestion,
	subscribeToPodcastEpisodeQuestionChatTurn,
	toPodcastEpisodeQuestionView,
} from "./podcastEpisodeQuestionStore"
import {
	type PodcastEpisodePlayerSpies,
	spyOnPodcastEpisodePlayer,
	toVoiceRecordingMock,
} from "./podcastEpisodeQuestionTestFixtures"
import type { SpokenAnswerEnd } from "./spokenAnswerQueue"
import * as spokenAnswerStore from "./spokenAnswerStore"
import type { StreamedSpokenAnswer } from "./streamedSpokenAnswer"
import * as streamedSpokenAnswer from "./streamedSpokenAnswer"
import { collectVoiceNotices } from "./voiceTestFixtures"

// the call that removes the notices a test registered
let unregisterTestNotices: (() => void) | null = null

// end any question a test left in progress while the player store's spies still stand, then put every spy and the
// real timers back
afterEach(() => {
	endPodcastEpisodeQuestion("stopped")
	mock.restore()
	jest.useRealTimers()
	unregisterTestNotices?.()
	unregisterTestNotices = null
})

// the loaded podcast episode, with the chapter that plays while the question is asked
const podcastEpisode = toPodcastEpisodeFixture({
	chapters: [toPodcastEpisodeChapterFixture({ position: 0, title: "The corner test" })],
})

// the conversation a question loads for its history: one the user may chat in, with nothing said yet
const chatConversation: ChatConversation = {
	chatTurns: [],
	canChat: true,
	isSignupRequired: false,
	isBudgetExhausted: false,
	isVoiceChatConfigured: true,
	keptAttachments: [],
	canEditTopic: false,
}

// the transcript every question asks, and its note naming the podcast episode, the chapter, and the host
const transcript = "Why does the corner test matter?"
function toNotedQuestion(speaker: PodcastEpisodeSpeaker): string {
	return withPodcastEpisodeNote(transcript, {
		podcastEpisodeTitle: "Robot vacuums, ranked",
		chapterPosition: 0,
		chapterTitle: "The corner test",
		speaker,
	})
}

// the stubbed spoken answer, and the calls that play its first word and end it
type SpokenAnswerSpies = {
	streamedSpokenAnswerMock: StreamedSpokenAnswer
	playSpokenAnswer: () => void
	endSpokenAnswer: (spokenAnswerEnd: Pick<SpokenAnswerEnd, "isPlayedToEnd" | "isMediaSessionPause">) => void
}

// an asked question's spies, and the chat turn snapshots announced for its topic
type AskedQuestion = SpokenAnswerSpies & {
	resumeSpy: PodcastEpisodePlayerSpies["resumeSpy"]
	sendChatTurnSpy: Mock<typeof chatClient.sendChatTurn>
	podcastEpisodeQuestionChatTurns: PodcastEpisodeQuestionChatTurn[]
}

// the spoken answer a question streams into, and the listener its spoken answer end calls, both stubbed
function spyOnSpokenAnswer(): SpokenAnswerSpies {
	const streamedSpokenAnswerMock: StreamedSpokenAnswer = {
		appendChunk: mock(() => {}),
		finish: mock(() => {}),
		setSpeaker: mock(() => {}),
	}
	const toStreamedSpokenAnswerSpy = spyOn(streamedSpokenAnswer, "toStreamedSpokenAnswer").mockReturnValue(
		streamedSpokenAnswerMock,
	)
	spyOn(spokenAnswerStore, "stopSpokenAnswerKey").mockImplementation(() => {})

	// keep the listener, so a test can end the spoken answer
	let spokenAnswerEndListener: ((spokenAnswerEnd: SpokenAnswerEnd) => void) | null = null
	spyOn(spokenAnswerStore, "subscribeToSpokenAnswerEnd").mockImplementation((listener) => {
		spokenAnswerEndListener = listener
		return () => {}
	})

	// the spoken answer's first word plays
	const playSpokenAnswer = (): void => {
		toStreamedSpokenAnswerSpy.mock.calls[0]?.[0].onPlaying?.()
	}

	// the spoken answer ends, under the key the question listens for
	const endSpokenAnswer: SpokenAnswerSpies["endSpokenAnswer"] = (spokenAnswerEnd) => {
		const spokenAnswerKey = toStreamedSpokenAnswerSpy.mock.calls[0]?.[0].spokenAnswerKey ?? ""
		spokenAnswerEndListener?.({ spokenAnswerKey, isAutoPlayed: true, ...spokenAnswerEnd })
	}
	return { streamedSpokenAnswerMock, playSpokenAnswer, endSpokenAnswer }
}

// a question asked over a playing podcast episode, whose chat turn streams what sendChatTurn's stub does. returns the
// resume's spy, the spoken answer's controls, and the chat turn snapshots announced for the topic
async function askQuestion(sendChatTurnStub: typeof chatClient.sendChatTurn): Promise<AskedQuestion> {
	// the player, the spoken answer, the conversation, and the chat turn, all stubbed
	const { resumeSpy } = spyOnPodcastEpisodePlayer({ podcastEpisode, isPlaying: true })
	const spokenAnswer = spyOnSpokenAnswer()
	spyOn(chatClient, "fetchChatConversation").mockResolvedValue(chatConversation)
	const sendChatTurnSpy = spyOn(chatClient, "sendChatTurn").mockImplementation(sendChatTurnStub)

	// every snapshot of the topic's chat turn, and none of another topic's
	const podcastEpisodeQuestionChatTurns: PodcastEpisodeQuestionChatTurn[] = []
	const otherTopicListener = mock(() => {})
	const unsubscribe = subscribeToPodcastEpisodeQuestionChatTurn("topic-1", (podcastEpisodeQuestionChatTurn) =>
		podcastEpisodeQuestionChatTurns.push(podcastEpisodeQuestionChatTurn),
	)
	const unsubscribeOtherTopic = subscribeToPodcastEpisodeQuestionChatTurn("topic-2", otherTopicListener)

	// start the question, load its conversation, and ask it
	expect(startPodcastEpisodeQuestion(toVoiceRecordingMock())).toBe(true)
	expect(await loadPodcastEpisodeQuestionConversation()).toBe(true)
	await askPodcastEpisodeQuestion(transcript, TEST_SPOKEN_QUESTION_TIMINGS)
	unsubscribe()
	unsubscribeOtherTopic()
	expect(otherTopicListener).not.toHaveBeenCalled()
	return { resumeSpy, sendChatTurnSpy, podcastEpisodeQuestionChatTurns, ...spokenAnswer }
}

// a second mic tap while a question is in progress starts nothing, so the first question's cancel is kept
test("startPodcastEpisodeQuestion rejects a second question while one is in progress", () => {
	spyOnPodcastEpisodePlayer({ podcastEpisode, isPlaying: true })

	// the first tap starts a question, the second is rejected, and the first question's cancel still ends it
	const firstVoiceRecording = toVoiceRecordingMock()
	expect(startPodcastEpisodeQuestion(firstVoiceRecording)).toBe(true)
	expect(startPodcastEpisodeQuestion(toVoiceRecordingMock())).toBe(false)
	endPodcastEpisodeQuestion("stopped")
	expect(firstVoiceRecording.cancel).toHaveBeenCalled()
	expect(startPodcastEpisodeQuestion(toVoiceRecordingMock())).toBe(true)
})

// the mic that records marks the question, so every podcast mic slot shows send and sends that mic's recording
test("a marked recording shows its send to every podcast mic slot until the recording or the question ends", () => {
	spyOnPodcastEpisodePlayer({ podcastEpisode, isPlaying: true })

	// a started question is listening, and not recording until its mic marks it
	const voiceRecording = toVoiceRecordingMock()
	startPodcastEpisodeQuestion(voiceRecording)
	expect(toPodcastEpisodeQuestionView()).toEqual({ phase: "listening", speaker: null, isVoiceRecording: false })
	const markRecordingDone = markPodcastEpisodeQuestionRecording()
	expect(toPodcastEpisodeQuestionView().isVoiceRecording).toBe(true)

	// the store's send sends the recording that runs, and the recording's end clears the mark
	sendPodcastEpisodeQuestionRecording()
	expect(voiceRecording.send).toHaveBeenCalledTimes(1)
	markRecordingDone()
	expect(toPodcastEpisodeQuestionView().isVoiceRecording).toBe(false)

	// the question's end clears the mark, and the ended question's mark leaves the next question's alone
	const markEndedRecordingDone = markPodcastEpisodeQuestionRecording()
	endPodcastEpisodeQuestion("stopped")
	expect(toPodcastEpisodeQuestionView()).toEqual({ phase: "idle", speaker: null, isVoiceRecording: false })
	startPodcastEpisodeQuestion(toVoiceRecordingMock())
	markPodcastEpisodeQuestionRecording()
	markEndedRecordingDone()
	expect(toPodcastEpisodeQuestionView().isVoiceRecording).toBe(true)
})

// a spent budget shows the platform's spent budget notice, and the question asks nothing
test("loadPodcastEpisodeQuestionConversation shows the budget notice and returns false on a spent budget", async () => {
	spyOnPodcastEpisodePlayer({ podcastEpisode, isPlaying: true })
	const { notices, unregister } = collectVoiceNotices()
	unregisterTestNotices = unregister
	spyOn(chatClient, "fetchChatConversation").mockResolvedValue({
		...chatConversation,
		canChat: false,
		isBudgetExhausted: true,
	})

	// the load says no and shows the budget notice
	startPodcastEpisodeQuestion(toVoiceRecordingMock())
	expect(await loadPodcastEpisodeQuestionConversation()).toBe(false)
	expect(notices).toEqual(["spent budget"])
})

// a conversation that fails to load says the chat's failure, and one that loads lets the question ask
test("loadPodcastEpisodeQuestionConversation says a failed load and returns true once the conversation loads", async () => {
	spyOnPodcastEpisodePlayer({ podcastEpisode, isPlaying: true })
	const { notices, unregister } = collectVoiceNotices()
	unregisterTestNotices = unregister
	const fetchChatConversationSpy = spyOn(chatClient, "fetchChatConversation").mockRejectedValue(new Error("offline"))

	// the failed load says no, then the loaded conversation for the podcast episode's topic says yes
	startPodcastEpisodeQuestion(toVoiceRecordingMock())
	expect(await loadPodcastEpisodeQuestionConversation()).toBe(false)
	expect(notices).toEqual([CHAT_FAILED_NOTICE])
	fetchChatConversationSpy.mockResolvedValue(chatConversation)
	expect(await loadPodcastEpisodeQuestionConversation()).toBe(true)
	expect(fetchChatConversationSpy).toHaveBeenLastCalledWith({ topicId: "topic-1" })
})

// the chat turn reaches a chat panel as it is sent, once the reply names vienna, as the answer grows, and finished
test("askPodcastEpisodeQuestion announces the sent, speaker, growing, and finished chat turn snapshots", async () => {
	const { sendChatTurnSpy, podcastEpisodeQuestionChatTurns, streamedSpokenAnswerMock } = await askQuestion(
		async ({ onSpeaker, onChunk }) => {
			// the reply names vienna, then streams two chunks
			onSpeaker?.("cohost")
			expect(toPodcastEpisodeQuestionView()).toEqual({ phase: "thinking", speaker: "cohost", isVoiceRecording: false })
			onChunk("Corners hold ")
			onChunk("the dust.")
			return null
		},
	)

	// the sent chat turn names carl in its note until the reply names vienna, and the answer grows, then settles
	expect(
		podcastEpisodeQuestionChatTurns.map(({ chatTurn, isDropped }) => ({
			question: chatTurn.question,
			speaker: chatTurn.speaker,
			answer: chatTurn.answer,
			rejection: chatTurn.rejection,
			isDropped,
		})),
	).toEqual([
		{ question: toNotedQuestion("host"), speaker: "host", answer: "", rejection: null, isDropped: false },
		{ question: toNotedQuestion("cohost"), speaker: "cohost", answer: "", rejection: null, isDropped: false },
		{
			question: toNotedQuestion("cohost"),
			speaker: "cohost",
			answer: "Corners hold ",
			rejection: null,
			isDropped: false,
		},
		{
			question: toNotedQuestion("cohost"),
			speaker: "cohost",
			answer: "Corners hold the dust.",
			rejection: null,
			isDropped: false,
		},
		{
			question: toNotedQuestion("cohost"),
			speaker: "cohost",
			answer: "Corners hold the dust.",
			rejection: null,
			isDropped: false,
		},
	])

	// every snapshot is the same chat turn, tagged with the chapter, and only the finished one has its time
	const podcastEpisodeChapter = { podcastEpisodeId: "episode-1", chapterPosition: 0 }
	const spokenAnswerKeys = new Set(podcastEpisodeQuestionChatTurns.map(({ chatTurn }) => chatTurn.spokenAnswerKey))
	expect(spokenAnswerKeys.size).toBe(1)
	expect(podcastEpisodeQuestionChatTurns.every(({ chatTurn }) => chatTurn.podcastEpisodeChapter)).toBe(true)
	expect(podcastEpisodeQuestionChatTurns[0]?.chatTurn.podcastEpisodeChapter).toEqual(podcastEpisodeChapter)
	expect(podcastEpisodeQuestionChatTurns.map(({ chatTurn }) => chatTurn.at !== undefined)).toEqual([
		false,
		false,
		false,
		false,
		true,
	])

	// the chat turn sends the transcript alone, spoken, with the chapter, and vienna speaks it on the lock screen
	expect(sendChatTurnSpy.mock.calls[0]?.[0]).toMatchObject({
		page: { topicId: "topic-1" },
		question: transcript,
		isSpoken: true,
		podcastEpisodeChapter,
	})
	expect(streamedSpokenAnswerMock.setSpeaker).toHaveBeenCalledWith("cohost", {
		title: "Vienna",
		artist: PODCAST_NAME,
		album: "Robot vacuums, ranked",
		artwork: [],
	})
	expect(streamedSpokenAnswerMock.finish).toHaveBeenCalledWith("Corners hold the dust.", null)
})

// a spent budget mid-question shows the budget notice, ends the question, and resumes the podcast episode at once
test("a budget result shows the budget notice and resumes the podcast episode at once", async () => {
	const { notices, unregister } = collectVoiceNotices()
	unregisterTestNotices = unregister
	const { resumeSpy, podcastEpisodeQuestionChatTurns } = await askQuestion(async () => "budget")

	// the finished chat turn says why, and the question is over
	expect(podcastEpisodeQuestionChatTurns.at(-1)?.chatTurn.rejection).toBe("budget")
	expect(notices).toEqual(["spent budget"])
	expect(toPodcastEpisodeQuestionView().phase).toBe("idle")
	expect(resumeSpy).toHaveBeenCalledTimes(1)
})

// a failed chat turn says the chat's words, ends the question, and resumes the podcast episode at once
test("a failed result says the chat's failure and resumes the podcast episode at once", async () => {
	const { notices, unregister } = collectVoiceNotices()
	unregisterTestNotices = unregister
	const { resumeSpy, podcastEpisodeQuestionChatTurns } = await askQuestion(async () => "failed")

	// the finished chat turn says why, and the question is over
	expect(podcastEpisodeQuestionChatTurns.at(-1)?.chatTurn.rejection).toBe("failed")
	expect(notices).toEqual([CHAT_FAILED_NOTICE])
	expect(toPodcastEpisodeQuestionView().phase).toBe("idle")
	expect(resumeSpy).toHaveBeenCalledTimes(1)
})

// the host who finished speaking resumes the podcast episode after the beat
test("an answer played to its end resumes the podcast episode after the beat", async () => {
	jest.useFakeTimers()
	const { resumeSpy, playSpokenAnswer, endSpokenAnswer } = await askQuestion(async ({ onChunk }) => {
		onChunk("Corners hold the dust.")
		return null
	})

	// the first word plays, then the answer ends
	playSpokenAnswer()
	expect(toPodcastEpisodeQuestionView().phase).toBe("answering")
	endSpokenAnswer({ isPlayedToEnd: true })
	expect(toPodcastEpisodeQuestionView().phase).toBe("idle")

	// the podcast episode waits for the beat, then resumes
	jest.advanceTimersByTime(RESUME_BEAT_MS - 1)
	expect(resumeSpy).not.toHaveBeenCalled()
	jest.advanceTimersByTime(1)
	expect(resumeSpy).toHaveBeenCalledTimes(1)
})

// an answer that finished before a word played had nothing to speak, and resumes the podcast episode at once
test("an unspoken answer resumes the podcast episode at once", async () => {
	const { resumeSpy, endSpokenAnswer } = await askQuestion(async () => null)
	endSpokenAnswer({ isPlayedToEnd: true })
	expect(resumeSpy).toHaveBeenCalledTimes(1)
})

// a lock-screen pause while a host answers ends the question and leaves the podcast episode paused
test("a lock-screen pause of the answer leaves the podcast episode paused", async () => {
	const { resumeSpy, playSpokenAnswer, endSpokenAnswer } = await askQuestion(async ({ onChunk }) => {
		onChunk("Corners hold the dust.")
		return null
	})

	// the first word plays, then the lock screen pauses the answer
	playSpokenAnswer()
	endSpokenAnswer({ isPlayedToEnd: false, isMediaSessionPause: true })
	expect(toPodcastEpisodeQuestionView().phase).toBe("idle")
	expect(resumeSpy).not.toHaveBeenCalled()
})

// a question asked within the beat keeps the podcast episode paused, cancels the beat, and counts it as playing
test("a question asked within the beat cancels it and resumes the podcast episode once it stops", () => {
	jest.useFakeTimers()
	const { resumeSpy, setIsPlaying } = spyOnPodcastEpisodePlayer({ podcastEpisode, isPlaying: true })

	// the first question finishes, and the second starts within the beat over a podcast episode that reads as paused
	startPodcastEpisodeQuestion(toVoiceRecordingMock())
	endPodcastEpisodeQuestion("finished")
	setIsPlaying(false)
	startPodcastEpisodeQuestion(toVoiceRecordingMock())
	jest.advanceTimersByTime(RESUME_BEAT_MS)
	expect(resumeSpy).not.toHaveBeenCalled()

	// stopping the second question resumes at once, and the cancelled beat never resumes again
	endPodcastEpisodeQuestion("stopped")
	jest.advanceTimersByTime(RESUME_BEAT_MS)
	expect(resumeSpy).toHaveBeenCalledTimes(1)
})

// a podcast episode paused at the tap stays paused, and a seek or a chapter skip leaves a playing one paused
test("a question over a paused podcast episode or ended by a skip never resumes it", () => {
	// a stop of a question asked over a paused podcast episode
	const { resumeSpy, setIsPlaying } = spyOnPodcastEpisodePlayer({ podcastEpisode, isPlaying: false })
	startPodcastEpisodeQuestion(toVoiceRecordingMock())
	endPodcastEpisodeQuestion("stopped")

	// a skip of a question asked over a playing podcast episode
	setIsPlaying(true)
	startPodcastEpisodeQuestion(toVoiceRecordingMock())
	endPodcastEpisodeQuestion("skipped")
	expect(resumeSpy).not.toHaveBeenCalled()
})

// a sign-out drops a waiting beat and ends a question in progress, so the podcast episode stays paused and the next
// account's mic is free
test("endPodcastEpisodeQuestionOnSignOut ends the question and never resumes the podcast episode", () => {
	jest.useFakeTimers()
	const { resumeSpy } = spyOnPodcastEpisodePlayer({ podcastEpisode, isPlaying: true })

	// a finished question's beat is waiting when the sign-out starts
	startPodcastEpisodeQuestion(toVoiceRecordingMock())
	endPodcastEpisodeQuestion("finished")
	endPodcastEpisodeQuestionOnSignOut()
	jest.advanceTimersByTime(RESUME_BEAT_MS)

	// a question recording when the sign-out starts is cancelled
	const voiceRecording = toVoiceRecordingMock()
	startPodcastEpisodeQuestion(voiceRecording)
	endPodcastEpisodeQuestionOnSignOut()
	expect(voiceRecording.cancel).toHaveBeenCalledTimes(1)
	expect(toPodcastEpisodeQuestionView().phase).toBe("idle")

	// neither resumes the podcast episode, and a new question can start
	expect(resumeSpy).not.toHaveBeenCalled()
	expect(startPodcastEpisodeQuestion(toVoiceRecordingMock())).toBe(true)
})
