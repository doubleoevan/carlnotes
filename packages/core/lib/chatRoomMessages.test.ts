import { expect, test } from "bun:test"
import type { ChatRoomMessage } from "@carlnotes/contracts/chat"
import { countEarlierChatMessages, mergeChatRoomMessages, toChatMessageQuotes } from "./chatRoomMessages"

test("room replay is ordered and deduplicated without losing refreshed preview metadata", () => {
	const knownChatMessages = [{ ...toChatRoomMessage(4), content: "fresh" }, toChatRoomMessage(6)]
	const mergedChatMessages = mergeChatRoomMessages(knownChatMessages, [
		toChatRoomMessage(7),
		toChatRoomMessage(4),
		toChatRoomMessage(5),
		toChatRoomMessage(7),
	])
	expect(mergedChatMessages.map((chatMessage) => chatMessage.id)).toEqual([4, 5, 6, 7])
	expect(mergedChatMessages[0]?.content).toBe("fresh")
})

test("earlier page overlap only shifts virtual indices for distinct preceding messages", () => {
	const knownChatMessages = [toChatRoomMessage(4), toChatRoomMessage(5)]
	const incomingChatMessages = [toChatRoomMessage(1), toChatRoomMessage(2), toChatRoomMessage(2), toChatRoomMessage(4)]
	expect(countEarlierChatMessages(knownChatMessages, incomingChatMessages)).toBe(2)
	expect(mergeChatRoomMessages(knownChatMessages, incomingChatMessages).map((chatMessage) => chatMessage.id)).toEqual([
		1, 2, 4, 5,
	])
})

test("quote lookup skips ordinary messages, adjacent replies and missing parents", () => {
	const messages = [
		toChatRoomMessage(1),
		toChatRoomMessage(2),
		{ ...toChatRoomMessage(3), replyToChatMessageId: 2 },
		{ ...toChatRoomMessage(4), replyToChatMessageId: 1 },
		{ ...toChatRoomMessage(5), replyToChatMessageId: 99 },
	]
	expect([...toChatMessageQuotes(messages)]).toEqual([[4, toChatRoomMessage(1)]])
})

// use complete server-shaped messages so merge tests exercise real ids and metadata
function toChatRoomMessage(id: number): ChatRoomMessage {
	return {
		id,
		content: String(id),
		authorUserId: "user",
		authorUsername: "reader",
		authorAvatarSource: null,
		authorAvatarVersion: null,
		replyToChatMessageId: null,
		createdAt: "2026-10-27T12:00:00Z",
		isSpoken: false,
		attachments: [],
		linkPreviews: [],
	}
}
