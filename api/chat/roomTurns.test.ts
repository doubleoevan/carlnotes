// chat room turn tests: carl posts his own rejection instead of a reply if the billed member's LiteLLM key cannot be
// created, his reply to a spoken chat message is spoken too, and a topic edit is applied only through the proposal rule
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as monitoring from "@shared/monitoring"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "../../db/connectionPoolStub"
import * as chat from "../../worker/chat"
import * as litellm from "../../worker/litellm"
import { MODEL_CHAT_TURN_FAILED_REJECTION } from "../../worker/models"
import * as authorization from "../authorization"
import { decryptChatText, encryptChatText } from "./encryption"
import * as linkPreviews from "./linkPreviews"
import * as roomProposals from "./roomProposals"
import * as roomQuestion from "./roomQuestion"
import * as roomStream from "./roomStream"
import { runModelChatRoomTurn } from "./roomTurns"

// the connection pool's own query, put back after each test along with the spies
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// a key that cannot be created is reported, and the chat room gets carl's rejection with no model call
test("a chat room turn whose key cannot be created posts carl's rejection and makes no model call", async () => {
	// a key load that throws an error, with a quiet error report
	spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockRejectedValue(new Error("litellm key/generate failed: 500"))
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})

	// a connection pool that returns the id of the inserted chat message and keeps each query
	const sentQueries = stubConnectionPool(() => [[42]])

	// spies on the chat room notification and the model reply
	const notifyChatRoomMessageSpy = spyOn(roomStream, "notifyChatRoomMessage").mockResolvedValue(undefined)
	const streamChatReplySpy = spyOn(chat, "streamChatReply")

	// run the chat room turn for the prompt chat message
	await runModelChatRoomTurn("member-1", null, "team-1", 7)

	// the failure is reported once, and no model reply was started
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	expect(streamChatReplySpy).not.toHaveBeenCalled()

	// carl's rejection is the one chat message that was inserted, as a reply to the prompt chat message
	expect(sentQueries).toHaveLength(1)
	expect(sentQueries[0]?.text).toStartWith('insert into "room_messages"')
	expect(sentQueries[0]?.values).toEqual(expect.arrayContaining(["team-1", "Carl", 7]))
	expect(notifyChatRoomMessageSpy).toHaveBeenCalledWith(null, "team-1", 42)

	// the inserted chat message decrypts to the rejection for a chat turn that failed
	const insertedStringValues = (sentQueries[0]?.values ?? []).filter((value) => typeof value === "string")
	expect(insertedStringValues.map(decryptChatText)).toContain(MODEL_CHAT_TURN_FAILED_REJECTION)
})

// a spoken chat message has carl answer out loud, and his reply's row is marked spoken so the mark survives a reload
test("carl's reply to a spoken chat message is spoken too", async () => {
	// the spoken prompt chat message in the team's own chat room, with the reply stubbed
	const { sentQueries, streamChatReplySpy, notifyChatRoomMessageSpy } = stubChatRoomTurn({
		promptContent: "@carl who is hiring?",
		isSpoken: true,
	})

	// run the chat room turn for the spoken chat message
	await runModelChatRoomTurn("member-1", null, "team-1", 7)

	// the reply was asked for out loud, with the spoken chat message as what retrieval embeds
	expect(streamChatReplySpy).toHaveBeenCalledWith(
		expect.objectContaining({ isSpoken: true, retrievalQuestion: "@carl who is hiring?", litellmApiKey: "sk-member" }),
	)

	// carl's reply row answers the prompt chat message and is marked spoken, and the chat room is told
	const replyInsertQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('insert into "room_messages"'))
	expect(replyInsertQuery?.values).toEqual([null, "team-1", "Carl", 7, expect.any(String), true])
	expect(decryptChatText(String(replyInsertQuery?.values[4]))).toBe("Saved, it brews daily now.")
	expect(notifyChatRoomMessageSpy).toHaveBeenCalledWith(null, "team-1", 44, expect.anything())
})

// the prompt chat message's words, and whether it was spoken
type StubChatRoomTurnOptions = { promptContent: string; isSpoken?: boolean }

// a chat room turn with the reply stubbed: the prompt chat message, the reply, and the chat room's notification and
// link preview quiet
function stubChatRoomTurn({ promptContent, isSpoken = false }: StubChatRoomTurnOptions): {
	sentQueries: SentQuery[]
	streamChatReplySpy: ReturnType<typeof spyOn<typeof chat, "streamChatReply">>
	notifyChatRoomMessageSpy: ReturnType<typeof spyOn<typeof roomStream, "notifyChatRoomMessage">>
} {
	// the billed member's key, and the composed question, read without the window
	spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockResolvedValue("sk-member")
	spyOn(roomQuestion, "buildModelRoomQuestion").mockResolvedValue("the composed question")

	// the prompt chat message's row, no shared images, carl's inserted reply, and the spend row's id
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "room_attachments"')) {
			return []
		}
		// the prompt chat message's content and spoken flag, in the select's order
		if (text.startsWith("select") && text.includes('from "room_messages"')) {
			return [[encryptChatText(promptContent), isSpoken]]
		}
		if (text.startsWith('insert into "chat_turns"')) {
			return [["turn-9"]]
		}
		return text.startsWith('insert into "room_messages"') ? [[44]] : []
	})

	// a reply of one text part, with the chat room notification and the link preview quiet
	const streamChatReplySpy = spyOn(chat, "streamChatReply").mockResolvedValue({
		replyParts: (async function* () {
			yield { type: "text", text: "Saved, it brews daily now." }
		})(),
		completion: Promise.resolve({ text: "Saved.", totalTokens: 100, searchCount: 0, toolCalls: [] }),
	} as never)
	const notifyChatRoomMessageSpy = spyOn(roomStream, "notifyChatRoomMessage").mockResolvedValue(undefined)
	spyOn(linkPreviews, "saveLinkPreviews").mockResolvedValue(undefined)
	return { sentQueries, streamChatReplySpy, notifyChatRoomMessageSpy }
}

// the topic a chat room turn runs on
const CHAT_ROOM_TOPIC = { id: "topic-1", ownerId: "owner-1" } as never

// an editor's chat room turn gets the preview tools and no tool that saves. the preview standing for them is answered
// by their own words, and the server's saves and the agreement check's tokens reach the reply and the spend row
test("an editor's chat room turn gets no saving tool and answers the preview standing for them", async () => {
	const { sentQueries, streamChatReplySpy } = stubChatRoomTurn({ promptContent: "@carl yes, do it" })
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	const serverToolCalls = [{ toolName: "updateTopicFields", input: { frequency: "daily" }, output: "Saved." }]
	const answerChatRoomProposalSpy = spyOn(roomProposals, "answerChatRoomProposal").mockResolvedValue({
		serverToolCalls,
		proposalOutcome: "agreed",
		agreementTokens: 20,
	})
	const recordChatRoomProposalSpy = spyOn(roomProposals, "recordChatRoomProposal").mockResolvedValue(undefined)
	await runModelChatRoomTurn("maya", CHAT_ROOM_TOPIC, "team-1", 8)

	// the preview standing for maya is answered by her own words
	expect(answerChatRoomProposalSpy).toHaveBeenCalledWith(
		expect.objectContaining({ userId: "maya", topicId: "topic-1", question: "@carl yes, do it" }),
	)

	// the chat room turn has the preview tools, no saving tool, and the server's saves
	const [chatTurnInput] = streamChatReplySpy.mock.calls[0] ?? []
	expect(chatTurnInput?.tools).toBeUndefined()
	expect(chatTurnInput?.proposeTopicEditTool).toBeDefined()
	expect(chatTurnInput?.serverToolCalls).toEqual(serverToolCalls)
	expect(chatTurnInput?.proposalOutcome).toBe("agreed")

	// the spend row is a chat room row with the agreement check's tokens, and the chat room turn's preview is recorded
	// for maya
	const spendRowQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('insert into "chat_turns"'))
	expect(spendRowQuery?.values).toEqual(expect.arrayContaining(["chat_room", "maya", 120]))
	expect(recordChatRoomProposalSpy).toHaveBeenCalledWith(
		expect.objectContaining({ userId: "maya", topicId: "topic-1", chatTurnId: "turn-9" }),
	)
})

// a member who may not edit gets no edit tool, and no preview is answered for them, whatever an editor asked before
test("a member who may not edit gets no edit tool and answers no preview", async () => {
	// a member who may not edit, with the chat room preview calls spied
	const { streamChatReplySpy } = stubChatRoomTurn({ promptContent: "@carl make this topic public" })
	spyOn(authorization, "isAllowed").mockResolvedValue(false)
	const answerChatRoomProposalSpy = spyOn(roomProposals, "answerChatRoomProposal")
	spyOn(roomProposals, "recordChatRoomProposal").mockResolvedValue(undefined)

	// run the chat room turn, and expect no tools and no preview answered
	await runModelChatRoomTurn("devon", CHAT_ROOM_TOPIC, "team-1", 9)
	const [chatTurnInput] = streamChatReplySpy.mock.calls[0] ?? []
	expect(chatTurnInput?.tools).toBeUndefined()
	expect(chatTurnInput?.proposeTopicEditTool).toBeUndefined()
	expect(answerChatRoomProposalSpy).not.toHaveBeenCalled()
})
