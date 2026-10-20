// a streamed chat turn's save: a question asked from the podcast player is stored with its note and its podcast columns
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { PodcastEpisodeSpeaker } from "@shared/enums"
import { Hono } from "hono"
import type { ChatReplyStream } from "../../worker"
import { PODCAST_EPISODE_CHAPTER } from "../../worker/chat/podcastEpisodeChapterTestFixtures"
import { TEST_ANALYTICS_PROPERTIES } from "../analyticsTestFixtures"
import { toEmptyChatTurnToolCalls } from "../tool/chatTools"
import { type StreamedChatTurn, streamChatTurn } from "./chatTurnStream"
import * as chatTurns from "./chatTurns"

afterEach(() => mock.restore())

// stream a podcast chat turn whose reply names the given speaker, or none, and return what the save was called with
async function streamPodcastChatTurn(
	speaker?: PodcastEpisodeSpeaker,
): Promise<Parameters<typeof chatTurns.saveChatTurn>[0]> {
	const saveChatTurnSpy = spyOn(chatTurns, "saveChatTurn").mockResolvedValue("turn-1")
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
