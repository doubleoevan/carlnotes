import { expect, test } from "bun:test"
import type { ChatRoom } from "@carlnotes/contracts/chat"
import type { ProfileTeamStatus } from "@carlnotes/contracts/profiles"
import { toDefaultChatId, toProfileChatContext } from "./chatConversations"

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
