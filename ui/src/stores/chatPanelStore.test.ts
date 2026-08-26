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

	// a team's own room and a topic's room on the same team are different conversations
	test("a team room and one of its topic rooms are not the same", () => {
		const teamRoom = { kind: "room", teamId: "team-a", topicId: null } as const
		const topicRoom = { kind: "room", teamId: "team-a", topicId: "topic-1" } as const
		expect(isSameChat(teamRoom, topicRoom)).toBe(false)
		expect(isSameChat(teamRoom, teamRoom)).toBe(true)
	})

	// the same topic in two teams is two rooms, one per pair
	test("one topic in two teams is two rooms", () => {
		const first = { kind: "room", teamId: "team-a", topicId: "topic-1" } as const
		const second = { kind: "room", teamId: "team-b", topicId: "topic-1" } as const
		expect(isSameChat(first, second)).toBe(false)
	})

	// a private chat is named by its topic alone, and never matches that topic's shared room
	test("a private chat never matches a room", () => {
		const privateChat = { kind: "private", topicId: "topic-1" } as const
		expect(isSameChat(privateChat, { kind: "room", teamId: "team-a", topicId: "topic-1" })).toBe(false)
		expect(isSameChat(privateChat, privateChat)).toBe(true)
		expect(isSameChat(privateChat, { kind: "private", topicId: "topic-2" })).toBe(false)
	})
})

// the rooms a user might have, newest first the way the api returns them
const TEAM_ROOM: ChatRoom = {
	teamId: "team-a",
	topicId: null,
	name: "Agent Infra Crew",
	teamName: "Agent Infra Crew",
	teamHasAvatar: false,
	mentions: [],
}
const TOPIC_ROOM: ChatRoom = {
	teamId: "team-a",
	topicId: "topic-1",
	name: "Speed reading",
	teamName: "Agent Infra Crew",
	teamHasAvatar: false,
	mentions: [],
}

// a page context in the shape a page registers, with only what the default chat reads set
function toContext(context: Partial<ChatPageContext>): ChatPageContext {
	return { topicId: null, teamId: null, name: "", joinTeam: null, ...context }
}

// one unseen mention, in the shape a room holds them
const MENTION = { teamId: "team-a", authorUsername: "someone", isReply: false, excerpt: "hi" }

describe("toDefaultChatId", () => {
	// the panel selects once per open, so a page about nothing still opens something useful
	test("a page about nothing with nothing waiting opens the first room", () => {
		expect(toDefaultChatId(null, [TOPIC_ROOM, TEAM_ROOM])).toEqual({
			kind: "room",
			teamId: "team-a",
			topicId: "topic-1",
		})
	})

	// what is waiting outranks the order, so the panel opens where someone is asking for you
	test("a page about nothing opens whichever room has the most waiting", () => {
		const busy = { ...TEAM_ROOM, mentions: [MENTION, MENTION] }
		const quiet = { ...TOPIC_ROOM, mentions: [MENTION] }
		expect(toDefaultChatId(null, [quiet, busy])).toEqual({ kind: "room", teamId: "team-a", topicId: null })
	})

	// a page naming teams, which a profile does, opens one of theirs before anything else waiting
	test("a named team with a mention beats a busier room elsewhere", () => {
		const named = { ...TEAM_ROOM, teamId: "team-b", name: "Their team", mentions: [MENTION] }
		const busier = { ...TOPIC_ROOM, mentions: [MENTION, MENTION] }
		const context = toContext({ pageTeamIds: ["team-b"] })
		expect(toDefaultChatId(context, [busier, named])).toEqual({ kind: "room", teamId: "team-b", topicId: null })
	})

	// a named team with nothing waiting is not a reason to open it over the busiest room
	test("a named team with nothing waiting falls back to the busiest room", () => {
		const named = { ...TEAM_ROOM, teamId: "team-b", name: "Their team", mentions: [] }
		const busier = { ...TOPIC_ROOM, mentions: [MENTION] }
		const context = toContext({ pageTeamIds: ["team-b"] })
		expect(toDefaultChatId(context, [named, busier])).toEqual({
			kind: "room",
			teamId: "team-a",
			topicId: "topic-1",
		})
	})

	// the teams index leads with a team's own room even when a topic's has more waiting
	test("a team-first page takes the busiest team room over a busier topic room", () => {
		const teamRoom = { ...TEAM_ROOM, mentions: [MENTION] }
		const topicRoom = { ...TOPIC_ROOM, mentions: [MENTION, MENTION] }
		const context = toContext({ preferredRoomKind: "team" })
		expect(toDefaultChatId(context, [topicRoom, teamRoom])).toEqual({
			kind: "room",
			teamId: "team-a",
			topicId: null,
		})
	})

	// with nothing waiting in its preferred kind it falls to the other, instead of opening a quiet room
	test("a team-first page falls back to a topic room when no team room waits", () => {
		const teamRoom = { ...TEAM_ROOM, mentions: [] }
		const topicRoom = { ...TOPIC_ROOM, mentions: [MENTION] }
		const context = toContext({ preferredRoomKind: "team" })
		expect(toDefaultChatId(context, [teamRoom, topicRoom])).toEqual({
			kind: "room",
			teamId: "team-a",
			topicId: "topic-1",
		})
	})

	// a profile is the mirror of the index: a topic's room leads, a team's is the fallback
	test("a topic-first page takes the busiest topic room over a busier team room", () => {
		const teamRoom = { ...TEAM_ROOM, mentions: [MENTION, MENTION] }
		const topicRoom = { ...TOPIC_ROOM, mentions: [MENTION] }
		const context = toContext({ preferredRoomKind: "topic" })
		expect(toDefaultChatId(context, [teamRoom, topicRoom])).toEqual({
			kind: "room",
			teamId: "team-a",
			topicId: "topic-1",
		})
	})

	// a tie keeps the first, which the api already ordered newest first a team's conversation is the one more
	test("a team room beats a topic room on the same count", () => {
		const topicRoom = { ...TOPIC_ROOM, mentions: [MENTION] }
		const teamRoom = { ...TEAM_ROOM, mentions: [MENTION] }
		expect(toDefaultChatId(null, [topicRoom, teamRoom])).toEqual({ kind: "room", teamId: "team-a", topicId: null })
	})

	// within one kind a tie keeps the earlier room, which the api already ordered newest first
	test("a tie between two team rooms keeps the first", () => {
		const first = { ...TEAM_ROOM, teamId: "team-a", mentions: [MENTION] }
		const second = { ...TEAM_ROOM, teamId: "team-b", mentions: [MENTION] }
		expect(toDefaultChatId(null, [first, second])).toEqual({ kind: "room", teamId: "team-a", topicId: null })
	})

	test("a user with no rooms gets no chatId, which is what shows the create call to action", () => {
		expect(toDefaultChatId(null, [])).toBeNull()
	})

	// a topic page opens that topic's room wherever the user has one
	test("a topic page opens that topic's room", () => {
		const context = toContext({ topicId: "topic-1", name: "Speed reading" })
		expect(toDefaultChatId(context, [TEAM_ROOM, TOPIC_ROOM])).toEqual({
			kind: "room",
			teamId: "team-a",
			topicId: "topic-1",
		})
	})

	// the private chat is the fallback the closest match to the page wins
	test("a topic page with no room of its own opens its private chat", () => {
		const context = toContext({ topicId: "topic-9", name: "A topic" })
		const busierRoom = { ...TEAM_ROOM, mentions: [MENTION, MENTION] }
		expect(toDefaultChatId(context, [busierRoom])).toEqual({ kind: "private", topicId: "topic-9" })
	})

	// a page about no conversation never reaches a private chat
	test("a page about nothing opens no private chat", () => {
		expect(toDefaultChatId(null, [])).toBeNull()
	})

	// a team page opens the team's own room, never one of its topics
	test("a team page opens the team's own room", () => {
		const context = toContext({ teamId: "team-a", name: "Agent Infra Crew" })
		expect(toDefaultChatId(context, [TOPIC_ROOM, TEAM_ROOM])).toEqual({
			kind: "room",
			teamId: "team-a",
			topicId: null,
		})
	})

	// an outsider has no room to open, so the chatId names the team the join button belongs to
	test("a team page the user is not on aims at the team it offers joining", () => {
		const context = toContext({
			teamId: "team-b",
			name: "Lets Build",
			joinTeam: { teamId: "team-b", name: "Lets Build", hasAvatar: false, hasRequestedToJoin: false },
		})
		expect(toDefaultChatId(context, [TEAM_ROOM])).toEqual({ kind: "room", teamId: "team-b", topicId: null })
	})

	// a private team names nothing
	test("a team page with no room and no way in opens a room the user has", () => {
		const context = toContext({ teamId: "team-b", name: "Lets Build" })
		expect(toDefaultChatId(context, [TEAM_ROOM])).toEqual({ kind: "room", teamId: "team-a", topicId: null })
	})

	test("a team page opens nothing when the user has no rooms and no way in", () => {
		const context = toContext({ teamId: "team-b", name: "Lets Build" })
		expect(toDefaultChatId(context, [])).toBeNull()
	})
})

// minimizing is closing, so the next open selects for the page it opens on instead of reopening the last room
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
	const context = toContext({
		topicId: "topic-9",
		name: "A topic",
		joinTeam: { teamId: "team-z", name: "Their team", hasAvatar: false, hasRequestedToJoin: false },
	})
	expect(toDefaultChatId(context, [])).toEqual({ kind: "room", teamId: "team-z", topicId: "topic-9" })
})

// an empty room list looks the same as having no rooms
test("nothing is selected while there are no rooms to select from", () => {
	const context = toContext({ teamId: "team-a", name: "A team" })
	expect(toDefaultChatId(context, [])).toBeNull()
})

// a topic page names its own topic, so every team's room for it is marked and preferred alike
test("a page naming a topic prefers that topic's room over a busier one elsewhere", () => {
	const pageTopicRoom = { ...TOPIC_ROOM, teamId: "team-b", mentions: [MENTION] }
	const busierElsewhere = { ...TEAM_ROOM, mentions: [MENTION, MENTION] }
	const context = toContext({ pageTopicIds: ["topic-1"] })
	expect(toDefaultChatId(context, [busierElsewhere, pageTopicRoom])).toEqual({
		kind: "room",
		teamId: "team-b",
		topicId: "topic-1",
	})
})
