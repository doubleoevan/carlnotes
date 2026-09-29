// the state of the user's chat rooms and their chat mention badge counts
import type { ChatMention, ChatRoom } from "@shared/contracts"
import { toStoreListeners } from "@/stores/storeListeners"

// the chat rooms that the user opened this session
const openedChatRoomKeys = new Set<string>()
// the chat rooms that the chat panel last read
let chatRooms: ChatRoom[] = []
const { publish, useStoreVersion } = toStoreListeners()

// a chat room's key. the team's own chat room takes "team" in the topic slot, like the chat stream keys
function toChatRoomKey(topicId: string | null, teamId: string): string {
	return `${topicId ?? "team"}:${teamId}`
}

/**
 * Marks a chat room opened, which clears its badges everywhere they show.
 */
export function markChatRoomOpened(topicId: string | null, teamId: string): void {
	openedChatRoomKeys.add(toChatRoomKey(topicId, teamId))
	publish()
}

/**
 * Replaces the chat rooms with what the chat panel last read.
 */
export function setChatRooms(updatedChatRooms: ChatRoom[]): void {
	chatRooms = updatedChatRooms
	publish()
}

/**
 * The unopened chat mentions waiting on a topic from the chat rooms the panel last read.
 */
export function useTopicMentions(topicId: string): ChatMention[] {
	useStoreVersion()
	const chatMentions = chatRooms
		.filter((chatRoom) => chatRoom.topicId === topicId)
		.flatMap((chatRoom) => chatRoom.chatMentions)
	return chatMentions.filter((mention) => !openedChatRoomKeys.has(toChatRoomKey(topicId, mention.teamId)))
}

/**
 * The unopened chat mentions waiting on a team, from the chat rooms the panel last read.
 */
export function useTeamMentions(teamId: string): ChatMention[] {
	useStoreVersion()
	const chatRoom = chatRooms.find((chatRoom) => chatRoom.teamId === teamId && chatRoom.topicId === null)
	return openedChatRoomKeys.has(toChatRoomKey(null, teamId)) ? [] : (chatRoom?.chatMentions ?? [])
}

/**
 * The chat rooms the panel last read, each with the chat mentions still waiting in it.
 * Every consumer reads its chat rooms and its badges from here, which clears the badges when its chat
 * room is opened instead of on the next poll.
 */
export function useChatRooms(): ChatRoom[] {
	useStoreVersion()
	return toChatRooms()
}

/**
 * The chat rooms useChatRooms returns, read without the subscription outside a component.
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
export function useAllTopicChatMentions(): ChatMention[] {
	useStoreVersion()
	return toChatRooms().flatMap((chatRoom) => (chatRoom.topicId === null ? [] : chatRoom.chatMentions))
}

/**
 * The unopened chat mentions waiting in team chat rooms.
 */
export function useAllTeamChatMentions(): ChatMention[] {
	useStoreVersion()
	return toChatRooms().flatMap((chatRoom) => (chatRoom.topicId === null ? chatRoom.chatMentions : []))
}

/** Every unopened chat mention the user has. */
export function useAllChatMentions(): ChatMention[] {
	useStoreVersion()
	return chatRooms.flatMap((chatRoom) =>
		openedChatRoomKeys.has(toChatRoomKey(chatRoom.topicId, chatRoom.teamId)) ? [] : chatRoom.chatMentions,
	)
}

/** The earliest user's chat mention that they haven't seen in a chat room. */
export function toFirstChatMention(chatMentions: ChatMention[]): ChatMention | undefined {
	return chatMentions.reduce<ChatMention | undefined>(
		(firstChatMention, chatMention) =>
			!firstChatMention || chatMention.chatMessageId < firstChatMention.chatMessageId ? chatMention : firstChatMention,
		undefined,
	)
}
