// chat mention parser tests: username targets, separator spellings, and the false positives that must stay silent
import { expect, test } from "bun:test"
import { CARL_USERNAME, hasModelMention, isModelChatMessage, toChatMentions, toMentionedUserIds } from "./chatMentions"

// the members the chat room hands the parser
const MEMBERS = [CARL_USERNAME, "hirecarl", "Seeded-Member-1"]

// a chat mention inside a longer sentence finds its username, for carl and for a member alike
test("toChatMentions finds carl and members inside sentences", () => {
	expect(toChatMentions("@carl, your thoughts on this?", MEMBERS)).toEqual(["carl"])
	expect(toChatMentions("I think @hirecarl saw this already", MEMBERS)).toEqual(["hirecarl"])
	// separator spellings normalize onto the members username
	expect(toChatMentions("ping @seededmember1 about it", MEMBERS)).toEqual(["Seeded-Member-1"])
})

// an email address is not a chat mention, and neither is an unknown username
test("toChatMentions ignores email addresses and unknown usernames", () => {
	expect(toChatMentions("write to carl@example.com instead", MEMBERS)).toEqual([])
	expect(toChatMentions("@stranger has no account here", MEMBERS)).toEqual([])
})

// one message can address several people, each counted once
test("toChatMentions dedupes and keeps order", () => {
	expect(toChatMentions("@carl and @hirecarl and @carl again", MEMBERS)).toEqual(["carl", "hirecarl"])
})

// the carl check is the same parse narrowed to his reserved username
test("hasModelMention answers only for carl", () => {
	expect(hasModelMention("@carl what do you think")).toBe(true)
	expect(hasModelMention("carl thinks this is fine")).toBe(false)
	expect(hasModelMention("mail carl@carlnotes.dev today")).toBe(false)
})

// the selection the chat room notifies from: @all fans out to everyone, carl never gets a row
test("toMentionedUserIds selects the named members, fans out @all, and skips carl and the author", () => {
	const members = [
		{ userId: "u1", username: "Penny" },
		{ userId: "u2", username: "Sam" },
	]
	expect(toMentionedUserIds("@penny hi", members, "u2")).toEqual(["u1"])
	expect(toMentionedUserIds("@all morning", members, "u1")).toEqual(["u2"])
	expect(toMentionedUserIds("@carl what changed?", members, "u1")).toEqual([])
	expect(toMentionedUserIds("@sam note to self", members, "u2")).toEqual([])
})

// a closed account keeps the name its messages were written under while losing its author reference
test("isModelChatMessage tells carl from a departed member", () => {
	expect(isModelChatMessage({ authorUserId: null, authorUsername: "Carl" })).toBe(true)
	expect(isModelChatMessage({ authorUserId: null, authorUsername: "hirecarl" })).toBe(false)
	expect(isModelChatMessage({ authorUserId: "user_1", authorUsername: "Carl" })).toBe(false)
})
