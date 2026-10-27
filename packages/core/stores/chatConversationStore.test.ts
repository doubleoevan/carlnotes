import { afterEach, expect, test } from "bun:test"
import type { ChatRoom } from "@carlnotes/contracts/chat"
import {
	activateChatAccount,
	clearProposedTopicEdit,
	setChatId,
	startEditingTopic,
	toChatId,
	toCurrentChatAccountGuard,
	toCurrentChatGuard,
	toTopicEdit,
} from "./chatConversationStore"
import { markChatRoomOpened, setChatRooms, toChatRooms } from "./chatRoomStore"

afterEach(() => activateChatAccount(null))

// isolate a proposal from another team's room about the same topic
test("topic previews belong to the conversation that proposed them", () => {
	activateChatAccount("one")
	setChatId({ kind: "private", topicId: "topic" })
	startEditingTopic("topic", { tags: ["private"] })
	const isPrivateChatCurrent = toCurrentChatGuard()
	setChatId({ kind: "room", teamId: "team-a", topicId: "topic" })
	expect(toTopicEdit("topic")).toBeNull()
	startEditingTopic("topic", { tags: ["team"] })
	setChatId({ kind: "room", teamId: "team-b", topicId: "topic" })
	expect(toTopicEdit("topic")).toBeNull()
	setChatId({ kind: "private", topicId: "topic" })
	expect(toTopicEdit("topic")?.proposedTopicEdit).toEqual({ tags: ["private"] })
	expect(isPrivateChatCurrent()).toBe(false)
	clearProposedTopicEdit()
	expect(toTopicEdit("topic")).toEqual({ topicId: "topic", proposedTopicEdit: null })
})

// retire selected content and delayed callbacks when authentication changes
test("account replacement clears drafts and rejects old callbacks", () => {
	activateChatAccount("one")
	setChatId({ kind: "private", topicId: "topic" })
	startEditingTopic("topic", { frequency: "weekly" })
	const isCurrentChat = toCurrentChatGuard()
	activateChatAccount("two")
	expect(toChatId()).toBeNull()
	setChatId({ kind: "private", topicId: "topic" })
	expect(toTopicEdit("topic")).toBeNull()
	expect(isCurrentChat()).toBe(false)
})

// room names, excerpts and opened-room markers belong to one account
test("account replacement retires rooms and pending badge reads", () => {
	activateChatAccount("one")
	const room: ChatRoom = {
		teamId: "team",
		topicId: null,
		name: "Private room",
		teamName: "Private team",
		teamAvatarVersion: null,
		chatRoomMembers: [],
		chatMentions: [
			{ teamId: "team", chatMessageId: 1, authorUsername: "friend", isReply: false, excerpt: "Private excerpt" },
		],
	}
	setChatRooms([room])
	markChatRoomOpened(null, "team")
	const isCurrentAccount = toCurrentChatAccountGuard()
	expect(toChatRooms()[0]?.chatMentions).toEqual([])

	// a retired completion cannot restore the previous account's room
	activateChatAccount("two")
	expect(toChatRooms()).toEqual([])
	if (isCurrentAccount()) {
		setChatRooms([room])
	}
	expect(toChatRooms()).toEqual([])
	setChatRooms([room])
	expect(toChatRooms()[0]?.chatMentions).toEqual(room.chatMentions)
})
