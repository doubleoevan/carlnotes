// the topic chat client. the reply arrives as a stream, so it is read chunk by chunk instead of being parsed whole
import {
	CHAT_HISTORY_TURNS,
	CHAT_STREAM_FAILED_TEXT,
	CHAT_TOOL_CALLS_MARKER,
	type ChatAttachment,
	type ChatConversation,
	compactChatAnswer,
	type TopicDraft,
	type TopicDraftTeam,
	type TopicToolCalls,
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
	history: { question: string; answer: string }[],
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

// read the reply stream to its end, showing the text as it arrives with any marker held back. null once it completes
async function readChatStream(
	body: ReadableStream<Uint8Array>,
	onChunk: (chunk: string) => void,
	onToolCalls: (toolCalls: TopicToolCalls) => void,
): Promise<ChatSendResult> {
	const reader = body.getReader()
	const textDecoder = new TextDecoder()
	let streamedText = ""
	let shownTextLength = 0
	// decode each chunk into the whole text, which the markers are read from
	while (true) {
		const { done, value } = await reader.read()
		if (done) {
			return endChatStream(streamedText, shownTextLength, onChunk, onToolCalls)
		}
		streamedText += textDecoder.decode(value, { stream: true })

		// show the text so far, minus a tail that could begin a marker, so no fragment of one flashes on screen
		const visibleText = toVisibleText(streamedText)
		const showableTextLength = visibleText.length - toChatStreamMarkerPrefixTail(visibleText).length
		if (showableTextLength > shownTextLength) {
			onChunk(visibleText.slice(shownTextLength, showableTextLength))
			shownTextLength = showableTextLength
		}
	}
}

// a drained stream completed unless the server ended it with the failure marker
function endChatStream(
	streamedText: string,
	shownTextLength: number,
	onChunk: (chunk: string) => void,
	onToolCalls: (toolCalls: TopicToolCalls) => void,
): ChatSendResult {
	if (streamedText.trimEnd().endsWith(CHAT_STREAM_FAILED_TEXT.trim())) {
		return "failed"
	}

	// show the held tail as ordinary text
	const unshownText = toVisibleText(streamedText).slice(shownTextLength)
	if (unshownText) {
		onChunk(unshownText)
	}
	// read the tool calls the stream ends with
	const toolCalls = toToolCalls(streamedText)
	if (toolCalls) {
		onToolCalls(toolCalls)
	}
	return null
}

// the two markers a chat stream can end with. a tail that could begin one is held back until the next chunk settles it
const CHAT_STREAM_MARKERS = [CHAT_STREAM_FAILED_TEXT, CHAT_TOOL_CALLS_MARKER]

// the text the bubble shows: nothing from the tool calls marker on, and never the failure marker
function toVisibleText(streamedText: string): string {
	const toolCallsStartIndex = streamedText.lastIndexOf(CHAT_TOOL_CALLS_MARKER)
	const textBeforeToolCalls = toolCallsStartIndex >= 0 ? streamedText.slice(0, toolCallsStartIndex) : streamedText
	return textBeforeToolCalls.replace(CHAT_STREAM_FAILED_TEXT, "")
}

// the tool calls the stream ends with, or null
function toToolCalls(streamedText: string): TopicToolCalls | null {
	const toolCallsStartIndex = streamedText.lastIndexOf(CHAT_TOOL_CALLS_MARKER)
	if (toolCallsStartIndex < 0) {
		return null
	}
	// read the tool calls, or none for a broken stream that cut them off part-way
	try {
		return JSON.parse(streamedText.slice(toolCallsStartIndex + CHAT_TOOL_CALLS_MARKER.length)) as TopicToolCalls
	} catch {
		return null
	}
}

// the longest tail of the text that could be the start of a marker
function toChatStreamMarkerPrefixTail(text: string): string {
	const longestMarkerPrefixLength = Math.max(...CHAT_STREAM_MARKERS.map((marker) => marker.length)) - 1
	// search from the longest tail down
	for (let length = Math.min(longestMarkerPrefixLength, text.length); length > 0; length--) {
		const tail = text.slice(-length)
		if (CHAT_STREAM_MARKERS.some((marker) => marker.startsWith(tail))) {
			return tail
		}
	}
	return ""
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
