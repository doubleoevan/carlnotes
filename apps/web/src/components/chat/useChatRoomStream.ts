import { useChatRoomStream as useSharedChatRoomStream } from "@carlnotes/core/hooks/useChatRoomStream"
import type { ChatRoomHandlers, ConnectChatRoomEvents } from "@carlnotes/core/lib/chatRoomStream"

/**
 * Connects the shared room stream through browser EventSource.
 */
export function useChatRoomStream(topicId: string | null, teamId: string, handlers: ChatRoomHandlers): void {
	useSharedChatRoomStream({ topicId, teamId, handlers, connectEvents })
}

// leave cookies and browser transport in the web app
const connectEvents: ConnectChatRoomEvents = async (url, events) => {
	// connect the browser event listeners
	const eventSource = new EventSource(url)
	eventSource.addEventListener("open", events.onOpen)
	eventSource.addEventListener("ping", events.onPing)
	eventSource.addEventListener("error", () => events.onError())
	// decode incoming room messages
	eventSource.addEventListener("message", (event) => {
		try {
			events.onMessage(JSON.parse(event.data))
		} catch {
			events.onError()
		}
	})
	// decode Topic edit results
	eventSource.addEventListener("topicToolCalls", (event) => {
		try {
			events.onToolCalls(JSON.parse(event.data))
		} catch {
			events.onError()
		}
	})
	// close the connection when the shared stream retires it
	return () => eventSource.close()
}
