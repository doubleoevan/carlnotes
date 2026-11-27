// the suggested reply's rollout setting: unset turns on every private chat, new-topic narrows it, off turns every chat
// off, and a typo throws
import { afterEach, expect, test } from "bun:test"
import { saveEnvSettings } from "./savedEnvSettings"
import { isSuggestedReplyOn, readSuggestedReplyChats } from "./suggestedReplySettings"

// put the setting back after each test
const restoreEnvSettings = saveEnvSettings(["SUGGESTED_REPLY_CHATS"])
afterEach(restoreEnvSettings)

test("unset turns on every private chat", () => {
	delete Bun.env.SUGGESTED_REPLY_CHATS
	expect(readSuggestedReplyChats()).toBe("all")
	expect(isSuggestedReplyOn({ isNewTopicChat: true })).toBe(true)
	expect(isSuggestedReplyOn({ isNewTopicChat: false })).toBe(true)
})

test("new-topic turns on the new-topic chat alone", () => {
	Bun.env.SUGGESTED_REPLY_CHATS = "new-topic"
	expect(isSuggestedReplyOn({ isNewTopicChat: true })).toBe(true)
	expect(isSuggestedReplyOn({ isNewTopicChat: false })).toBe(false)
})

test("off turns every chat off", () => {
	Bun.env.SUGGESTED_REPLY_CHATS = "off"
	expect(isSuggestedReplyOn({ isNewTopicChat: true })).toBe(false)
	expect(isSuggestedReplyOn({ isNewTopicChat: false })).toBe(false)
})

test("a typo throws and names the allowed values", () => {
	Bun.env.SUGGESTED_REPLY_CHATS = "al"
	expect(() => readSuggestedReplyChats()).toThrow("SUGGESTED_REPLY_CHATS must be all, new-topic, off, or unset")
})
