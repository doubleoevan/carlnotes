// the badge store's one rule: a chat room opened this session clears the count everywhere at once

import { expect, test } from "bun:test"
import type { ChatMention, ChatRoom } from "@shared/contracts"
import { markChatRoomOpened, setChatRooms, toChatRooms } from "./chatRoomStore"

// one waiting chat mention, which is what a badge counts
const CHAT_MENTION: ChatMention = { teamId: "team-a", authorUsername: "ana", isReply: false, excerpt: "hi" }
// a team's own chat room and one of its topics', each with a chat mention waiting
const TEAM_ROOM: ChatRoom = {
	teamId: "team-a",
	topicId: null,
	name: "Agent Infra Crew",
	teamName: "Agent Infra Crew",
	teamHasAvatar: false,
	chatMentions: [CHAT_MENTION],
	chatRoomMembers: [],
}
const TOPIC_ROOM: ChatRoom = { ...TEAM_ROOM, topicId: "topic-1", name: "Speed reading", chatMentions: [CHAT_MENTION] }

// the chat menu's rows read this, so a row gets clears the moment its chat room opens instead of on the next poll
test("opening a room clears its mentions and leaves the others alone", () => {
	setChatRooms([TEAM_ROOM, TOPIC_ROOM])
	expect(toChatRooms().map((room) => room.chatMentions.length)).toEqual([1, 1])
	// the team's own chat room takes a null topic, which is what tells it from the topic's chat room in that team
	markChatRoomOpened(null, "team-a")
	expect(toChatRooms().map((room) => room.chatMentions.length)).toEqual([0, 1])
})

// the profile row and the teams row divide every chat room between them, so no chat mention is counted twice
test("the topic rooms and the team rooms cover every room exactly once", () => {
	setChatRooms([TEAM_ROOM, TOPIC_ROOM])
	const chatRooms = toChatRooms()
	const topicMentions = chatRooms.flatMap((chatRoom) => (chatRoom.topicId === null ? [] : chatRoom.chatMentions))
	const teamMentions = chatRooms.flatMap((chatRoom) => (chatRoom.topicId === null ? chatRoom.chatMentions : []))
	expect(topicMentions.length + teamMentions.length).toBe(chatRooms.flatMap((chatRoom) => chatRoom.chatMentions).length)
})
