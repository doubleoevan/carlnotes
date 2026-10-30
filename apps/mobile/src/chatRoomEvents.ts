import type { ChatRoomEvents } from "@carlnotes/core/lib/chatRoomStream"
import EventSource from "react-native-sse"

/**
 * Opens an authenticated native chat room event stream.
 */
export function openChatRoomEvents({
	url,
	headers,
	events,
	isCurrent,
	onUnauthorized,
	onAppVersionOutdated,
}: {
	url: string
	headers: Record<string, string>
	events: ChatRoomEvents
	isCurrent: () => boolean
	onUnauthorized: () => void
	// the stream's error event has the status and no body
	onAppVersionOutdated: () => void
}): () => void {
	// disable library polling and recover after clean completion
	// the patched done event reports a completed request
	const eventSource = new EventSource<"topicToolCalls" | "ping" | "done">(url, {
		headers,
		pollingInterval: 0,
		withCredentials: false,
		lineEndingCharacter: "\n",
	})
	let isClosed = false
	const acceptChatRoomEvent = (callback: () => void): void => {
		if (!isClosed && isCurrent()) {
			callback()
		}
	}
	// forward connection events
	eventSource.addEventListener("open", () => acceptChatRoomEvent(events.onOpen))
	eventSource.addEventListener("ping", () => acceptChatRoomEvent(events.onPing))
	eventSource.addEventListener("done", () => acceptChatRoomEvent(events.onError))
	eventSource.addEventListener("error", (event) =>
		acceptChatRoomEvent(() => {
			// a revoked session signs out and an outdated build sees the update notice, then the stream ends
			if (event.type === "error" && event.xhrStatus === 401) {
				onUnauthorized()
			}
			if (event.type === "error" && event.xhrStatus === 426) {
				onAppVersionOutdated()
			}
			events.onError(event.type === "error" ? event.xhrStatus : undefined)
		}),
	)
	// parse room messages
	eventSource.addEventListener("message", (event) =>
		acceptChatRoomEvent(() => {
			try {
				events.onMessage(JSON.parse(event.data ?? ""))
			} catch {
				events.onError()
			}
		}),
	)
	// parse Topic tool results
	eventSource.addEventListener("topicToolCalls", (event) =>
		acceptChatRoomEvent(() => {
			try {
				events.onToolCalls(JSON.parse(event.data ?? ""))
			} catch {
				events.onError()
			}
		}),
	)
	// close the native event stream
	return () => {
		isClosed = true
		eventSource.removeAllEventListeners()
		eventSource.close()
	}
}
