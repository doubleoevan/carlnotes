// a question asked from a Topic Post's page on the topic chat route: the post it names must be a published post of
// this topic before any model call, the turn takes no topic tool, and its stored turn names the post. a team's chat
// ignores the post
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import * as litellm from "@carlnotes/models/litellm"
import { stubReservedUserSpend } from "@carlnotes/models/spendReservationTestFixtures"
import * as chat from "@carlnotes/pipeline/chat/index"
import * as retrieveTopicPost from "@carlnotes/pipeline/chat/retrieveTopicPost"
import { toJsonRequest, toSignedInApp } from "../testSession"
import * as chatProposals from "./chatProposals"
import * as chatTurnAuthorization from "./chatTurnAuthorization"
import * as chatTurnStream from "./chatTurnStream"
import { privateChatRoute } from "./privateChat"

// put the spies and the Redis client back after each test
afterEach(() => {
	mock.restore()
	restoreRedisClient()
})

// what a chat turn reads of the post
const TOPIC_POST = {
	topicPostId: "post-1",
	title: "Dialing in",
	text: "Start light.",
	comments: [{ username: "roastfan", body: "The pancake part is right." }],
}

// stub user-1 as the topic's owner, allowed to chat and to edit under the given gate, with the turn's largest cost
// reserved and sk-user as the key, and return the spies the cases read
function stubAllowedChatTurn(gateName: "authorizeChatTurn" | "authorizeTeamChatTurn"): {
	loadKeySpy: ReturnType<typeof spyOn>
	loadTopicPostSpy: ReturnType<typeof spyOn<typeof retrieveTopicPost, "loadTopicPostChatContext">>
} {
	// user-1 may chat and edit under the gate, over a fake Redis
	stubRedisClient()
	spyOn(chatTurnAuthorization, gateName).mockResolvedValue({
		status: "allowed",
		userId: "user-1",
		isTopicOwner: true,
		isPersisted: true,
		canEditTopic: true,
	})

	// every turn's largest cost is reserved, the key load returns sk-user, and the post's load is spied
	stubReservedUserSpend()
	return {
		loadKeySpy: spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockResolvedValue("sk-user"),
		loadTopicPostSpy: spyOn(retrieveTopicPost, "loadTopicPostChatContext"),
	}
}

// a question about post-1 posted to topic-1's chat as user-1
function askAboutTopicPost(body: Record<string, unknown> = {}): Promise<Response> {
	return Promise.resolve(
		toSignedInApp(privateChatRoute, "user-1").request(
			"/topics/topic-1/chat",
			toJsonRequest({ question: "what does this say?", topicPostId: "post-1", ...body }),
		),
	)
}

// a draft, a post that is gone, and a post of another topic all load as no post
test("a question naming a post this topic does not show is rejected before any model call", async () => {
	const { loadKeySpy, loadTopicPostSpy } = stubAllowedChatTurn("authorizeChatTurn")
	loadTopicPostSpy.mockResolvedValue(null)
	expect((await askAboutTopicPost()).status).toBe(404)
	expect(loadTopicPostSpy).toHaveBeenCalledWith({ topicId: "topic-1", topicPostId: "post-1", userId: "user-1" })
	expect(loadKeySpy).not.toHaveBeenCalled()
})

test("a question is never asked from the podcast player and from a post's page at once", async () => {
	const { loadTopicPostSpy } = stubAllowedChatTurn("authorizeChatTurn")
	const response = await askAboutTopicPost({
		isSpoken: true,
		podcastEpisodeChapter: { podcastEpisodeId: "episode-1", chapterPosition: 0 },
	})
	expect(response.status).toBe(400)
	expect(loadTopicPostSpy).not.toHaveBeenCalled()
})

// the owner may edit the topic, and the post's chat still binds no topic tool and answers no proposal
test("an owner's question about a post reads the post, binds no topic tool, and stores the post on its turn", async () => {
	const { loadTopicPostSpy } = stubAllowedChatTurn("authorizeChatTurn")
	loadTopicPostSpy.mockResolvedValue(TOPIC_POST)
	const answerChatProposalSpy = spyOn(chatProposals, "answerChatProposal")
	const streamChatReplySpy = spyOn(chat, "streamChatReply").mockResolvedValue({} as never)
	const streamChatTurnSpy = spyOn(chatTurnStream, "streamChatTurn").mockReturnValue(new Response("streamed"))
	expect((await askAboutTopicPost()).status).toBe(200)

	// the reply reads the post with its shared Comment, and no tool that edits or proposes
	const [chatTurnInput] = streamChatReplySpy.mock.calls[0] ?? []
	expect(chatTurnInput?.topicPost).toEqual(TOPIC_POST)
	expect(chatTurnInput?.tools).toBeUndefined()
	expect(chatTurnInput?.proposeTopicEditTool).toBeUndefined()
	expect(chatTurnInput?.openNewTopicChatTool).toBeUndefined()
	expect(answerChatProposalSpy).not.toHaveBeenCalled()

	// the stored turn names the post, and whether the user owns its topic
	const [, streamedChatTurn] = streamChatTurnSpy.mock.calls[0] ?? []
	expect(streamedChatTurn).toMatchObject({ page: { topicId: "topic-1" }, topicPostId: "post-1", isTopicOwner: true })
})

test("a team chat turn naming a post is answered as an ordinary team chat turn", async () => {
	const { loadTopicPostSpy } = stubAllowedChatTurn("authorizeTeamChatTurn")
	const streamChatReplySpy = spyOn(chat, "streamChatReply").mockResolvedValue({} as never)
	const streamChatTurnSpy = spyOn(chatTurnStream, "streamChatTurn").mockReturnValue(new Response("streamed"))
	const response = await toSignedInApp(privateChatRoute, "user-1").request(
		"/teams/team-1/chat",
		toJsonRequest({ question: "what does this say?", topicPostId: "post-1" }),
	)
	expect(response.status).toBe(200)

	// no post is read, and neither the reply nor the stored turn names one
	expect(loadTopicPostSpy).not.toHaveBeenCalled()
	expect(streamChatReplySpy.mock.calls[0]?.[0]?.topicPost).toBeUndefined()
	expect(streamChatTurnSpy.mock.calls[0]?.[1]?.topicPostId).toBeUndefined()
})
