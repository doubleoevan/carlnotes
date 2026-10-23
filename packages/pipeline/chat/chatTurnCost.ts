// the largest cost of one chat turn, which the api reserves against the user's budget before the turn runs

import type { ChatAttachment, ChatHistoryTurn } from "@carlnotes/contracts/payloads"
import { MAX_ATTACHMENT_CONTEXT_CHARS } from "@carlnotes/contracts/topics"
import {
	CHAT_COST_PER_MILLION_TOKENS,
	EXA_COST_PER_SEARCH,
	toEstimatedTokens,
	tokenCost,
} from "@carlnotes/models/budget"
import { toModelMessages } from "./chatMessages"
import { MAX_TURN_OUTPUT_TOKENS, MAX_TURN_STEPS } from "./index"
import { MAX_PODCAST_REPLY_OUTPUT_TOKENS } from "./podcastReply"
import { MAX_RESOURCE_CHARS, MAX_RETRIEVED_FINDINGS } from "./retrieve"

// the system prompt's largest template with its blocks, the scan summaries, and the docs sections, in characters
const MAX_CHAT_PROMPT_TEMPLATE_CHARS = 28_000

// the largest system prompt a chat turn builds around the user's words, in characters: the template, the retrieved
// findings, and the topic's attachment context
const MAX_CHAT_SYSTEM_PROMPT_CHARS =
	MAX_CHAT_PROMPT_TEMPLATE_CHARS + MAX_RETRIEVED_FINDINGS * MAX_RESOURCE_CHARS + MAX_ATTACHMENT_CONTEXT_CHARS

// the characters an attached image is priced at, about the tokens a model reads one picture as
const IMAGE_ATTACHMENT_CHARS = 8000

// the user's words that a chat turn sends beside its system prompt, in characters, and whether the turn is a question
// asked from the podcast player
export type MaxChatTurnDollarsOptions = { messageChars: number; isPodcastReply?: boolean }

// a private chat turn's question, the history it sends, and its attachments
export type ToChatTurnMessageCharsOptions = {
	question: string
	history: ChatHistoryTurn[]
	chatAttachments: ChatAttachment[]
}

/**
 * Returns the largest cost of one chat turn at the chat rates. A turn may take every step, and each step reads the
 * largest system prompt with the user's words and writes its full output. A turn with tools may also run a web search
 * a step and the agreement check before its reply. A question from the podcast player is one call with no tools.
 */
export function maxChatTurnDollars({ messageChars, isPodcastReply = false }: MaxChatTurnDollarsOptions): number {
	// a podcast reply is one short call, and any other turn takes every step and the agreement check
	const callCount = isPodcastReply ? 1 : MAX_TURN_STEPS + 1
	const outputTokens = isPodcastReply ? MAX_PODCAST_REPLY_OUTPUT_TOKENS : MAX_TURN_OUTPUT_TOKENS
	const callTokens = toEstimatedTokens(MAX_CHAT_SYSTEM_PROMPT_CHARS + messageChars) + outputTokens

	// the calls' tokens at the chat rate, plus a web search a step on a turn with tools
	const searchDollars = isPodcastReply ? 0 : MAX_TURN_STEPS * EXA_COST_PER_SEARCH
	return tokenCost(callCount * callTokens, CHAT_COST_PER_MILLION_TOKENS) + searchDollars
}

/**
 * Returns how many characters a private chat turn sends beside its system prompt: the conversation as the model reads
 * it, each attached text, and each attached image at the characters an image is priced at.
 */
export function toChatTurnMessageChars({ question, history, chatAttachments }: ToChatTurnMessageCharsOptions): number {
	return JSON.stringify(toModelMessages(history, question)).length + toAttachmentChars(chatAttachments)
}

/**
 * Returns the characters that attachments add to a chat turn: each text's own length, and each image at the
 * characters an image is priced at.
 */
export function toAttachmentChars(chatAttachments: ChatAttachment[]): number {
	return chatAttachments.reduce(
		(attachmentChars, chatAttachment) =>
			attachmentChars + (chatAttachment.kind === "text" ? chatAttachment.text.length : IMAGE_ATTACHMENT_CHARS),
		0,
	)
}
