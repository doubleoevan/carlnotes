import { expect, test } from "bun:test"
import {
	toActiveChatMention,
	toChangedMentionChatMessage,
	toChatMentionSuggestions,
	toInsertedChatMention,
} from "./chatMentions"
import { toReplyUser } from "./chatRoomReplies"
import { toStoryRoomMessage } from "./chatStoryFixtures"

// mentions start at a word boundary and insertion preserves the text after the caret
test("mention suggestions respect boundaries, case, and the native caret", () => {
	for (const text of ["hello@example", "name.@ca", "@@ca", "name-@ca"]) {
		expect(toActiveChatMention(text)).toBeNull()
	}
	expect(toActiveChatMention("Hello, @Ca")).toBe("Ca")
	expect(toChatMentionSuggestions("ca", ["carl", "Cathy", "reader"])).toEqual(["carl", "Cathy"])
	expect(toInsertedChatMention({ message: "Hi @ca keep this", caret: 6, username: "carl" })).toEqual({
		message: "Hi @carl  keep this",
		caret: 9,
	})
	expect(toChangedMentionChatMessage("@reader the question", "carl", ["reader"])).toBe("@carl the question")
})

// manual replies outrank a mention, while a mention overrides an automatic reply
test("reply targeting keeps the web's default and explicit selection rules", () => {
	const base = {
		chatMessage: "@carl the question",
		memberUsernames: ["reader"],
		replyTo: toStoryRoomMessage(),
		isAutoReply: false,
	}
	expect(toReplyUser(base)).toEqual({ hasMention: false, replyUser: "reader" })
	expect(toReplyUser({ ...base, isAutoReply: true })).toEqual({ hasMention: true, replyUser: "carl" })
	expect(toReplyUser({ ...base, chatMessage: "hello", replyTo: null })).toEqual({ hasMention: false, replyUser: "all" })
})
