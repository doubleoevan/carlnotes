import { describe, expect, test } from "bun:test"
import type { ChatRoom } from "@shared/contracts"
import {
	type ChatPageContext,
	isSameChat,
	setChatId,
	setChatPanelState,
	toChatId,
	toDefaultChatId,
} from "@/stores/chatPanelStore"

describe("isSameChat", () => {
	// nothing selected yet is never a match, which is what leaves every menu row unchecked on first open
	test("no chatId matches nothing", () => {
		expect(isSameChat(null, { kind: "room", teamId: "team-a", topicId: null })).toBe(false)
	})

	// a team's own chat room and a topic's chat room on the same team are different conversations
	test("a team room and one of its topic rooms are not the same", () => {
		const teamChatRoom = { kind: "room", teamId: "team-a", topicId: null } as const
		const topicChatRoom = { kind: "room", teamId: "team-a", topicId: "topic-1" } as const
		expect(isSameChat(teamChatRoom, topicChatRoom)).toBe(false)
		expect(isSameChat(teamChatRoom, teamChatRoom)).toBe(true)
	})

	// the same topic in two teams is two chat rooms, one per pair
	test("one topic in two teams is two rooms", () => {
		const teamAChatId = { kind: "room", teamId: "team-a", topicId: "topic-1" } as const
		const teamBChatId = { kind: "room", teamId: "team-b", topicId: "topic-1" } as const
		expect(isSameChat(teamAChatId, teamBChatId)).toBe(false)
	})

	// a private chat is named by its topic alone, and never matches that topic's shared chat room
	test("a private chat never matches a room", () => {
		const privateChat = { kind: "private", topicId: "topic-1" } as const
		expect(isSameChat(privateChat, { kind: "room", teamId: "team-a", topicId: "topic-1" })).toBe(false)
		expect(isSameChat(privateChat, privateChat)).toBe(true)
		expect(isSameChat(privateChat, { kind: "private", topicId: "topic-2" })).toBe(false)
	})
})

// the chat rooms a user might have, latest first the way the api returns them
const TEAM_CHAT_ROOM: ChatRoom = {
	teamId: "team-a",
	topicId: null,
	name: "Agent Infra Crew",
	teamName: "Agent Infra Crew",
	teamHasAvatar: false,
	chatMentions: [],
	chatRoomMembers: [],
}
const TOPIC_CHAT_ROOM: ChatRoom = {
	teamId: "team-a",
	topicId: "topic-1",
	name: "Speed reading",
	teamName: "Agent Infra Crew",
	teamHasAvatar: false,
	chatMentions: [],
	chatRoomMembers: [],
}

// a page context in the shape a page registers, with only what the default chat reads set
function toPageContext(pageContext: Partial<ChatPageContext>): ChatPageContext {
	return { topicId: null, teamId: null, name: "", joinTeam: null, ...pageContext }
}

// one unread chat mention, in the shape a chat room holds them
const CHAT_MENTION = { teamId: "team-a", chatMessageId: 1, authorUsername: "someone", isReply: false, excerpt: "hi" }

describe("toDefaultChatId", () => {
	// the panel selects once per open, so a page about nothing still opens something useful
	test("a page about nothing with nothing waiting opens the first room", () => {
		expect(toDefaultChatId(null, [TOPIC_CHAT_ROOM, TEAM_CHAT_ROOM])).toEqual({
			kind: "room",
			teamId: "team-a",
			topicId: "topic-1",
		})
	})

	// what is waiting outranks the order, so the panel opens where someone is asking for you
	test("a page about nothing opens whichever room has the most waiting", () => {
		const busyChatRoom = { ...TEAM_CHAT_ROOM, chatMentions: [CHAT_MENTION, CHAT_MENTION] }
		const quietChatRoom = { ...TOPIC_CHAT_ROOM, chatMentions: [CHAT_MENTION] }
		expect(toDefaultChatId(null, [quietChatRoom, busyChatRoom])).toEqual({
			kind: "room",
			teamId: "team-a",
			topicId: null,
		})
	})

	// a page naming teams, which a profile does, opens one of theirs before anything else waiting
	test("a named team with a mention beats a busier chat room elsewhere", () => {
		const namedChatRoom = { ...TEAM_CHAT_ROOM, teamId: "team-b", name: "Their team", chatMentions: [CHAT_MENTION] }
		const busierChatRoom = { ...TOPIC_CHAT_ROOM, chatMentions: [CHAT_MENTION, CHAT_MENTION] }
		const pageContext = toPageContext({ pageTeamIds: ["team-b"] })
		expect(toDefaultChatId(pageContext, [busierChatRoom, namedChatRoom])).toEqual({
			kind: "room",
			teamId: "team-b",
			topicId: null,
		})
	})

	// a named team with nothing waiting is not a reason to open it over the busiest chat room
	test("a named team with nothing waiting falls back to the busiest chat room", () => {
		const namedChatRoom = { ...TEAM_CHAT_ROOM, teamId: "team-b", name: "Their team", chatMentions: [] }
		const busierChatRoom = { ...TOPIC_CHAT_ROOM, chatMentions: [CHAT_MENTION] }
		const pageContext = toPageContext({ pageTeamIds: ["team-b"] })
		expect(toDefaultChatId(pageContext, [namedChatRoom, busierChatRoom])).toEqual({
			kind: "room",
			teamId: "team-a",
			topicId: "topic-1",
		})
	})

	// the teams index leads with a team's own chat room even when a topic's has more waiting
	test("a team-first page takes the busiest team room over a busier topic room", () => {
		const teamChatRoom = { ...TEAM_CHAT_ROOM, chatMentions: [CHAT_MENTION] }
		const topicChatRoom = { ...TOPIC_CHAT_ROOM, chatMentions: [CHAT_MENTION, CHAT_MENTION] }
		const pageContext = toPageContext({ preferredChatRoomKind: "team" })
		expect(toDefaultChatId(pageContext, [topicChatRoom, teamChatRoom])).toEqual({
			kind: "room",
			teamId: "team-a",
			topicId: null,
		})
	})

	// with nothing waiting in its preferred kind it falls to the other, instead of opening a quiet chat room
	test("a team-first page falls back to a topic room when no team room waits", () => {
		const teamChatRoom = { ...TEAM_CHAT_ROOM, chatMentions: [] }
		const topicChatRoom = { ...TOPIC_CHAT_ROOM, chatMentions: [CHAT_MENTION] }
		const pageContext = toPageContext({ preferredChatRoomKind: "team" })
		expect(toDefaultChatId(pageContext, [teamChatRoom, topicChatRoom])).toEqual({
			kind: "room",
			teamId: "team-a",
			topicId: "topic-1",
		})
	})

	// a profile is the mirror of the index: a topic's chat room leads, a team's is the fallback
	test("a topic-first page takes the busiest topic room over a busier team room", () => {
		const teamChatRoom = { ...TEAM_CHAT_ROOM, chatMentions: [CHAT_MENTION, CHAT_MENTION] }
		const topicChatRoom = { ...TOPIC_CHAT_ROOM, chatMentions: [CHAT_MENTION] }
		const pageContext = toPageContext({ preferredChatRoomKind: "topic" })
		expect(toDefaultChatId(pageContext, [teamChatRoom, topicChatRoom])).toEqual({
			kind: "room",
			teamId: "team-a",
			topicId: "topic-1",
		})
	})

	// a mention count tie chooses a team chat room over a topic chat room
	test("a team chat room beats a topic room on the same count", () => {
		const topicChatRoom = { ...TOPIC_CHAT_ROOM, chatMentions: [CHAT_MENTION] }
		const teamChatRoom = { ...TEAM_CHAT_ROOM, chatMentions: [CHAT_MENTION] }
		expect(toDefaultChatId(null, [topicChatRoom, teamChatRoom])).toEqual({
			kind: "room",
			teamId: "team-a",
			topicId: null,
		})
	})

	// within one kind a tie keeps the earlier chat room, which the api already ordered latest first
	test("a tie between two team chat rooms keeps the earlier one", () => {
		const earlierChatRoom = { ...TEAM_CHAT_ROOM, teamId: "team-a", chatMentions: [CHAT_MENTION] }
		const laterChatRoom = { ...TEAM_CHAT_ROOM, teamId: "team-b", chatMentions: [CHAT_MENTION] }
		expect(toDefaultChatId(null, [earlierChatRoom, laterChatRoom])).toEqual({
			kind: "room",
			teamId: "team-a",
			topicId: null,
		})
	})

	test("a user with no rooms gets no chatId, which is what shows the create call to action", () => {
		expect(toDefaultChatId(null, [])).toBeNull()
	})

	// a topic page opens that topic's chat room wherever the user has one
	test("a topic page opens that topic's chat room", () => {
		const pageContext = toPageContext({ topicId: "topic-1", name: "Speed reading" })
		expect(toDefaultChatId(pageContext, [TEAM_CHAT_ROOM, TOPIC_CHAT_ROOM])).toEqual({
			kind: "room",
			teamId: "team-a",
			topicId: "topic-1",
		})
	})

	// the private chat is the fallback the closest match to the page wins
	test("a topic page with no room of its own opens its private chat", () => {
		const pageContext = toPageContext({ topicId: "topic-9", name: "A topic" })
		const busierChatRoom = { ...TEAM_CHAT_ROOM, chatMentions: [CHAT_MENTION, CHAT_MENTION] }
		expect(toDefaultChatId(pageContext, [busierChatRoom])).toEqual({ kind: "private", topicId: "topic-9" })
	})

	// a page about no conversation never reaches a private chat
	test("a page about nothing opens no private chat", () => {
		expect(toDefaultChatId(null, [])).toBeNull()
	})

	// a team page opens the team's own chat room, never one of its topics
	test("a team page opens the team's own room", () => {
		const pageContext = toPageContext({ teamId: "team-a", name: "Agent Infra Crew" })
		expect(toDefaultChatId(pageContext, [TOPIC_CHAT_ROOM, TEAM_CHAT_ROOM])).toEqual({
			kind: "room",
			teamId: "team-a",
			topicId: null,
		})
	})

	// an outsider has no chat room to open, so the chatId names the team the join button belongs to
	test("a team page the user is not on aims at the team it offers joining", () => {
		const pageContext = toPageContext({
			teamId: "team-b",
			name: "Lets Build",
			joinTeam: { teamId: "team-b", name: "Lets Build", hasAvatar: false, hasRequestedToJoin: false },
		})
		expect(toDefaultChatId(pageContext, [TEAM_CHAT_ROOM])).toEqual({ kind: "room", teamId: "team-b", topicId: null })
	})

	// a private team names nothing
	test("a team page with no room and no way in opens a room the user has", () => {
		const pageContext = toPageContext({ teamId: "team-b", name: "Lets Build" })
		expect(toDefaultChatId(pageContext, [TEAM_CHAT_ROOM])).toEqual({ kind: "room", teamId: "team-a", topicId: null })
	})

	test("a team page opens nothing when the user has no rooms and no way in", () => {
		const pageContext = toPageContext({ teamId: "team-b", name: "Lets Build" })
		expect(toDefaultChatId(pageContext, [])).toBeNull()
	})
})

// minimizing is closing, so the next open selects for the page it opens on instead of reopening the last chat room
test("minimizing forgets the room and opening again does not", () => {
	setChatId({ kind: "room", teamId: "team-a", topicId: null })
	expect(toChatId()).toEqual({ kind: "room", teamId: "team-a", topicId: null })
	setChatPanelState("open")
	expect(toChatId()).not.toBeNull()
	setChatPanelState("collapsed")
	expect(toChatId()).toBeNull()
})

// a topic a team holds offers the way in, which is closer to the page than the user's own chat
test("a topic page with no room opens the way into the team that has it", () => {
	const pageContext = toPageContext({
		topicId: "topic-9",
		name: "A topic",
		joinTeam: { teamId: "team-z", name: "Their team", hasAvatar: false, hasRequestedToJoin: false },
	})
	expect(toDefaultChatId(pageContext, [])).toEqual({ kind: "room", teamId: "team-z", topicId: "topic-9" })
})

// an empty chat room list looks the same as having no chat rooms
test("nothing is selected while there are no rooms to select from", () => {
	const pageContext = toPageContext({ teamId: "team-a", name: "A team" })
	expect(toDefaultChatId(pageContext, [])).toBeNull()
})

// a topic page names its own topic, so every team's chat room for it is marked and preferred alike
test("a page naming a topic prefers that topic's room over a busier one elsewhere", () => {
	const pageTopicChatRoom = { ...TOPIC_CHAT_ROOM, teamId: "team-b", chatMentions: [CHAT_MENTION] }
	const busierChatRoom = { ...TEAM_CHAT_ROOM, chatMentions: [CHAT_MENTION, CHAT_MENTION] }
	const pageContext = toPageContext({ pageTopicIds: ["topic-1"] })
	expect(toDefaultChatId(pageContext, [busierChatRoom, pageTopicChatRoom])).toEqual({
		kind: "room",
		teamId: "team-b",
		topicId: "topic-1",
	})
})
