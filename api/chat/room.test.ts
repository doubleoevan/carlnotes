// who may delete one chat room message, decided without a database
import { expect, test } from "bun:test"
import { canDeleteChatRoomMessage, toBeforeChatMessageId, toChatMessagePage } from "./room"
import { CHAT_ROOM_LOAD_LIMIT } from "./roomMessages"

// the chat message's own author removes it whatever their team role is
test("the author deletes their own chat message", () => {
	expect(canDeleteChatRoomMessage("u1", "u1", "member", false)).toBe(true)
	expect(canDeleteChatRoomMessage("u1", "u1", null, false)).toBe(true)
})

// a leader moderates the chat room, so anyone's chat message goes
test("a leader deletes anyone's chat message", () => {
	expect(canDeleteChatRoomMessage("u1", "u2", "leader", false)).toBe(true)
})

// an admin reaches every chat room, including teams they do not belong to
test("an admin deletes anyone's chat message", () => {
	expect(canDeleteChatRoomMessage("u1", "u2", null, true)).toBe(true)
	expect(canDeleteChatRoomMessage("u1", "u2", "member", true)).toBe(true)
})

// a plain member has no say over somebody else's words
test("a member deletes nobody else's chat message", () => {
	expect(canDeleteChatRoomMessage("u1", "u2", "member", false)).toBe(false)
	expect(canDeleteChatRoomMessage("u1", "u2", null, false)).toBe(false)
})

// carl's chat messages record no account, so only a leader or an admin clears them
test("a chat message with no author needs a leader or an admin", () => {
	expect(canDeleteChatRoomMessage("u1", null, "member", false)).toBe(false)
	expect(canDeleteChatRoomMessage("u1", null, "leader", false)).toBe(true)
	expect(canDeleteChatRoomMessage("u1", null, null, true)).toBe(true)
})

// a chat room longer than one page is read backward, and only a usable id loads the page above
test("toBeforeChatMessageId takes a positive whole id and refuses anything else", () => {
	expect(toBeforeChatMessageId("42")).toBe(42)

	// no cursor means the latest page, the way an initial load reads it
	expect(toBeforeChatMessageId(undefined)).toBeUndefined()
	expect(toBeforeChatMessageId("")).toBeUndefined()

	// a value that is not a usable id would otherwise reach the query as NaN or a negative bound
	expect(toBeforeChatMessageId("nope")).toBeUndefined()
	expect(toBeforeChatMessageId("0")).toBeUndefined()
	expect(toBeforeChatMessageId("-3")).toBeUndefined()
	expect(toBeforeChatMessageId("1.5")).toBeUndefined()
})

// a full page may have another above it, and a short page is the room's first
test("toChatMessagePage reports more above only for a full page", () => {
	const fullChatMessagePage = Array.from({ length: CHAT_ROOM_LOAD_LIMIT }, (_, index) => ({ id: index }) as never)
	expect(toChatMessagePage(fullChatMessagePage).hasEarlierChatMessages).toBe(true)
	expect(toChatMessagePage(fullChatMessagePage.slice(1)).hasEarlierChatMessages).toBe(false)
	expect(toChatMessagePage([]).hasEarlierChatMessages).toBe(false)

	// the chat messages pass through untouched, in the order the load returned them
	expect(toChatMessagePage([]).chatMessages).toEqual([])
})
