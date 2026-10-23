// a streamed chat turn's save: a question asked from the podcast player is stored with its note and its podcast columns
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { PodcastEpisodeSpeaker } from "@carlnotes/contracts/enums"
import type { ChatReplyStream } from "@carlnotes/pipeline/chat/index"
import { PODCAST_EPISODE_CHAPTER } from "@carlnotes/pipeline/chat/podcastEpisodeChapterTestFixtures"
import { Hono } from "hono"
import { TEST_ANALYTICS_PROPERTIES } from "../analyticsTestFixtures"
import { toEmptyChatTurnToolCalls } from "../tool/chatTools"
import { type StreamedChatTurn, streamChatTurn } from "./chatTurnStream"
import * as chatTurns from "./chatTurns"

afterEach(() => mock.restore())

// the order in which the stream saved the chat turn and released its reservation
let savedAndReleasedSteps: string[] = []

// stream a podcast chat turn whose reply names the given speaker, or none, and return what the save was called with
async function streamPodcastChatTurn(
	speaker?: PodcastEpisodeSpeaker,
): Promise<Parameters<typeof chatTurns.saveChatTurn>[0]> {
	savedAndReleasedSteps = []
	const saveChatTurnSpy = spyOn(chatTurns, "saveChatTurn").mockImplementation(async () => {
		savedAndReleasedSteps.push("saved")
		return "turn-1"
	})
	// a reply that already finished
	async function* replyParts(): AsyncGenerator<never> {}
	const chatReply: ChatReplyStream = {
		replyParts: replyParts(),
		completion: Promise.resolve({
			text: "Because you follow it.",
			totalTokens: 10,
			searchCount: 0,
			toolCalls: [],
			speaker,
		}),
	}
	const streamedChatTurn: StreamedChatTurn = {
		chatReply,
		userId: "user-1",
		page: { topicId: "topic-1" },
		question: "why does it matter?",
		attachments: [],
		isPersisted: true,
		isSpoken: true,
		toolCalls: toEmptyChatTurnToolCalls(),
		podcastEpisodeChapter: PODCAST_EPISODE_CHAPTER,
		analyticsProperties: TEST_ANALYTICS_PROPERTIES,
		litellmApiKey: "sk-user",
		agreementTokens: 0,
		reservation: {
			release: async () => {
				savedAndReleasedSteps.push("released")
			},
		},
	}

	// read the whole response so the save after the stream runs
	const app = new Hono().post("/", (context) => streamChatTurn(context, streamedChatTurn))
	await (await app.request("/", { method: "POST" })).text()
	const [saveChatTurnOptions] = saveChatTurnSpy.mock.calls[0] ?? []
	if (!saveChatTurnOptions) {
		throw new Error("the chat turn was not saved")
	}
	return saveChatTurnOptions
}

// the stored question ends with the note naming the podcast episode, the chapter, and vienna, and the row is a podcast
// row
test("a podcast chat turn is stored with its note, its chapter, and the speaker who answered", async () => {
	const saveChatTurnOptions = await streamPodcastChatTurn("cohost")
	expect(saveChatTurnOptions.question).toBe(
		'why does it matter?\n\n[asked while listening to "Grinders get quiet", chapter 3, "The burr set"; Vienna answered]',
	)
	expect(saveChatTurnOptions.podcastEpisodeChapter).toMatchObject({ podcastEpisodeId: "episode-1", chapterPosition: 2 })
	expect(saveChatTurnOptions.podcastAnswerSpeaker).toBe("cohost")
})

// a chat turn stopped before its speaker arrived is stored as carl's
test("a podcast chat turn with no speaker is stored as carl's", async () => {
	const saveChatTurnOptions = await streamPodcastChatTurn()
	expect(saveChatTurnOptions.question).toEndWith("; Carl answered]")
	expect(chatTurns.toChatTurnRow(saveChatTurnOptions).podcastAnswerSpeaker).toBe("host")
})

// the reservation is released only after the chat turn's spend row is saved, so the month's spend never dips between
test("a streamed chat turn releases its reservation after its spend row is saved", async () => {
	await streamPodcastChatTurn("host")
	expect(savedAndReleasedSteps).toEqual(["saved", "released"])
})
