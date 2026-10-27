import type { ChatRoom } from "@carlnotes/contracts/chat"
import { type ChatId, type ChatPageContext, toDefaultChatId } from "@carlnotes/core/lib/chatConversations"

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
	const [, routeKind, routeId] = pathname.split("/")
	if (routeId && (routeKind === "topics" || routeKind === "teams")) {
		return `/${routeKind}/${routeId}/chat`
	}
	if (routeId && routeKind === "profiles") {
		return { pathname: "/chat", params: { profileUserId: routeId } }
	}
	return "/chat"
}

/**
 * Uses the web's conversation default while keeping new-topic creation on web.
 */
export function toInitialChatId({
	rooms,
	topicId,
	teamId,
	pageContext,
}: {
	rooms: ChatRoom[]
	topicId?: string
	teamId?: string
	pageContext?: ChatPageContext | null
}): ChatId | null {
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
