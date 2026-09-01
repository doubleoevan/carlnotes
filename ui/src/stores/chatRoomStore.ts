// the state of the user's chat rooms and their chat mention badge counts
import type { ChatMention, ChatRoom } from "@shared/contracts"
import { useSyncExternalStore } from "react"

// the chat rooms that the user opened this session
const openedChatRoomKeys = new Set<string>()
// the chat rooms that the chat panel last read
let chatRooms: ChatRoom[] = []
const listeners = new Set<() => void>()
let version = 0

// a chat room's key. the team's own chat room takes "team" in the topic slot, like the chat stream keys
function toChatRoomKey(topicId: string | null, teamId: string): string {
	return `${topicId ?? "team"}:${teamId}`
}

/**
 * Mark a chat room opened, re-rendering every badge that shows it then run the listener callbacks.
 */
export function markChatRoomOpened(topicId: string | null, teamId: string): void {
	openedChatRoomKeys.add(toChatRoomKey(topicId, teamId))
	version += 1
	for (const listener of listeners) {
		listener()
	}
}

/**
 * Update the shared list of all chat rooms
 */
export function setChatRooms(rooms: ChatRoom[]): void {
	chatRooms = rooms
	version += 1
	for (const listener of listeners) {
		listener()
	}
}

// the subscribe callback that useSyncExternalStore needs. versioned so an update re-renders all consumers
function subscribe(listener: () => void): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

/**
 * The unopened chat mentions waiting on a topic.
 * A user that already has chat mentions passes them. everything else reads what the panel last polled.
 */
export function useTopicMentions(topicId: string): ChatMention[] {
	useSyncExternalStore(subscribe, () => version)
	const chatMentions = chatRooms
		.filter((chatRoom) => chatRoom.topicId === topicId)
		.flatMap((chatRoom) => chatRoom.chatMentions)
	return chatMentions.filter((mention) => !openedChatRoomKeys.has(toChatRoomKey(topicId, mention.teamId)))
}

/**
 * The unopened chat mentions waiting on a team.
 * A user that already has chat mentions passes them. everything else reads what the panel last polled.
 */
export function useTeamMentions(teamId: string): ChatMention[] {
	useSyncExternalStore(subscribe, () => version)
	const chatRoom = chatRooms.find((chatRoom) => chatRoom.teamId === teamId && chatRoom.topicId === null)
	return openedChatRoomKeys.has(toChatRoomKey(null, teamId)) ? [] : (chatRoom?.chatMentions ?? [])
}

/**
 * The chat rooms the panel last read, each with the chat mentions still waiting in it.
 * Every consumer reads its chat rooms and its badges from here, which clears the badges when its chat
 * room is opened instead of on the next poll.
 */
export function useChatRooms(): ChatRoom[] {
	useSyncExternalStore(subscribe, () => version)
	return toChatRooms()
}

/**
 * What that hook renders, without the subscription, so it can be read outside a component.
 */
export function toChatRooms(): ChatRoom[] {
	return chatRooms.map((chatRoom) =>
		openedChatRoomKeys.has(toChatRoomKey(chatRoom.topicId, chatRoom.teamId))
			? { ...chatRoom, chatMentions: [] }
			: chatRoom,
	)
}

/**
 * The unopened chat mentions waiting in topic chat rooms.
 */
export function useAllTopicMentions(): ChatMention[] {
	useSyncExternalStore(subscribe, () => version)
	return toChatRooms().flatMap((chatRoom) => (chatRoom.topicId === null ? [] : chatRoom.chatMentions))
}

/**
 * The unopened chat mentions waiting in team chat rooms.
 */
export function useAllTeamMentions(): ChatMention[] {
	useSyncExternalStore(subscribe, () => version)
	return toChatRooms().flatMap((chatRoom) => (chatRoom.topicId === null ? chatRoom.chatMentions : []))
}

/** Every unopened chat mention the user has. */
export function useAllChatMentions(): ChatMention[] {
	useSyncExternalStore(subscribe, () => version)
	return chatRooms.flatMap((chatRoom) =>
		openedChatRoomKeys.has(toChatRoomKey(chatRoom.topicId, chatRoom.teamId)) ? [] : chatRoom.chatMentions,
	)
}
