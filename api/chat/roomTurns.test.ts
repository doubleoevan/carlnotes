// chat room turn tests: carl posts his own rejection instead of a reply
// if the billed member's LiteLLM key cannot be created
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as monitoring from "@shared/monitoring"
import { connectionPool } from "../../db"
import * as chat from "../../worker/chat"
import * as litellm from "../../worker/litellm"
import { MODEL_CHAT_TURN_FAILED_REJECTION } from "../../worker/models"
import { decryptChatText } from "./encryption"
import * as roomStream from "./roomStream"
import { runModelChatRoomTurn } from "./roomTurns"

// the connection pool's own query, put back after each test along with the spies
const originalConnectionPoolQuery = connectionPool.query
afterEach(() => {
	connectionPool.query = originalConnectionPoolQuery
	mock.restore()
})

// a key that cannot be created is reported, and the chat room gets carl's rejection with no model call
test("a chat room turn whose key cannot be created posts carl's rejection and makes no model call", async () => {
	// a key load that throws an error, with a quiet error report
	spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockRejectedValue(new Error("litellm key/generate failed: 500"))
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})

	// a connection pool that returns the id of the inserted chat message and keeps each query
	const sentQueries: { text: string; values: unknown[] }[] = []
	connectionPool.query = ((queryConfig: { text: string }, values: unknown[]) => {
		sentQueries.push({ text: queryConfig.text, values })
		return Promise.resolve({ rows: [[42]], fields: [], rowCount: 1 })
	}) as unknown as typeof connectionPool.query

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
