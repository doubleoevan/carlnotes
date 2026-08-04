// the topic chat client. the reply arrives as a stream, so it is read chunk by chunk instead of being parsed whole
import {
	CHAT_HISTORY_TURNS,
	type ChatAttachment,
	type ChatConversation,
	type ChatTurnRow,
	compactChatAnswer,
	toUncompactedChatTurnStart,
} from "@shared/contracts"

// why a chat turn was refused, kept apart so that the panel can prompt an upgrade instead of a generic error
export type ChatRefusal = "budget" | "forbidden" | "failed"

// how a chat turn ended: answered, refused for a reason, or stopped by the reader mid-stream
export type ChatSendResult = ChatRefusal | "stopped" | null

/**
 * Loads the caller's persisted conversation and its metadata, including whether the user can continue chatting
 */
export async function fetchChatConversation(topicId: string): Promise<ChatConversation> {
	const response = await fetch(`/api/topics/${topicId}/chat`)

	// a failed load raises an error instead of returning an empty conversation
	if (!response.ok) {
		throw new Error(`chat load for topic ${topicId} returned ${response.status}`)
	}
	return (await response.json()) as ChatConversation
}

/**
 * Sends one chat turn and streams its reply through onChunk, returning null when answered or the reason why it was not.
 */
export async function sendChatTurn(
	topicId: string,
	question: string,
	history: ChatTurnRow[],
	attachments: ChatAttachment[],
	onChunk: (chunk: string) => void,
	signal?: AbortSignal,
): Promise<ChatSendResult> {
	// post the question with the recent history, then read the stream to completion.
	// older answers are compacted, so the payload stays flat as the conversation grows
	try {
		const historyChatTurns = history.slice(-CHAT_HISTORY_TURNS)
		const uncompactedChatTurnStart = toUncompactedChatTurnStart(historyChatTurns)
		const response = await fetch(`/api/topics/${topicId}/chat`, {
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
			return toRefusal(response.status)
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
		// the reader's own stop is not a failure, and a broken stream leaves what already arrived on screen
		if (error instanceof DOMException && error.name === "AbortError") {
			return "stopped"
		}
		console.error("chat stream failed", error)
		return "failed"
	}
}

/**
 * Clears the caller's conversation with a topic. Returns whether the server accepted it.
 */
export async function sendClearChat(topicId: string): Promise<boolean> {
	const response = await fetch(`/api/topics/${topicId}/chat`, { method: "DELETE" })
	return response.ok
}

/**
 * Deletes one of the caller's own kept attachments and returns whether the server accepted it.
 */
export async function sendDeleteKeptAttachment(keptAttachmentId: string): Promise<boolean> {
	const response = await fetch(`/api/chat-attachments/${keptAttachmentId}`, { method: "DELETE" })
	return response.ok
}

// the refusal a status code includes. each one renders differently to the reader
function toRefusal(status: number): ChatRefusal {
	// an exhausted budget prompts an upgrade
	if (status === 402) {
		return "budget"
	}

	// a sign-in or visibility refusal reads as forbidden, and anything else is a genuine failure
	return status === 401 || status === 403 || status === 404 ? "forbidden" : "failed"
}
