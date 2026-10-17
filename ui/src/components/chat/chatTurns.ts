// one chat turn in the chat message list, and the helpers that build and finish a chat turn as a question sends
import {
	type ChatLinkPreview,
	type ChatMessageAttachment,
	type KeptChatAttachment,
	withAttachmentNote,
} from "@shared/contracts/chat"
import type { ChatAttachment, ChatToolCall } from "@shared/payloads"
import type { ChatRejection, ChatSendResult } from "@/clients/chatClient"

// one chat turn in the chat message list, with whatever was attached to its question
export type ChatTurn = {
	question: string
	answer: string
	rejection: ChatRejection | null
	at?: number
	// the key the spoken answer store queues this chat turn's reply under, unique for the session
	spokenAnswerKey: string
	// the tools this chat turn called, sent back with the next question
	toolCalls?: ChatToolCall[]
	// a just-sent image or clip holds its data url until the reload hands it a stored id to read from
	attachments: (ChatMessageAttachment & { dataUrl?: string })[]
	// the cards for the question's first links, empty if it holds none or no link preview is stored yet
	linkPreviews: ChatLinkPreview[]
	// the cards for the answer's first links, under the same rules
	answerLinkPreviews: ChatLinkPreview[]
	// true while a just-sent chat turn's cards are still loading in the background
	linkPreviewsPending?: boolean
}

// a stand-in id for a kept attachment that the server has not returned yet
let placeholderCount = 0
function toPlaceholderId(): string {
	placeholderCount += 1
	return `pending-${placeholderCount}`
}

// how many spoken answer keys this session has given out
let spokenAnswerKeyCount = 0

/** Returns a spoken answer key no other chat turn in this session has, for a loaded or a just-sent chat turn. */
export function toSpokenAnswerKey(): string {
	spokenAnswerKeyCount += 1
	return `chat-turn-${spokenAnswerKeyCount}`
}

/** Returns the kept attachments that a sent chat turn adds to the manage list before the server returns their ids. */
export function toKeptAttachmentPlaceholders(sentAttachments: ChatAttachment[]): KeptChatAttachment[] {
	return sentAttachments
		.filter((attachment) => attachment.keep)
		.map((attachment) => ({
			id: toPlaceholderId(),
			name: attachment.name,
			kind: attachment.kind,
			at: new Date().toISOString(),
		}))
}

// the question a chat turn sent, its files, and whether it was spoken
type ToSentChatTurnOptions = { question: string; attachments: ChatAttachment[] }

/**
 * Returns a fresh chat turn showing what it sent. An image or a clip shows from its data url until the reload gives
 * it a stored id.
 */
export function toSentChatTurn({
	question: askedQuestion,
	attachments: sentAttachments,
}: ToSentChatTurnOptions): ChatTurn {
	return {
		question: withAttachmentNote(askedQuestion, sentAttachments),
		answer: "",
		rejection: null,
		spokenAnswerKey: toSpokenAnswerKey(),
		attachments: sentAttachments.map((attachment) => ({
			id: toPlaceholderId(),
			kind: attachment.kind,
			name: attachment.name,
			...(attachment.kind === "image" || attachment.kind === "video" ? { dataUrl: attachment.dataUrl } : {}),
		})),
		linkPreviews: [],
		answerLinkPreviews: [],
	}
}

/**
 * Returns the chat turns once a send ends: a stop before any text drops the empty bubble, else the newest turn
 * settles.
 */
export function toFinishedChatTurns(chatTurns: ChatTurn[], chatSendResult: ChatSendResult): ChatTurn[] {
	// a stop before any text drops the chat turn, unless a tool ran in it, since the server kept that save and the
	// next question has to replay it
	const newestChatTurn = chatTurns.at(-1)
	if (chatSendResult === "stopped" && newestChatTurn?.answer === "" && (newestChatTurn.toolCalls?.length ?? 0) === 0) {
		return chatTurns.slice(0, -1)
	}
	return replaceNewestChatTurn(chatTurns, (chatTurn) => ({
		...chatTurn,
		rejection: chatSendResult === "stopped" ? null : chatSendResult,
		at: Date.now(),
	}))
}

/** Replaces the newest chat turn, which is the one a streaming reply is filling in. */
export function replaceNewestChatTurn(chatTurns: ChatTurn[], replace: (chatTurn: ChatTurn) => ChatTurn): ChatTurn[] {
	return chatTurns.map((chatTurn, index) => (index === chatTurns.length - 1 ? replace(chatTurn) : chatTurn))
}
