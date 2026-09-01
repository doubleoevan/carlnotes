// who may delete one chat room message, decided without a database
import { expect, test } from "bun:test"
import { canDeleteChatRoomMessage } from "./room"

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
