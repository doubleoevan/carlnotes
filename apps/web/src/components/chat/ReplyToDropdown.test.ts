// reply target tests: the leading chat mention is stripped or swapped, never stacked
import { expect, test } from "bun:test"
import { toChangedMentionChatMessage, toChatMessage } from "./ReplyToDropdown"

// stripping removes only a known leading username chat mention, so retargeting never stacks contradictory addresses
test("toMessageDraft removes a known leading username mention and nothing else", () => {
	expect(toChatMessage("@carl hello", [])).toBe("hello")
	expect(toChatMessage("@all hi", [])).toBe("hi")
	expect(toChatMessage("@Cara hi", ["Cara"])).toBe("hi")
	expect(toChatMessage("@stranger hi", [])).toBe("@stranger hi")
	expect(toChatMessage("hey @carl", [])).toBe("hey @carl")
})

// changing the chat mention swaps the leading username chat mention for the new one instead of stacking a second
test("toChangedMentionMessageDraft leads with the selected mention exactly once", () => {
	expect(toChangedMentionChatMessage("@carl hi", "all", [])).toBe("@all hi")
	expect(toChangedMentionChatMessage("plain draft", "carl", [])).toBe("@carl plain draft")
})
