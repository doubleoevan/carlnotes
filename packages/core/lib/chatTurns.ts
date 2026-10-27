// one chat turn in the chat message list, and the helpers that build and finish a chat turn as a question sends

import type { ChatRejection, ChatSendResult } from "@carlnotes/client/chatClient"
import type { ChatMessageAttachment, ChatTurnRow, KeptChatAttachment } from "@carlnotes/contracts/chat"
import { withAttachmentNote } from "@carlnotes/contracts/chatQuestionNotes"
import type { ChatAttachment } from "@carlnotes/contracts/payloads"

// one chat turn in the chat message list: the stored chat turn's text, tool calls, link preview cards, speaker, and
// podcast episode chapter, with whatever was attached to its question and how its send ended
export type ChatTurn = Pick<
	ChatTurnRow,
	"question" | "answer" | "toolCalls" | "linkPreviews" | "answerLinkPreviews" | "speaker" | "podcastEpisodeChapter"
> & {
	rejection: ChatRejection | null
	at?: number
	// the key the spoken answer store queues this chat turn's reply under, unique for the session
	spokenAnswerKey: string
	// a just-sent image or clip holds its data url until the reload hands it a stored id to read from
	attachments: (ChatMessageAttachment & { dataUrl?: string })[]
	// true while a just-sent chat turn's cards are still loading in the background
	linkPreviewsPending?: boolean
}

// how many spoken answer keys this session has given out
let spokenAnswerKeyCount = 0

/**
 * Returns a spoken answer key no other chat turn in this session has, for a loaded or a just-sent chat turn.
 */
export function toSpokenAnswerKey(): string {
	spokenAnswerKeyCount += 1
	return `chat-turn-${spokenAnswerKeyCount}`
}

/**
 * Returns the kept attachments that a sent chat turn adds to the manage list before the server returns their ids.
 */
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

/**
 * Returns a stored chat turn as the chat message list shows it, with a spoken answer key of its own.
 */
export function toLoadedChatTurn(chatTurnRow: ChatTurnRow): ChatTurn {
	return {
		question: chatTurnRow.question,
		answer: chatTurnRow.answer,
		toolCalls: chatTurnRow.toolCalls,
		rejection: null,
		at: chatTurnRow.at ? Date.parse(chatTurnRow.at) : undefined,
		spokenAnswerKey: toSpokenAnswerKey(),
		speaker: chatTurnRow.speaker,
		podcastEpisodeChapter: chatTurnRow.podcastEpisodeChapter,
		attachments: chatTurnRow.attachments,
		linkPreviews: chatTurnRow.linkPreviews,
		answerLinkPreviews: chatTurnRow.answerLinkPreviews,
	}
}

// the question a chat turn sent, its files, and whether it was spoken
type ToSentChatTurnOptions = { question: string; attachments: ChatAttachment[] }

/**
 * Returns a new chat turn with temporary attachments for its sent files.
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
		speaker: "host",
		podcastEpisodeChapter: null,
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

// the spoken answer key of the chat turn whose send ended, and how it ended
type ToFinishedChatTurnsOptions = { spokenAnswerKey: string; chatSendResult: ChatSendResult }

/**
 * Settles a completed chat turn or removes an empty stopped turn.
 */
export function toFinishedChatTurns(
	chatTurns: ChatTurn[],
	{ spokenAnswerKey, chatSendResult }: ToFinishedChatTurnsOptions,
): ChatTurn[] {
	// a stop before any text drops the chat turn, unless a tool ran in it. the server kept that save, and the next
	// question replays it
	const sentChatTurn = findChatTurn(chatTurns, spokenAnswerKey)
	if (chatSendResult === "stopped" && sentChatTurn?.answer === "" && (sentChatTurn.toolCalls?.length ?? 0) === 0) {
		return withoutChatTurn(chatTurns, spokenAnswerKey)
	}
	return replaceChatTurn(chatTurns, spokenAnswerKey, (chatTurn) => ({
		...chatTurn,
		rejection: chatSendResult === "stopped" ? null : chatSendResult,
		at: Date.now(),
	}))
}

/**
 * Returns the chat turn with this spoken answer key, or undefined if no chat turn has it.
 */
export function findChatTurn(chatTurns: ChatTurn[], spokenAnswerKey: string): ChatTurn | undefined {
	return chatTurns.find((chatTurn) => chatTurn.spokenAnswerKey === spokenAnswerKey)
}

/**
 * Returns the chat turns without the one with this spoken answer key.
 */
export function withoutChatTurn(chatTurns: ChatTurn[], spokenAnswerKey: string): ChatTurn[] {
	return chatTurns.filter((chatTurn) => chatTurn.spokenAnswerKey !== spokenAnswerKey)
}

/**
 * Replaces the chat turn with the matching spoken-answer key.
 */
export function replaceChatTurn(
	chatTurns: ChatTurn[],
	spokenAnswerKey: string,
	replace: (chatTurn: ChatTurn) => ChatTurn,
): ChatTurn[] {
	return chatTurns.map((chatTurn) => (chatTurn.spokenAnswerKey === spokenAnswerKey ? replace(chatTurn) : chatTurn))
}

/**
 * Replaces or appends the chat turn with the matching spoken-answer key.
 */
export function upsertChatTurn(chatTurns: ChatTurn[], chatTurn: ChatTurn): ChatTurn[] {
	return findChatTurn(chatTurns, chatTurn.spokenAnswerKey) !== undefined
		? replaceChatTurn(chatTurns, chatTurn.spokenAnswerKey, () => chatTurn)
		: [...chatTurns, chatTurn]
}

// a stand-in id for a kept attachment that the server has not returned yet
let attachmentPlaceholderCount = 0
function toPlaceholderId(): string {
	attachmentPlaceholderCount += 1
	return `pending-${attachmentPlaceholderCount}`
}
