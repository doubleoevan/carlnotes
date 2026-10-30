import type { ChatRoom } from "@carlnotes/contracts/chat"
import type { TopicDraftTeam } from "@carlnotes/contracts/topicPayloads"
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

// the new-topic chat, with the team a team screen gave it
export type NewTopicChatId = ChatId & { kind: "private"; newTopic: true }

// the team a team screen last opened the new-topic chat with. a link names the team by id alone, so a link from
// outside the app cannot put a team or its name on the draft
let teamScreenInitialTeam: TopicDraftTeam | undefined

/**
 * Returns the chat route that opens straight on the new-topic chat, with a team screen's team.
 */
export function toNewTopicChatHref(initialTeam?: TopicDraftTeam): Href {
	teamScreenInitialTeam = initialTeam
	return {
		pathname: "/chat",
		params: initialTeam ? { newTopic: "true", initialTeamId: initialTeam.teamId } : { newTopic: "true" },
	}
}

/**
 * Returns the chat route that opens a topic's private chat to edit the topic with Carl.
 */
export function toEditTopicChatHref(topicId: string): Href {
	return { pathname: "/topics/[topicId]/chat", params: { topicId, editTopic: "true" } }
}

/**
 * Returns the new-topic chat the chat route's params ask for, or undefined for any other chat.
 */
export function toNewTopicChatId({
	newTopic,
	initialTeamId,
}: {
	newTopic?: string
	initialTeamId?: string
}): NewTopicChatId | undefined {
	// only the newTopic param opens it, with the team a team screen passed
	if (newTopic !== "true") {
		return undefined
	}
	return initialTeamId && teamScreenInitialTeam?.teamId === initialTeamId
		? { kind: "private", newTopic: true, initialTeam: teamScreenInitialTeam }
		: { kind: "private", newTopic: true }
}

/**
 * Uses the web's conversation default, the new-topic chat included. A requested new-topic or topic-edit chat opens
 * first, then a badge's chat room, named by its team.
 */
export function toInitialChatId({
	rooms,
	topicId,
	teamId,
	chatTeamId,
	pageContext,
	newTopicChatId,
	isEditingTopic = false,
}: {
	rooms: ChatRoom[]
	topicId?: string
	teamId?: string
	chatTeamId?: string
	pageContext?: ChatPageContext | null
	// a requested new-topic chat, or a topic edit
	newTopicChatId?: NewTopicChatId
	isEditingTopic?: boolean
}): ChatId | null {
	// open the new-topic chat a New topic choice or an empty Feed asked for, or the topic's private chat an Edit topic
	// choice asked for
	if (newTopicChatId) {
		return newTopicChatId
	}
	if (isEditingTopic && topicId) {
		return { kind: "private", topicId }
	}

	// open the chat room a badge named
	if (chatTeamId) {
		return { kind: "room", teamId: chatTeamId, topicId: topicId ?? null }
	}

	// retain a Team's private conversation when its shared room is unavailable
	if (teamId && !rooms.some((room) => room.teamId === teamId && room.topicId === null)) {
		return { kind: "private", teamId }
	}
	return toDefaultChatId(
		pageContext ?? { topicId: topicId ?? null, teamId: teamId ?? null, name: "", joinTeam: null },
		rooms,
	)
}
