import type { ChatRoom } from "@carlnotes/contracts/chat"
import { type ChatId, type ChatPageContext, toDefaultChatId } from "@carlnotes/core/lib/chatConversations"
import type { Href } from "expo-router"

/**
 * Returns a Topic or Team chat route, or the global conversation picker.
 */
export function toChatHref(
	pathname: string,
):
	| "/chat"
	| `/topics/${string}/chat`
	| `/teams/${string}/chat`
	| { pathname: "/chat"; params: { profileUserId: string } } {
	// a Topic or Team page, and its notes, keep their own chat
	const [, routeKind, routeId] = pathname.split("/")
	if (routeId && (routeKind === "topics" || routeKind === "teams")) {
		return `/${routeKind}/${routeId}/chat`
	}

	// a profile opens the global picker with the profile's shared teams
	if (routeId && routeKind === "profiles") {
		return { pathname: "/chat", params: { profileUserId: routeId } }
	}
	return "/chat"
}

/**
 * Returns the chat route that opens a page's chat room: a topic's room in the team a badge names, or a team's own.
 */
export function toChatRoomHref({
	topicId,
	teamId,
	chatTeamId,
}: {
	topicId: string | null
	teamId?: string
	chatTeamId?: string
}): Href {
	// a topic's chat opens on the badge's team room
	if (topicId) {
		return { pathname: "/topics/[topicId]/chat", params: { topicId, chatTeamId } }
	}

	// a team's own chat
	return { pathname: "/teams/[teamId]/chat", params: { teamId: teamId ?? chatTeamId ?? "" } }
}

/**
 * Uses the web's conversation default while keeping new-topic creation on web. A badge's chat room, named by its
 * team, opens first.
 */
export function toInitialChatId({
	rooms,
	topicId,
	teamId,
	chatTeamId,
	pageContext,
}: {
	rooms: ChatRoom[]
	topicId?: string
	teamId?: string
	chatTeamId?: string
	pageContext?: ChatPageContext | null
}): ChatId | null {
	// open the chat room a badge named
	if (chatTeamId) {
		return { kind: "room", teamId: chatTeamId, topicId: topicId ?? null }
	}

	// retain a Team's private conversation when its shared room is unavailable
	if (teamId && !rooms.some((room) => room.teamId === teamId && room.topicId === null)) {
		return { kind: "private", teamId }
	}
	const defaultChatId = toDefaultChatId(
		pageContext ?? { topicId: topicId ?? null, teamId: teamId ?? null, name: "", joinTeam: null },
		rooms,
	)
	return defaultChatId?.kind === "private" && defaultChatId.newTopic ? null : defaultChatId
}
