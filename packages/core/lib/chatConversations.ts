import type { ChatPage } from "@carlnotes/client/chatClient"
import type { ChatRoom } from "@carlnotes/contracts/chat"
import type { ProfileResponse, ProfileTeamStatus } from "@carlnotes/contracts/profiles"
import type { TopicDraftTeam } from "@carlnotes/contracts/topicPayloads"

/**
 * Which chat room the panel is showing, or the private chat about one topic. A chat id includes only the addressing keys,
 * so the panel reads a chat room's name and counts live from the badge store.
 */
export type ChatId =
	// a shared chat room, keyed by the same pair the chat room list and the stream are keyed by
	| ({ kind: "room" } & Pick<ChatRoom, "teamId" | "topicId">)
	// one user's private conversation with Carl about a topic or a team, which is no chat room at all
	| { kind: "private"; topicId: string; teamId?: undefined; newTopic?: undefined }
	| { kind: "private"; topicId?: undefined; teamId: string; newTopic?: undefined }
	// the new-topic chat, where Carl makes a topic, bound to neither, with the team a team page hands it
	| { kind: "private"; newTopic: true; topicId?: undefined; teamId?: undefined; initialTeam?: TopicDraftTeam }

/**
 * What the page on screen is about, which the panel opens on before falling back to the latest chat room.
 * A page names its team so the panel can offer the way in where the user is on none of them.
 */
export type ChatPageContext = {
	// the topic this page is about, which is also whose private chat the menu offers
	topicId: string | null
	// the team whose chat room this page would open, and what to call it in the join call to action
	teamId: string | null
	name: string
	// set where the user is not on the team, so the panel offers joining instead of the chat messages
	joinTeam: { teamId: string; name: string; avatarVersion: string | null; hasRequestedToJoin: boolean } | null
	// what this page is about: its teams, its topics, or both
	pageTeamIds?: string[]
	pageTopicIds?: string[]
	// which kind of chat room this page opens first
	preferredChatRoomKind?: "team" | "topic"
	// whether a signed-in user's feed is still empty, no topic of their own and none subscribed to
	isUserTopicFeedEmpty?: boolean
}

/**
 * Selects a Profile's shared Teams and preferred Topic chat rooms.
 */
export function toProfileChatContext({
	profile,
	profileTeamStatuses,
	isOwnProfile,
}: {
	profile: Pick<ProfileResponse, "username"> | null
	profileTeamStatuses: ProfileTeamStatus[]
	isOwnProfile: boolean
}): ChatPageContext | null {
	if (!profile) {
		return null
	}
	// prefer topic rooms belonging to teams shared with the profile
	const sharedTeams = profileTeamStatuses.filter((team) => team.status === "member")
	return {
		topicId: null,
		teamId: null,
		name: profile.username,
		joinTeam: null,
		pageTeamIds: isOwnProfile ? [] : sharedTeams.map((team) => team.teamId),
		preferredChatRoomKind: "topic",
	}
}

/**
 * Checks whether a chat room belongs to the current page.
 */
export function isPageChatRoom(
	chatRoom: Pick<ChatRoom, "teamId" | "topicId">,
	pageContext: ChatPageContext | null,
): boolean {
	const isPageTeam = pageContext?.pageTeamIds?.includes(chatRoom.teamId) ?? false
	const isPageTopic = chatRoom.topicId !== null && (pageContext?.pageTopicIds?.includes(chatRoom.topicId) ?? false)
	return isPageTeam || isPageTopic
}

/**
 * Checks whether two chat IDs identify the same conversation.
 */
export function isSameChat(firstChatId: ChatId | null, secondChatId: ChatId): boolean {
	// nothing selected yet, or two different kinds, is never the same conversation
	if (!firstChatId || firstChatId.kind !== secondChatId.kind) {
		return false
	}
	// a private chat is named by its topic or its team, and a chat room by the pair the routes address it with
	if (firstChatId.kind === "private" && secondChatId.kind === "private") {
		return (
			firstChatId.topicId === secondChatId.topicId &&
			firstChatId.teamId === secondChatId.teamId &&
			firstChatId.newTopic === secondChatId.newTopic
		)
	}
	// the room arms are re-checked so the narrowing holds
	return (
		firstChatId.kind === "room" &&
		secondChatId.kind === "room" &&
		firstChatId.teamId === secondChatId.teamId &&
		firstChatId.topicId === secondChatId.topicId
	)
}

/**
 * Selects the page's default conversation from its rooms and private chat.
 */
export function toDefaultChatId(pageContext: ChatPageContext | null, chatRooms: ChatRoom[]): ChatId | null {
	// open the new-topic chat for a user with nothing in their feed
	if (pageContext?.isUserTopicFeedEmpty) {
		return { kind: "private", newTopic: true }
	}
	// a team page opens that team's own chat room, or offers the way in where the user is on none
	if (pageContext?.teamId) {
		const teamChatRoom = chatRooms.find(
			(chatRoom) => chatRoom.teamId === pageContext.teamId && chatRoom.topicId === null,
		)
		if (teamChatRoom) {
			return { kind: "room", teamId: teamChatRoom.teamId, topicId: null }
		}
		// on neither the team nor its invite, so the topic rules below decide instead
		if (pageContext.joinTeam) {
			return { kind: "room", teamId: pageContext.joinTeam.teamId, topicId: null }
		}
	}
	// a topic page opens that topic's conversation, closest first
	if (pageContext?.topicId) {
		const topicChatRoom = chatRooms.find((chatRoom) => chatRoom.topicId === pageContext.topicId)
		if (topicChatRoom) {
			return { kind: "room", teamId: topicChatRoom.teamId, topicId: topicChatRoom.topicId }
		}
		if (pageContext.joinTeam) {
			return { kind: "room", teamId: pageContext.joinTeam.teamId, topicId: pageContext.topicId }
		}
		// no chat room and no way into one, so the topic falls back to carl
		return { kind: "private", topicId: pageContext.topicId }
	}

	// the highlighted chat rooms that reference a page
	const pageChatRooms = chatRooms.filter((chatRoom) => isPageChatRoom(chatRoom, pageContext))
	// a chat room that references the page wins, then any chat room with mentions waiting, then simply the first available
	const selectedChatRoom =
		toBusiestChatRoom(pageChatRooms, pageContext) ?? toBusiestChatRoom(chatRooms, pageContext) ?? chatRooms[0]
	if (selectedChatRoom) {
		return { kind: "room", teamId: selectedChatRoom.teamId, topicId: selectedChatRoom.topicId }
	}
	// fall back to the new-topic chat
	return { kind: "private", newTopic: true }
}

/**
 * Returns the stable identity of a private conversation or a shared room.
 */
export function toChatKey(chatId: ChatId | null): string {
	if (!chatId) {
		return "closed"
	}
	if (chatId.kind === "room") {
		return JSON.stringify(["room", chatId.teamId, chatId.topicId])
	}
	return JSON.stringify(["private", chatId.topicId ?? null, chatId.teamId ?? null, chatId.newTopic ?? false])
}

/**
 * Orders conversation menu entries by the web's alphabetical room names.
 */
export function toChatRoomMenuOrder<Room extends { name: string }>(rooms: Room[]): Room[] {
	return [...rooms].sort((first, second) => first.name.localeCompare(second.name))
}

/**
 * Returns the private conversation offered for a page or selected Team room.
 */
export function toPrivateChatId(pageContext: ChatPageContext | null, chatId: ChatId | null): ChatId | null {
	if (pageContext?.topicId) {
		return { kind: "private", topicId: pageContext.topicId }
	}
	const teamId = pageContext?.teamId ?? (chatId?.kind !== "private" ? (chatId?.teamId ?? null) : null)
	return teamId ? { kind: "private", teamId } : null
}

/**
 * Returns the API page addressed by a private conversation.
 */
export function toPrivateChatPage(chatId: ChatId & { kind: "private" }): ChatPage {
	if (chatId.newTopic) {
		return { newTopic: true, initialTeam: chatId.initialTeam }
	}
	return chatId.topicId !== undefined ? { topicId: chatId.topicId } : { teamId: chatId.teamId }
}

/**
 * Returns the private conversation's name from its room or current page.
 */
export function toPrivateChatName(
	chatId: ChatId & { kind: "private" },
	chatRooms: ChatRoom[],
	pageContext: ChatPageContext | null,
): string {
	if (chatId.newTopic) {
		return "a new topic"
	}
	if (chatId.teamId !== undefined) {
		return chatRooms.find((chatRoom) => chatRoom.teamId === chatId.teamId)?.teamName ?? pageContext?.name ?? "this team"
	}
	return pageContext?.name ?? "this topic"
}

// the chat room with the most mentions, from the page's preferred kind if a chat room of that kind has mentions.
// none where every chat room is quiet, which is what sends the caller to its next choice
function toBusiestChatRoom(chatRooms: ChatRoom[], pageContext: ChatPageContext | null): ChatRoom | undefined {
	// a page asking for neither kind reads as a team page, since a team's chat room is the broader one
	const preferredChatRoomKind = pageContext?.preferredChatRoomKind ?? "team"
	const isPreferredChatRoomKind = (chatRoom: ChatRoom): boolean =>
		preferredChatRoomKind === "team" ? chatRoom.topicId === null : chatRoom.topicId !== null

	// a quiet chat room never wins, so the preference only ever picks between chat rooms that have mentions
	const chatRoomsWithMentions = chatRooms.filter((chatRoom) => chatRoom.chatMentions.length > 0)
	const chatRoomsToChooseFrom = chatRoomsWithMentions.some(isPreferredChatRoomKind)
		? chatRoomsWithMentions.filter(isPreferredChatRoomKind)
		: chatRoomsWithMentions
	return chatRoomsToChooseFrom.reduce<ChatRoom | undefined>(
		(busiestChatRoom, chatRoom) =>
			chatRoom.chatMentions.length > (busiestChatRoom?.chatMentions.length ?? 0) ? chatRoom : busiestChatRoom,
		undefined,
	)
}
