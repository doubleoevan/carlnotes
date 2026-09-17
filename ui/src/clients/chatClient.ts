// the topic chat client. the reply arrives as a stream, so it is read chunk by chunk instead of being parsed whole
import {
	CHAT_HISTORY_TURNS,
	type ChatAttachment,
	type ChatConversation,
	type ChatReplyLine,
	type ChatToolCall,
	compactChatAnswer,
	type TopicDraft,
	type TopicDraftTeam,
	type TopicToolCalls,
	toSentToolCalls,
	toUncompactedChatTurnStart,
} from "@shared/contracts"

// why a chat turn was rejected, kept apart so that the panel can prompt an upgrade instead of a generic error
export type ChatRejection = "budget" | "forbidden" | "failed" | "rateLimited"

// how a chat turn ended: answered, rejected for a reason, or stopped by the user mid-stream
export type ChatSendResult = ChatRejection | "stopped" | null

// the page a private conversation is addressed by: one topic, a whole team, or the new-topic chat bound to neither
export type ChatPage =
	| { topicId: string; teamId?: undefined; newTopic?: undefined }
	| { teamId: string; topicId?: undefined; newTopic?: undefined }
	// the team the new-topic chat's draft starts with
	| { newTopic: true; topicId?: undefined; teamId?: undefined; initialTeam?: TopicDraftTeam }

/**
 * Loads the user's persisted conversation and its metadata, including whether the user can continue chatting
 */
export async function fetchChatConversation(chatPage: ChatPage): Promise<ChatConversation> {
	const response = await fetch(toChatUrl(chatPage))

	// a failed load raises an error instead of returning an empty conversation
	if (!response.ok) {
		throw new Error(
			`chat load for ${chatPage.topicId ?? chatPage.teamId ?? "the new topic"} returned ${response.status}`,
		)
	}
	return (await response.json()) as ChatConversation
}

/**
 * Sends one chat turn and streams its reply through onChunk, returning null when complete or the reason why it failed.
 */
export async function sendChatTurn(
	page: ChatPage,
	question: string,
	history: { question: string; answer: string; toolCalls?: ChatToolCall[] }[],
	attachments: ChatAttachment[],
	onChunk: (chunk: string) => void,
	onToolCalls: (toolCalls: TopicToolCalls) => void,
	signal?: AbortSignal,
	// the new-topic chat's draft
	topicDraft?: TopicDraft,
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
				topicDraft,
				history: historyChatTurns.map((chatTurn, index) => ({
					question: chatTurn.question,
					answer: index < uncompactedChatTurnStart ? compactChatAnswer(chatTurn.answer) : chatTurn.answer,
					toolCalls: chatTurn.toolCalls && toSentToolCalls(chatTurn.toolCalls),
				})),
			}),
			signal,
		})
		if (!response.ok || !response.body) {
			return toRejection(response.status)
		}

		return await readChatStream(response.body, onChunk, onToolCalls)
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
 * Clears the user's conversation with a topic. Returns whether the server accepted it, and reads a request that
 * never arrived as a no, so a caller decides what to keep on one answer instead of two.
 */
export async function sendClearChat(chatPage: ChatPage): Promise<boolean> {
	// ask the server to clear, reading a request that never left as a clear that did not happen
	try {
		const response = await fetch(toChatUrl(chatPage), { method: "DELETE" })
		return response.ok
	} catch (error) {
		console.error("chat clear failed", error)
		return false
	}
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

// read the reply stream to its end, one json line at a time. null once it completes
async function readChatStream(
	body: ReadableStream<Uint8Array>,
	onChunk: (chunk: string) => void,
	onToolCalls: (toolCalls: TopicToolCalls) => void,
): Promise<ChatSendResult> {
	// the reader, the decoder, the tail that holds a line until the newline ending it, and how the chat turn ended
	const reader = body.getReader()
	const textDecoder = new TextDecoder()
	let pendingText = ""
	let chatSendResult: ChatSendResult = null

	// read until the stream closes, applying each line as it completes
	while (true) {
		const { done, value } = await reader.read()
		if (done) {
			return chatSendResult
		}
		pendingText += textDecoder.decode(value, { stream: true })

		// apply every line whose newline has arrived, keeping the unfinished last one for the next chunk
		const chatReplyLineTexts = pendingText.split("\n")
		pendingText = chatReplyLineTexts.pop() ?? ""
		for (const chatReplyLineText of chatReplyLineTexts) {
			chatSendResult = applyChatReplyLine(chatReplyLineText, onChunk, onToolCalls) ?? chatSendResult
		}
	}
}

// show one line's text or apply its tool calls, answering "failed" for the line that ends a broken reply
function applyChatReplyLine(
	chatReplyLineText: string,
	onChunk: (chunk: string) => void,
	onToolCalls: (toolCalls: TopicToolCalls) => void,
): ChatSendResult {
	const chatReplyLine = toChatReplyLine(chatReplyLineText)
	// a text line is the only one the bubble shows
	if (chatReplyLine?.type === "text") {
		onChunk(chatReplyLine.text)
		return null
	}
	// the tool calls go to the toast, the card, and the topic page instead
	if (chatReplyLine?.type === "toolCalls") {
		onToolCalls(chatReplyLine.toolCalls)
		return null
	}
	return chatReplyLine ? "failed" : null
}

// what one streamed line says, or null for the blank line a stream ends on and for text the server never wrote
function toChatReplyLine(chatReplyLineText: string): ChatReplyLine | null {
	if (chatReplyLineText === "") {
		return null
	}
	// read the line as json, and drop it unless it is one of the three lines the server writes
	try {
		const parsedReplyLine: unknown = JSON.parse(chatReplyLineText)
		return isChatReplyLine(parsedReplyLine) ? parsedReplyLine : null
	} catch {
		console.error("chat reply line could not be read")
		return null
	}
}

// whether a parsed line says one of the three things, payload included, so a half-written one is dropped instead of shown or applied
function isChatReplyLine(parsedLine: unknown): parsedLine is ChatReplyLine {
	if (typeof parsedLine !== "object" || parsedLine === null) {
		return false
	}
	// a text line needs its text, and the failed line needs nothing beyond its type
	const { type, text, toolCalls } = parsedLine as Record<string, unknown>
	if (type === "text") {
		return typeof text === "string"
	}
	// a tool calls line needs the lists its own guard checks
	if (type === "toolCalls") {
		return isTopicToolCalls(toolCalls)
	}
	return type === "failed"
}

// whether a value holds the two lists the toast, the card, and the topic page read off every tool calls line
function isTopicToolCalls(toolCalls: unknown): toolCalls is TopicToolCalls {
	if (typeof toolCalls !== "object" || toolCalls === null) {
		return false
	}
	const { topicSaves, topicSaveRejections } = toolCalls as Record<string, unknown>
	return Array.isArray(topicSaves) && Array.isArray(topicSaveRejections)
}

// the conversation route for a chat page
function toChatUrl(chatPage: ChatPage): string {
	if (chatPage.newTopic) {
		return "/api/chat/new-topic"
	}
	return chatPage.topicId !== undefined ? `/api/topics/${chatPage.topicId}/chat` : `/api/teams/${chatPage.teamId}/chat`
}

// the rejection a status code includes. each one renders differently to the user
function toRejection(status: number): ChatRejection {
	// an exhausted budget prompts an upgrade
	if (status === 402) {
		return "budget"
	}

	// ask a user past the per-minute limit to wait
	if (status === 429) {
		return "rateLimited"
	}

	// a sign-in or visibility rejection reads as forbidden, and anything else is a genuine failure
	return status === 401 || status === 403 || status === 404 ? "forbidden" : "failed"
}
