// chat room turn tests: carl posts his own rejection instead of a reply if the billed member's LiteLLM key cannot be
// created, and his reply to a spoken chat message is spoken too
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as monitoring from "@shared/monitoring"
import { restoreConnectionPool, stubConnectionPool } from "../../db/connectionPoolStub"
import * as chat from "../../worker/chat"
import * as litellm from "../../worker/litellm"
import { MODEL_CHAT_TURN_FAILED_REJECTION } from "../../worker/models"
import { decryptChatText, encryptChatText } from "./encryption"
import * as linkPreviews from "./linkPreviews"
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
	// the billed member's key, and the composed question, read without the window
	spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockResolvedValue("sk-member")
	spyOn(roomQuestion, "buildModelRoomQuestion").mockResolvedValue("the composed question")

	// the prompt chat message's row, spoken, no shared images, and the id of carl's inserted reply
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "room_attachments"')) {
			return []
		}
		// the prompt chat message's content and spoken flag, in the select's order
		if (text.startsWith("select") && text.includes('from "room_messages"')) {
			return [[encryptChatText("@carl who is hiring?"), true]]
		}
		return text.startsWith('insert into "room_messages"') ? [[43]] : []
	})

	// a reply of one text part, with the chat room notification and the link preview quiet
	const streamChatReplySpy = spyOn(chat, "streamChatReply").mockResolvedValue({
		replyParts: (async function* () {
			yield { type: "text", text: "Four of them." }
		})(),
		completion: Promise.resolve({ text: "Four of them.", totalTokens: 100, searchCount: 0, toolCalls: [] }),
	} as never)
	const notifyChatRoomMessageSpy = spyOn(roomStream, "notifyChatRoomMessage").mockResolvedValue(undefined)
	spyOn(linkPreviews, "saveLinkPreviews").mockResolvedValue(undefined)

	// run the chat room turn for the spoken chat message
	await runModelChatRoomTurn("member-1", null, "team-1", 7)

	// the reply was asked for out loud, with the spoken chat message as what retrieval embeds
	expect(streamChatReplySpy).toHaveBeenCalledWith(
		expect.objectContaining({ isSpoken: true, retrievalQuestion: "@carl who is hiring?", litellmApiKey: "sk-member" }),
	)

	// carl's reply row answers the prompt chat message and is marked spoken, and the chat room is told
	const replyInsertQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('insert into "room_messages"'))
	expect(replyInsertQuery?.values).toEqual([null, "team-1", "Carl", 7, expect.any(String), true])
	expect(decryptChatText(String(replyInsertQuery?.values[4]))).toBe("Four of them.")
	expect(notifyChatRoomMessageSpy).toHaveBeenCalledWith(null, "team-1", 43, expect.anything())
})
