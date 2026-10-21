// a question asked from the podcast player on the topic chat route: the chapter it names must be on this topic's
// published podcast episode before any model call, and the payload must be a spoken question with no attachment. a
// team's chat ignores the chapter
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import * as litellm from "@carlnotes/models/litellm"
import * as chat from "@carlnotes/pipeline/chat/index"
import * as retrievePodcastEpisodeChapter from "@carlnotes/pipeline/chat/retrievePodcastEpisodeChapter"
import { toJsonRequest, toSignedInApp } from "../testSession"
import * as chatTurnAuthorization from "./chatTurnAuthorization"
import * as chatTurnStream from "./chatTurnStream"
import { privateChatRoute } from "./privateChat"

// put the spies and the Redis client back after each test
afterEach(() => {
	mock.restore()
	restoreRedisClient()
})

// the spies on the key load and the chapter load, which the cases read
type AllowedChatTurnSpies = {
	loadOrProvisionUserLiteLLMKeySpy: ReturnType<typeof spyOn<typeof litellm, "loadOrProvisionUserLiteLLMKey">>
	loadPodcastEpisodeChapterContextSpy: ReturnType<
		typeof spyOn<typeof retrievePodcastEpisodeChapter, "loadPodcastEpisodeChapterContext">
	>
}

// stub user-1 as allowed to chat under the given gate, as a persisted chat turn that may not edit the topic, with
// sk-user as the key, and return the spies the cases read
function stubAllowedChatTurn(gateName: "authorizeChatTurn" | "authorizeTeamChatTurn"): AllowedChatTurnSpies {
	// user-1 may chat under the gate, over a fake Redis
	stubRedisClient()
	spyOn(chatTurnAuthorization, gateName).mockResolvedValue({
		status: "allowed",
		userId: "user-1",
		isTopicOwner: false,
		isPersisted: true,
		canEditTopic: false,
	})

	// the key load returns sk-user, and the chapter load is spied
	return {
		loadOrProvisionUserLiteLLMKeySpy: spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockResolvedValue("sk-user"),
		loadPodcastEpisodeChapterContextSpy: spyOn(retrievePodcastEpisodeChapter, "loadPodcastEpisodeChapterContext"),
	}
}

// the topic chat route with user-1 signed in and allowed to chat on topic-1, and the spies the cases read
function toAllowedTopicChatApp(): AllowedChatTurnSpies & { request: (body: unknown) => Promise<Response> } {
	// user-1 signed in, allowed on the topic chat's gate, posting to topic-1
	const app = toSignedInApp(privateChatRoute, "user-1")
	return {
		...stubAllowedChatTurn("authorizeChatTurn"),
		request: async (body) => app.request("/topics/topic-1/chat", toJsonRequest(body)),
	}
}

// the chapter of a podcast episode on another topic, an unpublished podcast episode, or a missing position loads as no
// chapter, and the route responds 404 before it loads a key or calls a model
test("a podcast question naming a chapter this topic does not have is rejected before any model call", async () => {
	const { loadOrProvisionUserLiteLLMKeySpy, loadPodcastEpisodeChapterContextSpy, request } = toAllowedTopicChatApp()
	loadPodcastEpisodeChapterContextSpy.mockResolvedValue(null)
	const response = await request({
		question: "what did he mean by that?",
		isSpoken: true,
		podcastEpisodeChapter: { podcastEpisodeId: "episode-9", chapterPosition: 7 },
	})
	expect(response.status).toBe(404)
	expect(loadPodcastEpisodeChapterContextSpy).toHaveBeenCalledWith({
		topicId: "topic-1",
		podcastEpisodeId: "episode-9",
		chapterPosition: 7,
	})
	expect(loadOrProvisionUserLiteLLMKeySpy).not.toHaveBeenCalled()
})

// a podcast question that is typed, or that attaches a file, fails validation before the chapter is read
test("a podcast question must be spoken and send no attachment", async () => {
	const { loadPodcastEpisodeChapterContextSpy, request } = toAllowedTopicChatApp()
	const podcastEpisodeChapter = { podcastEpisodeId: "episode-1", chapterPosition: 0 }
	expect((await request({ question: "typed", podcastEpisodeChapter })).status).toBe(400)
	const attachment = { kind: "text", name: "notes.txt", text: "hi" }
	const attachedResponse = await request({
		question: "spoken",
		isSpoken: true,
		attachments: [attachment],
		podcastEpisodeChapter,
	})
	expect(attachedResponse.status).toBe(400)
	expect(loadPodcastEpisodeChapterContextSpy).not.toHaveBeenCalled()
})

// a team's chat ignores the podcast episode chapter a body names: no chapter is read, and the chat turn is answered
// as an ordinary team chat turn with the team's tools and no podcast episode chapter
test("a team chat turn naming a podcast episode chapter is answered as an ordinary team chat turn", async () => {
	// user-1 is a member of team-1 and may chat there
	const { loadPodcastEpisodeChapterContextSpy } = stubAllowedChatTurn("authorizeTeamChatTurn")

	// the reply and its stream are stubbed, so the test reads what each was asked for
	const streamChatReplySpy = spyOn(chat, "streamChatReply").mockResolvedValue({} as never)
	const streamChatTurnSpy = spyOn(chatTurnStream, "streamChatTurn").mockReturnValue(new Response("streamed"))

	// a body from the podcast player, posted to the team's chat, reads no chapter
	const app = toSignedInApp(privateChatRoute, "user-1")
	const response = await app.request(
		"/teams/team-1/chat",
		toJsonRequest({
			question: "what did he mean by that?",
			isSpoken: true,
			podcastEpisodeChapter: { podcastEpisodeId: "episode-1", chapterPosition: 0 },
		}),
	)
	expect(response.status).toBe(200)
	expect(loadPodcastEpisodeChapterContextSpy).not.toHaveBeenCalled()

	// the reply reads the team's material with the team's tools and no chapter
	const [chatTurnInput] = streamChatReplySpy.mock.calls[0] ?? []
	expect(chatTurnInput?.teamId).toBe("team-1")
	expect(chatTurnInput?.podcastEpisodeChapter).toBeUndefined()
	expect(chatTurnInput?.retrievalQuestion).toBeUndefined()
	expect(chatTurnInput?.openNewTopicChatTool).toBeDefined()
	// the stored chat turn is on the team's page and names no chapter
	const [, streamedChatTurn] = streamChatTurnSpy.mock.calls[0] ?? []
	expect(streamedChatTurn?.page).toEqual({ teamId: "team-1" })
	expect(streamedChatTurn?.podcastEpisodeChapter).toBeUndefined()
})
