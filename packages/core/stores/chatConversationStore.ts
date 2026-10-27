import type { ProposeTopicEditPayload } from "@carlnotes/contracts/topicPayloads"
import { useEffect } from "react"
import { type ChatId, type ChatPageContext, isSameChat, toChatKey } from "../lib/chatConversations"
import { resetChatRooms } from "./chatRoomStore"
import { toStoreListeners } from "./storeListeners"

// the active account, conversation, page context, and requested message
let accountId: string | null = null
let accountGeneration = 0
let conversationGeneration = 0
let chatId: ChatId | null = null
let pageContext: ChatPageContext | null = null
let chatMessageId: number | null = null
const { publish, useStoreVersion } = toStoreListeners()

// each conversation owns its topic preview
const topicEdits = new Map<string, { topicId: string; proposedTopicEdit: ProposeTopicEditPayload | null }>()

/**
 * Retires the previous account's selected conversation and topic previews.
 */
export function activateChatAccount(nextAccountId: string | null): void {
	if (accountId === nextAccountId) {
		return
	}
	// reset the selected account's conversation and topic edits
	accountId = nextAccountId
	accountGeneration += 1
	chatId = null
	chatMessageId = null
	topicEdits.clear()
	changedTopicId = null
	topicChangeCount = 0
	resetChatRooms()
	publish()
}

/**
 * Captures a guard for callbacks belonging to the current account and conversation.
 */
export function toCurrentChatGuard(): () => boolean {
	// capture the account and conversation generations
	const isCurrentAccount = toCurrentChatAccountGuard()
	const generation = conversationGeneration
	return () => isCurrentAccount() && generation === conversationGeneration
}

/**
 * Captures a guard for account-owned requests that outlive conversation selection.
 */
export function toCurrentChatAccountGuard(): () => boolean {
	const generation = accountGeneration
	return () => generation === accountGeneration
}

/**
 * Returns the account and conversation selected by the app.
 */
export function useChatConversation(): {
	accountId: string | null
	chatId: ChatId | null
	pageContext: ChatPageContext | null
} {
	useStoreVersion()
	return { accountId, chatId, pageContext }
}

/**
 * Returns the selected conversation outside a component.
 */
export function toChatId(): ChatId | null {
	return chatId
}

/**
 * Switches the chat panel to a chat room or a private chat.
 */
export function setChatId(nextChatId: ChatId | null): void {
	if (!nextChatId || !isSameChat(chatId, nextChatId)) {
		conversationGeneration += 1
	}
	chatId = nextChatId
	chatMessageId = null
	publish()
}

/**
 * Switches the chat panel to a chat and scrolls to a chat message.
 */
export function setChatIdAtChatMessage(nextChatId: ChatId, nextChatMessageId: number): void {
	setChatId(nextChatId)
	chatMessageId = nextChatMessageId
	publish()
}

/**
 * Returns the chat message the panel should scroll to.
 */
export function useChatMessageMentioned(): number | null {
	useStoreVersion()
	return chatMessageId
}

/**
 * Clears the mentioned chat message after the room scrolls to it.
 */
export function clearMentionedChatMessage(): void {
	if (chatMessageId === null) {
		return
	}
	chatMessageId = null
	publish()
}

/**
 * Registers the current page's chat context while the page is mounted.
 */
export function useRegisterChatContext(nextPageContext: ChatPageContext | null): void {
	// key the page context by its serialized contents
	const pageContextKey = JSON.stringify(nextPageContext)
	useEffect(() => {
		// restore the page context from its serialized key
		pageContext = pageContextKey === "null" ? null : (JSON.parse(pageContextKey) as ChatPageContext)
		publish()
		// leaving the page clears it, so the panel stops offering a chat room that page was about
		return () => {
			pageContext = null
			publish()
		}
	}, [pageContextKey])
}

// the last topic a topic tool changed, and how many topic changes so far
let changedTopicId: string | null = null
let topicChangeCount = 0

/**
 * Publishes that a topic tool changed a topic.
 */
export function publishTopicChanged(topicId: string): void {
	changedTopicId = topicId
	topicChangeCount += 1
	publish()
}

/**
 * Reads the topic change count when this topic was changed last, or 0 otherwise.
 */
export function useTopicChangeCount(topicId: string | null): number {
	useStoreVersion()
	return topicId !== null && changedTopicId === topicId ? topicChangeCount : 0
}

/**
 * Starts editing the selected conversation's topic and applies its proposed overlay.
 */
export function startEditingTopic(topicId: string, nextProposedTopicEdit?: ProposeTopicEditPayload): void {
	const key = toTopicEditKey(topicId)
	const previousTopicEdit = topicEdits.get(key)
	topicEdits.set(key, {
		topicId,
		proposedTopicEdit: nextProposedTopicEdit ?? previousTopicEdit?.proposedTopicEdit ?? null,
	})
	publish()
}

/**
 * Dismisses the selected conversation's proposal while retaining its topic card.
 */
export function clearProposedTopicEdit(): void {
	const topicEdit = topicEdits.get(toChatKey(chatId))
	if (!topicEdit?.proposedTopicEdit) {
		return
	}
	topicEdit.proposedTopicEdit = null
	publish()
}

/**
 * Returns the current conversation's topic edit, if it belongs to this topic.
 */
export function toTopicEdit(
	topicId: string | null,
): { topicId: string; proposedTopicEdit: ProposeTopicEditPayload | null } | null {
	if (!topicId) {
		return null
	}
	return topicEdits.get(toTopicEditKey(topicId)) ?? null
}

/**
 * Reads the current conversation's proposed topic changes.
 */
export function useProposedTopicEdit(topicId: string | null): ProposeTopicEditPayload | null {
	useStoreVersion()
	return toTopicEdit(topicId)?.proposedTopicEdit ?? null
}

/**
 * Reads whether the selected conversation has started editing this topic.
 */
export function useIsEditingTopic(topicId: string | null): boolean {
	useStoreVersion()
	return toTopicEdit(topicId) !== null
}

// address an unopened editor choice as the topic's private conversation
function toTopicEditKey(topicId: string): string {
	return toChatKey(chatId?.topicId === topicId ? chatId : { kind: "private", topicId })
}
