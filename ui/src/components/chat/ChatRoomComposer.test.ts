// username autocomplete tests: carl pinned first, the members narrowed by prefix, and nobody else
import { expect, test } from "bun:test"
import { toChangedMentionMessage, toChatMentionSuggestions, toMessage } from "./ChatRoomComposer"

// the members the chat room gives to the composer
const CHAT_MEMBERS = ["ana", "bo", "Cara"]

// an empty prefix offers carl first and then the other chat members
test("toChatMentionSuggestions pins carl ahead of the other members", () => {
	expect(toChatMentionSuggestions("", CHAT_MEMBERS)).toEqual(["carl", "ana", "bo", "Cara"])
})

// the prefix narrows case-insensitively
test("toChatMentionSuggestions narrows by the typed prefix", () => {
	expect(toChatMentionSuggestions("c", CHAT_MEMBERS)).toEqual(["carl", "Cara"])
	expect(toChatMentionSuggestions("CAR", CHAT_MEMBERS)).toEqual(["carl", "Cara"])
	expect(toChatMentionSuggestions("bo", CHAT_MEMBERS)).toEqual(["bo"])
})

// only the chat room's members are suggested, so a departed chat member or a non-member never appears
test("toChatMentionSuggestions only suggests the chat members", () => {
	expect(toChatMentionSuggestions("stranger", CHAT_MEMBERS)).toEqual([])
	// a members list spelling of carl merges with the pinned entry instead of doubling it
	expect(toChatMentionSuggestions("carl", ["Carl", "carlos"])).toEqual(["carl", "carlos"])
})

// stripping removes only a known leading username mention, so retargeting never stacks contradictory addresses
test("toMessageDraft removes a known leading username mention and nothing else", () => {
	expect(toMessage("@carl hello", [])).toBe("hello")
	expect(toMessage("@all hi", [])).toBe("hi")
	expect(toMessage("@Cara hi", ["Cara"])).toBe("hi")
	expect(toMessage("@stranger hi", [])).toBe("@stranger hi")
	expect(toMessage("hey @carl", [])).toBe("hey @carl")
})

// changing the mention swaps the leading username mention for the new one instead of stacking a second
test("toChangedMentionMessageDraft leads with the selected mention exactly once", () => {
	expect(toChangedMentionMessage("@carl hi", "all", [])).toBe("@all hi")
	expect(toChangedMentionMessage("plain draft", "carl", [])).toBe("@carl plain draft")
})
