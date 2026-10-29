// tests for a member's view of a room's messages: their reported messages and their blocked people's are left out,
// and a delta is filtered by the blocked set alone
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { ChatRoomMessage } from "@carlnotes/contracts/chat"
import * as reports from "../report/reports"
import * as userBlocks from "../userBlocks"
import { toUnblockedChatRoomMessages, toVisibleChatRoomMessages } from "./roomVisibility"

afterEach(() => mock.restore())

// three messages: one by a blocked person, one the member reported, and Carl's
function toChatMessages(): ChatRoomMessage[] {
	return [toChatMessage(1, "user-blocked"), toChatMessage(2, "user-friend"), toChatMessage(3, null)]
}
function toChatMessage(id: number, authorUserId: string | null): ChatRoomMessage {
	return {
		id,
		content: "words",
		authorUserId,
		authorUsername: authorUserId ?? "Carl",
		authorAvatarSource: null,
		authorAvatarVersion: null,
		replyToChatMessageId: null,
		createdAt: "2026-10-29T12:00:00Z",
		isSpoken: false,
		attachments: [],
		linkPreviews: [],
	}
}

test("a loaded batch loses the member's reported messages and their blocked people's", async () => {
	spyOn(reports, "loadReportedSubjectIds").mockResolvedValue(new Set(["2"]))
	spyOn(userBlocks, "loadBlockedUserIds").mockResolvedValue(new Set(["user-blocked"]))
	const visibleChatMessages = await toVisibleChatRoomMessages("user-reader", toChatMessages())
	expect(visibleChatMessages.map((chatMessage) => chatMessage.id)).toEqual([3])
})

test("a member who hid nothing sees the batch as loaded, and a delta is filtered without a query", async () => {
	spyOn(reports, "loadReportedSubjectIds").mockResolvedValue(new Set())
	spyOn(userBlocks, "loadBlockedUserIds").mockResolvedValue(new Set())
	const chatMessages = toChatMessages()
	expect(await toVisibleChatRoomMessages("user-reader", chatMessages)).toBe(chatMessages)
	expect(
		toUnblockedChatRoomMessages(chatMessages, new Set(["user-blocked"])).map((chatMessage) => chatMessage.id),
	).toEqual([2, 3])
	expect(toUnblockedChatRoomMessages(chatMessages, new Set())).toBe(chatMessages)
})
