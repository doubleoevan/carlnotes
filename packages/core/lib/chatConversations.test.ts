import { expect, test } from "bun:test"
import type { ChatRoom } from "@carlnotes/contracts/chat"
import type { ProfileTeamStatus } from "@carlnotes/contracts/profiles"
import {
	toDefaultChatId,
	toPrivateChatId,
	toPrivateChatIdLabel,
	toPrivateChatPage,
	toProfileChatContext,
} from "./chatConversations"
import { NEW_TOPIC_CHAT_COPY } from "./chatCopy"

test("a Profile opens a shared Topic room ahead of an unrelated room with more mentions", () => {
	// include only accepted memberships in the profile context
	const membership: ProfileTeamStatus = {
		teamId: "shared-team",
		name: "Readers",
		avatarVersion: null,
		role: "member",
		status: "member",
		inviteId: null,
		canDeleteInvite: false,
	}
	const pageContext = toProfileChatContext({
		profile: { username: "reader" },
		profileTeamStatuses: [membership, { ...membership, teamId: "invited-team", status: "invited" }],
		isOwnProfile: false,
	})
	expect(pageContext?.pageTeamIds).toEqual(["shared-team"])

	// use the web's topic preference and shared-team priority for both renderers
	const mention = { teamId: "shared-team", chatMessageId: 1, authorUsername: "reader", isReply: false, excerpt: "Hi" }
	const room: ChatRoom = {
		teamId: "shared-team",
		topicId: "topic-one",
		name: "Reading",
		teamName: "Readers",
		teamAvatarVersion: null,
		chatMentions: [mention],
		chatRoomMembers: [],
	}
	expect(
		toDefaultChatId(pageContext, [
			{ ...room, teamId: "other-team", topicId: null, chatMentions: [mention, { ...mention, chatMessageId: 2 }] },
			room,
		]),
	).toEqual({ kind: "room", teamId: "shared-team", topicId: "topic-one" })
})

test("an own Profile keeps Topic preference without restricting Teams, and a missing Profile has no context", () => {
	// retain the same defaults when viewing the signed-in account
	expect(
		toProfileChatContext({ profile: { username: "reader" }, profileTeamStatuses: [], isOwnProfile: true }),
	).toEqual({
		topicId: null,
		teamId: null,
		name: "reader",
		joinTeam: null,
		pageTeamIds: [],
		preferredChatRoomKind: "topic",
	})
	expect(toProfileChatContext({ profile: null, profileTeamStatuses: [], isOwnProfile: false })).toBeNull()
})

// the chat launcher's default on a Topic Post's page is the chat about that post
test("a Topic Post's page opens its topic's private chat ahead of a room, and any other page keeps its default", () => {
	const topicChatRoom: ChatRoom = {
		teamId: "team-1",
		topicId: "topic-1",
		name: "Reading",
		teamName: "Readers",
		teamAvatarVersion: null,
		chatMentions: [],
		chatRoomMembers: [],
	}
	const pageContext = { topicId: "topic-1", teamId: null, name: "Reading", joinTeam: null }
	expect(toDefaultChatId(null, [topicChatRoom], { topicId: "topic-1" })).toEqual({
		kind: "private",
		topicId: "topic-1",
	})
	expect(toDefaultChatId({ ...pageContext, isUserTopicFeedEmpty: true }, [], { topicId: "topic-1" })).toEqual({
		kind: "private",
		topicId: "topic-1",
	})

	// with no post open the topic's room and the first room open as before
	expect(toDefaultChatId(pageContext, [topicChatRoom], null)).toEqual({
		kind: "room",
		teamId: "team-1",
		topicId: "topic-1",
	})
	expect(toDefaultChatId(null, [topicChatRoom])).toEqual({ kind: "room", teamId: "team-1", topicId: "topic-1" })
})

// a private chat's label names the open post, then the Topic or the team, from the page or a chat room
test("a private chat is labeled by its open post, its topic, or its team, and plainly while none is known", () => {
	const chatRoom: ChatRoom = {
		teamId: "team-1",
		topicId: "topic-1",
		name: "Reading",
		teamName: "Readers",
		teamAvatarVersion: null,
		chatMentions: [],
		chatRoomMembers: [],
	}
	const topicPageContext = { topicId: "topic-1", teamId: null, name: "Reading", joinTeam: null }
	const chatTopicPost = {
		id: "post-1",
		title: "Dialing in",
		path: "/topics/topic-1/x/posts/post-1",
		topicId: "topic-1",
	}
	const topicChatId = { kind: "private", topicId: "topic-1" } as const

	// the open post of the chat's own Topic leads, and a post of another Topic names nothing
	expect(toPrivateChatIdLabel(topicChatId, { chatRooms: [], pageContext: topicPageContext, chatTopicPost })).toBe(
		"Private chat about Dialing in",
	)
	expect(toPrivateChatIdLabel(topicChatId, { chatRooms: [], pageContext: null, chatTopicPost })).toBe(
		"Private chat about Dialing in",
	)
	expect(
		toPrivateChatIdLabel(
			{ kind: "private", topicId: "topic-2" },
			{ chatRooms: [], pageContext: { ...topicPageContext, topicId: "topic-2", name: "Brewing" }, chatTopicPost },
		),
	).toBe("Private chat about Brewing")

	// the Topic's page or its chat room names the Topic, and another page's name is not borrowed
	expect(toPrivateChatIdLabel(topicChatId, { chatRooms: [], pageContext: topicPageContext })).toBe(
		"Private chat about Reading",
	)
	expect(toPrivateChatIdLabel(topicChatId, { chatRooms: [chatRoom], pageContext: null })).toBe(
		"Private chat about Reading",
	)
	expect(
		toPrivateChatIdLabel(topicChatId, { chatRooms: [], pageContext: { ...topicPageContext, topicId: "topic-2" } }),
	).toBe("Private chat")

	// a team's chat is named by its chat room or its own page, and the new-topic chat keeps its name
	const teamChatId = { kind: "private", teamId: "team-1" } as const
	const teamPageContext = { topicId: null, teamId: "team-1", name: "Readers", joinTeam: null }
	expect(toPrivateChatIdLabel(teamChatId, { chatRooms: [chatRoom], pageContext: null })).toBe(
		"Private chat about Readers",
	)
	expect(toPrivateChatIdLabel(teamChatId, { chatRooms: [], pageContext: teamPageContext })).toBe(
		"Private chat about Readers",
	)
	expect(toPrivateChatIdLabel(teamChatId, { chatRooms: [], pageContext: null })).toBe("Private chat")
	expect(toPrivateChatIdLabel({ kind: "private", newTopic: true }, { chatRooms: [], pageContext: null })).toBe(
		NEW_TOPIC_CHAT_COPY.name,
	)
})

// the private chat a menu offers is the open post's on a Topic Post's page
test("a Topic Post's page offers its topic's private chat ahead of the page's and the open room's", () => {
	const roomChatId = { kind: "room", teamId: "team-1", topicId: null } as const
	expect(toPrivateChatId(null, roomChatId, { topicId: "topic-1" })).toEqual({ kind: "private", topicId: "topic-1" })
	expect(toPrivateChatId(null, roomChatId)).toEqual({ kind: "private", teamId: "team-1" })
})

// a Topic's private chat opened on a Topic Post's page asks about that post
test("a topic's private chat names the open post of that topic alone", () => {
	const chatTopicPost = {
		id: "post-1",
		title: "Dialing in",
		path: "/topics/topic-1/x/posts/post-1",
		topicId: "topic-1",
	}
	expect(toPrivateChatPage({ kind: "private", topicId: "topic-1" }, chatTopicPost)).toEqual({
		topicId: "topic-1",
		topicPost: { id: "post-1", title: "Dialing in", path: "/topics/topic-1/x/posts/post-1" },
	})

	// another topic's chat, a team's, and a topic's with no post open name none
	expect(toPrivateChatPage({ kind: "private", topicId: "topic-2" }, chatTopicPost)).toEqual({ topicId: "topic-2" })
	expect(toPrivateChatPage({ kind: "private", teamId: "team-1" }, chatTopicPost)).toEqual({ teamId: "team-1" })
	expect(toPrivateChatPage({ kind: "private", topicId: "topic-1" })).toEqual({ topicId: "topic-1" })
})
