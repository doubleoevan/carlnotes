// the topic chat client. the reply arrives as a stream, so it is read chunk by chunk instead of being parsed whole
import {
	CHAT_HISTORY_TURNS,
	type ChatAttachment,
	type ChatConversation,
	compactChatAnswer,
	toUncompactedChatTurnStart,
} from "@shared/contracts"

// why a chat turn was rejected, kept apart so that the panel can prompt an upgrade instead of a generic error
export type ChatRejection = "budget" | "forbidden" | "failed"

// how a chat turn ended: answered, rejected for a reason, or stopped by the user mid-stream
export type ChatSendResult = ChatRejection | "stopped" | null

// the page a private conversation is addressed by: one topic, or a whole team
export type ChatPage = { topicId: string; teamId?: undefined } | { teamId: string; topicId?: undefined }

/**
 * Loads the user's persisted conversation and its metadata, including whether the user can continue chatting
 */
export async function fetchChatConversation(chatPage: ChatPage): Promise<ChatConversation> {
	const response = await fetch(toChatUrl(chatPage))

	// a failed load raises an error instead of returning an empty conversation
	if (!response.ok) {
		throw new Error(`chat load for ${chatPage.topicId ?? chatPage.teamId} returned ${response.status}`)
	}
	return (await response.json()) as ChatConversation
}

/**
 * Sends one chat turn and streams its reply through onChunk, returning null when complete or the reason why it failed.
 */
export async function sendChatTurn(
	page: ChatPage,
	question: string,
	history: { question: string; answer: string }[],
	attachments: ChatAttachment[],
	onChunk: (chunk: string) => void,
	signal?: AbortSignal,
): Promise<ChatSendResult> {
	// post the question with the recent history, then read the stream to completion
	try {
		const historyChatTurns = history.slice(-CHAT_HISTORY_TURNS)
		const uncompactedChatTurnStart = toUncompactedChatTurnStart(historyChatTurns)
		const response = await fetch(toChatUrl(page), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				question,
				attachments,
				history: historyChatTurns.map((chatTurn, index) => ({
					question: chatTurn.question,
					answer: index < uncompactedChatTurnStart ? compactChatAnswer(chatTurn.answer) : chatTurn.answer,
				})),
			}),
			signal,
		})
		if (!response.ok || !response.body) {
			return toRejection(response.status)
		}

		// stream each decoded chunk as it lands
		const reader = response.body.getReader()
		const decoder = new TextDecoder()
		while (true) {
			const { done, value } = await reader.read()

			// a drained stream is a completed chat turn
			if (done) {
				return null
			}
			onChunk(decoder.decode(value, { stream: true }))
		}
	} catch (error) {
		// the user's own stop is not a failure, and a broken stream leaves what already arrived on screen
		if (error instanceof DOMException && error.name === "AbortError") {
			return "stopped"
		}
		console.error("chat stream failed", error)
		return "failed"
	}
}

/**
 * Clears the user's conversation with a topic. Returns whether the server accepted it.
 */
export async function sendClearChat(chatPage: ChatPage): Promise<boolean> {
	const response = await fetch(toChatUrl(chatPage), { method: "DELETE" })
	return response.ok
}

/**
 * The download url for one of the user's own chat attachments, shown in its bubble as an image or a video.
 */
export function toChatAttachmentUrl(chatAttachmentId: string): string {
	return `/api/chat-attachments/${chatAttachmentId}/download`
}

/**
 * Deletes one of the user's own kept attachments and returns whether the server accepted it.
 */
export async function sendDeleteKeptAttachment(keptAttachmentId: string): Promise<boolean> {
	const response = await fetch(`/api/chat-attachments/${keptAttachmentId}`, { method: "DELETE" })
	return response.ok
}

// the conversation route for a chat page
function toChatUrl(chatPage: ChatPage): string {
	return chatPage.topicId !== undefined ? `/api/topics/${chatPage.topicId}/chat` : `/api/teams/${chatPage.teamId}/chat`
}

// the rejection a status code includes. each one renders differently to the user
function toRejection(status: number): ChatRejection {
	// an exhausted budget prompts an upgrade
	if (status === 402) {
		return "budget"
	}

	// a sign-in or visibility rejection reads as forbidden, and anything else is a genuine failure
	return status === 401 || status === 403 || status === 404 ? "forbidden" : "failed"
}
