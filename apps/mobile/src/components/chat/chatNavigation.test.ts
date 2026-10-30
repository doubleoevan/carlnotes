import { expect, test } from "bun:test"
import type { ChatRoom } from "@carlnotes/contracts/chat"
import { toPrivateChatId, toPrivateChatPage } from "@carlnotes/core/lib/chatConversations"
import { toChatHref, toChatRoomHref, toInitialChatId, toNewTopicChatHref, toNewTopicChatId } from "./chatNavigation"

test("the global launcher retains Topic and Team note context", () => {
	// context-free pages use the same global destination
	for (const path of ["/", "/account", "/activity", "/teams", "/plans"]) {
		expect(toChatHref(path)).toBe("/chat")
	}
	// note screens keep the conversation addressed by their parent
	expect(toChatHref("/topics/topic-one/notes/note-one")).toBe("/topics/topic-one/chat")
	expect(toChatHref("/teams/team-one/notes/note-one")).toBe("/teams/team-one/chat")
	expect(toChatHref("/profiles/reader")).toEqual({ pathname: "/chat", params: { profileUserId: "reader" } })
})

// a page badge opens the chat room its team names, a topic's in that team or a team's own
test("a badge's chat room route names the topic's team, and opens first", () => {
	expect(toChatRoomHref({ topicId: "topic-one", chatTeamId: "team-one" })).toEqual({
		pathname: "/topics/[topicId]/chat",
		params: { topicId: "topic-one", chatTeamId: "team-one" },
	})
	expect(toChatRoomHref({ topicId: null, teamId: "team-one" })).toEqual({
		pathname: "/teams/[teamId]/chat",
		params: { teamId: "team-one" },
	})
	expect(toInitialChatId({ rooms: [], topicId: "topic-one", chatTeamId: "team-one" })).toEqual({
		kind: "room",
		teamId: "team-one",
		topicId: "topic-one",
	})
})

test("global chat selects an existing room and preserves the private switch", () => {
	const chatRoom: ChatRoom = {
		teamId: "team-one",
		topicId: null,
		name: "Readers",
		teamName: "Readers",
		teamAvatarVersion: null,
		chatMentions: [],
		chatRoomMembers: [],
	}
	// the one room opens first, and its private switch keeps the team
	const chatId = toInitialChatId({ rooms: [chatRoom] })
	expect(chatId).toEqual({ kind: "room", teamId: "team-one", topicId: null })
	const privateChatId = toPrivateChatId(null, chatId)
	expect(privateChatId).toEqual({ kind: "private", teamId: "team-one" })
	if (privateChatId?.kind === "private") {
		expect(toPrivateChatPage(privateChatId)).toEqual({ teamId: "team-one" })
	}
})

test("a user with no room and no page opens the new-topic chat, as on web", () => {
	// page context still opens private text chat without Team membership
	expect(toInitialChatId({ rooms: [], topicId: "topic-one" })).toEqual({ kind: "private", topicId: "topic-one" })
	expect(toInitialChatId({ rooms: [], teamId: "team-one" })).toEqual({ kind: "private", teamId: "team-one" })
	expect(toInitialChatId({ rooms: [] })).toEqual({ kind: "private", newTopic: true })
	expect(toPrivateChatPage({ kind: "private", newTopic: true })).toEqual({ newTopic: true, initialTeam: undefined })
})

test("an empty Feed opens the new-topic chat even where a room exists", () => {
	const chatRoom: ChatRoom = {
		teamId: "team-one",
		topicId: null,
		name: "Readers",
		teamName: "Readers",
		teamAvatarVersion: null,
		chatMentions: [],
		chatRoomMembers: [],
	}
	const pageContext = { topicId: null, teamId: null, name: "", joinTeam: null, isUserTopicFeedEmpty: true }
	expect(toInitialChatId({ rooms: [chatRoom], pageContext })).toEqual({ kind: "private", newTopic: true })
})

test("a New topic or Edit topic choice opens its chat ahead of any room", () => {
	const chatRoom: ChatRoom = {
		teamId: "team-one",
		topicId: "topic-one",
		name: "Prices",
		teamName: "Readers",
		teamAvatarVersion: null,
		chatMentions: [],
		chatRoomMembers: [],
	}
	toNewTopicChatHref({ teamId: "team-one", name: "Readers" })
	const newTopicChatId = toNewTopicChatId({ newTopic: "true", initialTeamId: "team-one" })
	expect(toInitialChatId({ rooms: [chatRoom], newTopicChatId })).toEqual({
		kind: "private",
		newTopic: true,
		initialTeam: { teamId: "team-one", name: "Readers" },
	})
	expect(toInitialChatId({ rooms: [chatRoom], topicId: "topic-one", isEditingTopic: true })).toEqual({
		kind: "private",
		topicId: "topic-one",
	})
	expect(toNewTopicChatId({})).toBeUndefined()
})

test("a new-topic chat link takes only the team its team screen passed, so an outside link sets no team", () => {
	toNewTopicChatHref({ teamId: "team-one", name: "Readers" })
	expect(toNewTopicChatId({ newTopic: "true", initialTeamId: "team-two" })).toEqual({ kind: "private", newTopic: true })
	toNewTopicChatHref()
	expect(toNewTopicChatId({ newTopic: "true", initialTeamId: "team-one" })).toEqual({ kind: "private", newTopic: true })
})
