// the chat turn helpers: findChatTurn and withoutChatTurn find and drop a chat turn by its key, upsertChatTurn replaces
// or appends a chat turn by its key, toLoadedChatTurn keeps a stored chat turn's speaker and chapter, and a typed send
// fills and settles only its own chat turn
import { expect, test } from "bun:test"
import { toTestChatTurn } from "./chatRoomTestFixtures"
import {
	findChatTurn,
	replaceChatTurn,
	toFinishedChatTurns,
	toLoadedChatTurn,
	upsertChatTurn,
	withoutChatTurn,
} from "./chatTurns"

// a chat turn is found and dropped by its spoken answer key, and a key no chat turn has finds nothing and drops nothing
test("findChatTurn and withoutChatTurn find and drop a chat turn by its key", () => {
	const typedChatTurn = toTestChatTurn({ spokenAnswerKey: "typed" })
	const podcastChatTurn = toTestChatTurn({ spokenAnswerKey: "podcast" })
	const chatTurns = [typedChatTurn, podcastChatTurn]
	expect(findChatTurn(chatTurns, "podcast")).toBe(podcastChatTurn)
	expect(findChatTurn(chatTurns, "missing")).toBeUndefined()

	// dropping a chat turn keeps every other one
	expect(withoutChatTurn(chatTurns, "typed")).toEqual([podcastChatTurn])
	expect(withoutChatTurn(chatTurns, "missing")).toEqual(chatTurns)
})

// a podcast chat turn replaces its own earlier snapshot, and a new one is appended
test("upsertChatTurn replaces a chat turn by its key and appends a new one", () => {
	const typedChatTurn = toTestChatTurn({ spokenAnswerKey: "typed" })
	const podcastChatTurn = toTestChatTurn({ spokenAnswerKey: "podcast", answer: "" })
	const chatTurns = upsertChatTurn([typedChatTurn], podcastChatTurn)
	expect(chatTurns.map((chatTurn) => chatTurn.spokenAnswerKey)).toEqual(["typed", "podcast"])
	const answeredChatTurns = upsertChatTurn(chatTurns, { ...podcastChatTurn, answer: "Because you follow it." })
	expect(answeredChatTurns.map((chatTurn) => chatTurn.answer)).toEqual(["a latte", "Because you follow it."])
})

// a stored podcast chat turn loads with its speaker and the chapter it was asked during
test("toLoadedChatTurn keeps a stored chat turn's speaker and chapter", () => {
	const chatTurn = toLoadedChatTurn({
		question: "why?",
		answer: "Because.",
		isSpoken: true,
		speaker: "cohost",
		podcastEpisodeChapter: { podcastEpisodeId: "episode-1", chapterPosition: 1 },
		attachments: [],
		linkPreviews: [],
		answerLinkPreviews: [],
	})
	expect(chatTurn.speaker).toBe("cohost")
	expect(chatTurn.podcastEpisodeChapter).toEqual({ podcastEpisodeId: "episode-1", chapterPosition: 1 })
	expect(chatTurn.spokenAnswerKey).toStartWith("chat-turn-")
})

// a podcast chat turn appended while a typed reply streams never takes the typed reply's chunks or its settling
test("a typed send fills and settles its own chat turn when a podcast chat turn sits after it", () => {
	// the typed chat turn, still empty, then the podcast chat turn the panel mirrored after it
	const typedChatTurn = toTestChatTurn({ spokenAnswerKey: "typed", answer: "" })
	const podcastChatTurn = toTestChatTurn({ spokenAnswerKey: "podcast", answer: "Because you follow it." })
	const chatTurns = replaceChatTurn([typedChatTurn, podcastChatTurn], "typed", (chatTurn) => ({
		...chatTurn,
		answer: "a flat white",
	}))
	expect(chatTurns.map((chatTurn) => chatTurn.answer)).toEqual(["a flat white", "Because you follow it."])

	// a failed send marks the typed chat turn, and a stop before any text drops only the typed chat turn
	const failedChatTurns = toFinishedChatTurns(chatTurns, { spokenAnswerKey: "typed", chatSendResult: "failed" })
	expect(failedChatTurns.map((chatTurn) => chatTurn.rejection)).toEqual(["failed", null])
	const stoppedChatTurns = toFinishedChatTurns([typedChatTurn, podcastChatTurn], {
		spokenAnswerKey: "typed",
		chatSendResult: "stopped",
	})
	expect(stoppedChatTurns.map((chatTurn) => chatTurn.spokenAnswerKey)).toEqual(["podcast"])
})
