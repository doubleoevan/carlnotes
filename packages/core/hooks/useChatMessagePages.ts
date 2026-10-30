import { fetchChatRoomMessages } from "@carlnotes/client/chatRoomClient"
import type { ChatRoomMessage, ChatRoomMessagePage } from "@carlnotes/contracts/chat"
import { type Dispatch, type SetStateAction, useRef, useState } from "react"
import { countEarlierChatMessages, mergeChatRoomMessages } from "../lib/chatRoomMessages"
import { toCurrentChatGuard } from "../stores/chatConversationStore"

// leave room for earlier pages to prepend without a negative virtual index
export const FIRST_ITEM_INDEX_START = 1_000_000

// loaded history, page cursors and server-reported voice support
export type ChatMessagePages = {
	chatMessages: ChatRoomMessage[]
	loadEarlierChatMessages: () => Promise<number>
	reloadChatMessages: () => Promise<void>
	// whether the last reload or earlier page failed
	hasMessagePageLoadFailed: boolean
	hasEarlierChatMessages: boolean
	firstItemIndex: number
	isVoiceChatConfigured: boolean
	setChatMessages: Dispatch<SetStateAction<ChatRoomMessage[]>>
	showFirstChatMessagePage: (page: ChatRoomMessagePage) => void
}

/**
 * Loads room history and preserves the virtual index when prepending earlier pages.
 */
export function useChatMessagePages({
	topicId,
	teamId,
	onLoaded,
}: {
	topicId: string | null
	teamId: string
	onLoaded: (page: ChatRoomMessagePage) => void
}): ChatMessagePages {
	const [chatMessages, setChatMessages] = useState<ChatRoomMessage[]>([])
	// whether a page sits above the earliest chat message loaded, and whether one is already on its way
	const [hasEarlierChatMessages, setHasEarlierChatMessages] = useState(false)
	const isLoadingEarlierChatMessagesRef = useRef(false)
	// whether the last reload or earlier page failed
	const [hasMessagePageLoadFailed, setHasMessagePageLoadFailed] = useState(false)
	// the number that the virtualized list gives its first chat message.
	// a prepend lowers it in the same update that grows the list, so no render shows one moved without the other
	const [firstItemIndex, setFirstItemIndex] = useState(FIRST_ITEM_INDEX_START)
	// whether voice is on, which the first page says
	const [isVoiceChatConfigured, setIsVoiceChatConfigured] = useState(false)

	// replace the list with a first page, reset the virtual index, and read whether voice is on
	const showFirstChatMessagePage = (chatMessagePage: ChatRoomMessagePage): void => {
		setChatMessages(mergeChatRoomMessages([], chatMessagePage.chatMessages))
		setHasEarlierChatMessages(chatMessagePage.hasEarlierChatMessages)
		setFirstItemIndex(FIRST_ITEM_INDEX_START)
		setIsVoiceChatConfigured(chatMessagePage.isVoiceChatConfigured)
		onLoaded(chatMessagePage)
	}

	// reload the latest page after a change outside the message stream
	const reloadChatMessages = async (): Promise<void> => {
		const isCurrentChat = toCurrentChatGuard()
		const chatMessagePage = await fetchChatRoomMessages(topicId, teamId)
		if (!isCurrentChat()) {
			return
		}
		// a failed reload leaves the list shown and says it is stale
		if (chatMessagePage === "failed" || chatMessagePage === "unreadable") {
			setHasMessagePageLoadFailed(true)
			return
		}
		// a loaded page replaces the list, and lost access leaves it
		setHasMessagePageLoadFailed(false)
		if (chatMessagePage !== null) {
			showFirstChatMessagePage(chatMessagePage)
		}
	}

	// prepend the page of messages above the earliest chat message loaded, returning how many arrived
	const loadEarlierChatMessages = async (): Promise<number> => {
		const earliestChatMessage = chatMessages[0]
		if (!earliestChatMessage || !hasEarlierChatMessages || isLoadingEarlierChatMessagesRef.current) {
			return 0
		}
		const isCurrentChat = toCurrentChatGuard()
		isLoadingEarlierChatMessagesRef.current = true
		try {
			// the chat message cursor is exclusive, so an earlier page never repeats a chat message already loaded
			const earlierChatMessagePage = await fetchChatRoomMessages(topicId, teamId, earliestChatMessage.id)
			if (!isCurrentChat() || earlierChatMessagePage === null) {
				return 0
			}
			// a failed earlier page says the list is stale, and a loaded one clears that
			if (earlierChatMessagePage === "failed" || earlierChatMessagePage === "unreadable") {
				setHasMessagePageLoadFailed(true)
				return 0
			}
			setHasMessagePageLoadFailed(false)
			// an empty page means the top was reached
			setHasEarlierChatMessages(earlierChatMessagePage.hasEarlierChatMessages)
			if (earlierChatMessagePage.chatMessages.length === 0) {
				return 0
			}
			// move the virtual index only for distinct preceding rows, including replayed page responses
			const addedChatMessageCount = countEarlierChatMessages(chatMessages, earlierChatMessagePage.chatMessages)
			setChatMessages((knownChatMessages) =>
				mergeChatRoomMessages(knownChatMessages, earlierChatMessagePage.chatMessages),
			)
			setFirstItemIndex((previousFirstItemIndex) => previousFirstItemIndex - addedChatMessageCount)
			return addedChatMessageCount
		} finally {
			isLoadingEarlierChatMessagesRef.current = false
		}
	}
	return {
		chatMessages,
		setChatMessages,
		showFirstChatMessagePage,
		loadEarlierChatMessages,
		reloadChatMessages,
		hasMessagePageLoadFailed,
		hasEarlierChatMessages,
		firstItemIndex,
		isVoiceChatConfigured,
	}
}
