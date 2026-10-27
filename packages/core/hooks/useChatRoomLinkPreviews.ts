// the background polling for fresh chat messages' link preview cards in one chat room

import { fetchChatRoomMessageLinkPreviews } from "@carlnotes/client/chatRoomClient"
import type { ChatRoomMessage } from "@carlnotes/contracts/chat"
import { useEffect, useRef, useState } from "react"
import { hasPreviewableLink } from "../lib/chatLinkPreviews"
import { toCurrentChatGuard } from "../stores/chatConversationStore"

// the chat room that the link preview cards are read from, and the list that their cards merge into. a null topic
// is the team's own chat room
type UseChatRoomLinkPreviewsOptions = {
	topicId: string | null
	teamId: string
	setChatMessages: React.Dispatch<React.SetStateAction<ChatRoomMessage[]>>
}

// the loading chat message ids, and a function that starts loading a fresh chat message's cards
export type ChatRoomLinkPreviews = {
	loadingChatMessageIds: Set<number>
	startLinkPreviewRefresh: (chatMessage: ChatRoomMessage) => void
}

/**
 * Polls in the background for fresh chat messages' link preview cards, giving up on each after a few attempts.
 */
export function useChatRoomLinkPreviews({
	topicId,
	teamId,
	setChatMessages,
}: UseChatRoomLinkPreviewsOptions): ChatRoomLinkPreviews {
	// each loading chat message id with the attempts it has left, the timer for the next one, and the loading ids
	const isMountedRef = useRef(true)
	const generationRef = useRef(0)
	const linkPreviewAttemptsRef = useRef(new Map<number, number>())
	const linkPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const [loadingChatMessageIds, setLoadingChatMessageIds] = useState<Set<number>>(new Set())

	// one refresh: read just the loading chat messages' cards, merge any that loaded, and keep loading the rest
	const runLinkPreviewRefresh = async (): Promise<void> => {
		linkPreviewTimerRef.current = null
		const isCurrentChat = toCurrentChatGuard()
		const generation = generationRef.current
		const loadingLinkPreviewIds = [...linkPreviewAttemptsRef.current.keys()]
		const linkPreviewsById = await fetchChatRoomMessageLinkPreviews(topicId, teamId, loadingLinkPreviewIds).catch(
			() => ({}) as Record<number, ChatRoomMessage["linkPreviews"]>,
		)
		if (!isMountedRef.current || generation !== generationRef.current || !isCurrentChat()) {
			return
		}

		// each loading chat message: merge its cards if they loaded, or keep loading while attempts remain
		const stillLoadingChatMessageIds = new Set<number>()
		for (const [chatMessageId, attemptsLeft] of linkPreviewAttemptsRef.current) {
			mergeLoadingChatMessage(
				chatMessageId,
				attemptsLeft,
				linkPreviewsById[chatMessageId] ?? [],
				stillLoadingChatMessageIds,
			)
		}

		// load again while any chat message still has no cards and attempts left
		setLoadingChatMessageIds(stillLoadingChatMessageIds)
		if (stillLoadingChatMessageIds.size > 0) {
			scheduleLinkPreviewRefresh()
		}
	}

	// merge a chat message's cards if they loaded, otherwise decrement its attempts and keep it loading
	const mergeLoadingChatMessage = (
		chatMessageId: number,
		attemptsLeft: number,
		linkPreviews: ChatRoomMessage["linkPreviews"],
		stillLoadingChatMessageIds: Set<number>,
	): void => {
		// cards loaded: merge them into the chat message and drop it from the loading set
		if (linkPreviews.length > 0) {
			linkPreviewAttemptsRef.current.delete(chatMessageId)
			setChatMessages((knownChatMessages) =>
				knownChatMessages.map((chatMessage) =>
					chatMessage.id === chatMessageId ? { ...chatMessage, linkPreviews } : chatMessage,
				),
			)
			return
		}

		// still no cards: keep loading while it has attempts left, otherwise give up on it
		if (attemptsLeft > 1) {
			linkPreviewAttemptsRef.current.set(chatMessageId, attemptsLeft - 1)
			stillLoadingChatMessageIds.add(chatMessageId)
		} else {
			linkPreviewAttemptsRef.current.delete(chatMessageId)
		}
	}

	// schedule one refresh 2.5 seconds out, unless one is already scheduled
	const scheduleLinkPreviewRefresh = (): void => {
		if (!isMountedRef.current) {
			return
		}
		linkPreviewTimerRef.current ??= setTimeout(() => void runLinkPreviewRefresh(), 2500)
	}

	// cancel the pending refresh on unmount
	useEffect(() => {
		isMountedRef.current = true
		return () => {
			isMountedRef.current = false
			generationRef.current += 1
			linkPreviewAttemptsRef.current.clear()
			if (linkPreviewTimerRef.current) {
				clearTimeout(linkPreviewTimerRef.current)
				linkPreviewTimerRef.current = null
			}
		}
	}, [])

	// start loading a fresh chat message's link preview cards, if it has a link and no cards yet
	const startLinkPreviewRefresh = (chatMessage: ChatRoomMessage): void => {
		if (!hasPreviewableLink(chatMessage.content) || chatMessage.linkPreviews.length > 0) {
			return
		}
		// give it six attempts and show its card as loading
		linkPreviewAttemptsRef.current.set(chatMessage.id, 6)
		setLoadingChatMessageIds((previousLoadingChatMessageIds) =>
			new Set(previousLoadingChatMessageIds).add(chatMessage.id),
		)
		scheduleLinkPreviewRefresh()
	}
	return { loadingChatMessageIds, startLinkPreviewRefresh }
}
