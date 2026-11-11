// the Topic Post whose page is open, which the private chat of its Topic asks about. the post's page names it while
// it shows, a screen that stays mounted under others names it again as it takes focus, and the chat panel reads it
import type { ChatPageTopicPost } from "@carlnotes/client/chatClient"
import { useEffect, useSyncExternalStore } from "react"

// the open post with the Topic it is on, or null on any other page
type ChatTopicPost = ChatPageTopicPost & { topicId: string }

// the open post, and who reads it
let chatTopicPost: ChatTopicPost | null = null
const listeners = new Set<() => void>()

// set the open post and tell every reader
function setChatTopicPost(openTopicPost: ChatTopicPost | null): void {
	chatTopicPost = openTopicPost
	for (const listener of listeners) {
		listener()
	}
}

// add a reader, and return the call that removes it
function subscribe(listener: () => void): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

/**
 * Names a published Topic Post as the one the private chat asks about. Returns the call that names none again, if
 * the post is still the one named.
 */
export function registerChatTopicPost({ id, title, path, topicId }: ChatTopicPost): () => void {
	setChatTopicPost({ id, title, path, topicId })
	return () => {
		if (chatTopicPost?.id === id) {
			setChatTopicPost(null)
		}
	}
}

/**
 * Names a published Topic Post as the one the private chat asks about, for as long as its page shows. A draft, and a
 * post still loading, name none.
 */
export function useRegisterChatTopicPost(openTopicPost: ChatTopicPost | null): void {
	// the post's own values, so a new object for the same post sets nothing again
	const { id, title, path, topicId } = openTopicPost ?? {}
	useEffect(() => {
		if (id === undefined || title === undefined || path === undefined || topicId === undefined) {
			return
		}

		// name the post, and name none once the page leaves if it is still the one named
		return registerChatTopicPost({ id, title, path, topicId })
	}, [id, title, path, topicId])
}

/**
 * Returns the Topic Post whose page is open, or null on any other page.
 */
export function useChatTopicPost(): ChatTopicPost | null {
	return useSyncExternalStore(
		subscribe,
		() => chatTopicPost,
		() => null,
	)
}
