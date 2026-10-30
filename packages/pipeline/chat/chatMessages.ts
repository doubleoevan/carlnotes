// one chat turn's input, and the conversation shaped into the model messages the turn sends

import {
	toPodcastEpisodeNoteParts,
	withPodcastEpisodeNote,
	withTrailingNote,
} from "@carlnotes/contracts/chatQuestionNotes"
import { CHAT_HISTORY_TURNS, compactChatAnswer, toUncompactedChatTurnStart } from "@carlnotes/contracts/chatTurns"
import type { ChatAttachment, ChatHistoryTurn, ChatToolCall } from "@carlnotes/contracts/payloads"
import { toOneLineText } from "@carlnotes/contracts/text"
import type { TopicDraft, TopicDraftTeam } from "@carlnotes/contracts/topicPayloads"
import { fenceUntrusted } from "@carlnotes/models/prompts/write"
import type { ImagePart, ModelMessage, TextPart, Tool } from "ai"
import type { PodcastEpisodeChapterContext } from "./retrievePodcastEpisodeChapter"

// everything one chat turn needs to answer a user's question about a topic, or about a team's whole topic set
export type ChatTurnInput = {
	topicId?: string
	// the team whose own chat room is asking, which reads across every topic the team holds
	teamId?: string
	question: string
	// whether the question arrived by voice, so the reply is written to be read aloud
	isSpoken?: boolean
	// the podcast episode chapter that was playing if the user asked from the podcast player. either host answers it
	podcastEpisodeChapter?: PodcastEpisodeChapterContext
	history: ChatHistoryTurn[]
	chatAttachments?: ChatAttachment[]
	// who is asking. chat is signed-in only, and this scopes their kept chat attachments
	userId: string
	// whether this user owns the topic, resolved by the authorization gate before the call
	isTopicOwner: boolean
	litellmApiKey?: string
	// false for a chat room turn, whose answer posts publicly, so the poster's kept chat attachments stay out
	includeAttachments?: boolean
	// what retrieval embeds instead of the question, for a chat room turn whose question is composed from the chat messages
	retrievalQuestion?: string
	// the tools this turn offers: the edit tools to a user who may edit the topic, the draft tools to the new-topic chat
	tools?: Record<string, Tool>
	// the tools that save nothing, all bound outside tools so a consent's forced call can never pick one:
	// open the new-topic chat, show a proposed change on the topic's card, take it back off, suggest sources, and
	// propose creating the topic from the draft
	openNewTopicChatTool?: Tool
	proposeTopicEditTool?: Tool
	cancelTopicEditTool?: Tool
	suggestSourcesTool?: Tool
	proposeNewTopicTool?: Tool
	// the calls the server made before the reply, applying or cancelling the proposal this message answered,
	// replayed after the question so the reply continues from them
	serverToolCalls?: ChatToolCall[]
	// what happened to the last proposal this turn, in one line the private chat's prompt includes
	proposalOutcome?: string
	// the new-topic chat, bound to no topic and no team, and the draft its turn was sent with
	newTopic?: boolean
	topicDraft?: TopicDraft
	// how many more topics the plan lets the user hold
	topicsRemaining?: number
	// the teams the user leads, which the new-topic chat may put the topic on
	leaderTeams?: TopicDraftTeam[]
}

/**
 * The conversation as model messages, ending on the user's latest question and whatever they attached to it,
 * then the calls the server made before the reply, if it made any.
 */
export function toModelMessages(
	history: ChatHistoryTurn[],
	question: string,
	attachments: ChatAttachment[] = [],
	serverToolCalls: ChatToolCall[] = [],
): ModelMessage[] {
	// limit the history the api client sends, so no user can inflate what one chat turn costs
	const includedHistory = history.slice(-CHAT_HISTORY_TURNS)

	// the newest chat is returned word for word, and every podcast episode note is fenced in one random nonce
	const uncompactedChatTurnStart = toUncompactedChatTurnStart(includedHistory)
	const nonce = crypto.randomUUID()
	const conversation = includedHistory.flatMap((chatTurn, index): ModelMessage[] => {
		const historyQuestion = toHistoryQuestion(chatTurn.question, nonce)
		// compact an older chat turn to its opening, without its tool calls
		if (index < uncompactedChatTurnStart) {
			return [
				{ role: "user", content: historyQuestion },
				{ role: "assistant", content: compactChatAnswer(chatTurn.answer) },
			]
		}
		return [{ role: "user", content: historyQuestion }, ...toAnswerModelMessages(chatTurn, index)]
	})
	// the server's calls replay after the question, keyed apart from every history call
	const serverToolCallMessages = serverToolCalls.length > 0 ? toToolCallModelMessages(serverToolCalls, "server") : []
	return [...conversation, { role: "user", content: toUserContent(question, attachments) }, ...serverToolCallMessages]
}

// a history question with the user's words as they are and its podcast episode note fenced as untrusted. a model
// wrote the podcast episode and chapter titles that the note includes
function toHistoryQuestion(question: string, nonce: string): string {
	// a question with no podcast episode note is returned as it is
	const { question: questionWords, podcastEpisodeNote } = toPodcastEpisodeNoteParts(question)
	if (!podcastEpisodeNote) {
		return question
	}

	// the note alone in the fence, after a blank line, or the fence alone for a question with no words
	const fencedPodcastEpisodeNote = fenceUntrusted(withPodcastEpisodeNote("", podcastEpisodeNote), nonce)
	return withTrailingNote({ question: questionWords, note: fencedPodcastEpisodeNote })
}

// the newest message's content
function toUserContent(question: string, attachments: ChatAttachment[]): string | (TextPart | ImagePart)[] {
	if (attachments.length === 0) {
		return question
	}
	// text attachments join the question in one text part, each attachment under the name the user gave it
	const textBlocks = attachments
		.filter((attachment) => attachment.kind === "text")
		.map((attachment) => `--- attached: ${toOneLineText(attachment.name)} ---\n${attachment.text}`)
	// each image is its own part, so the model sees the picture instead of a mention of one
	const images = attachments
		.filter((attachment) => attachment.kind === "image")
		.map((attachment) => ({ type: "image" as const, image: attachment.dataUrl }))
	return [{ type: "text" as const, text: [question, ...textBlocks].join("\n\n") }, ...images]
}

// how a chat turn answered, its tool calls with what they returned, then its words. a chat turn that called no tool
// is one assistant message. the stored calls keep no step of their own, so calls across steps replay as one batch
function toAnswerModelMessages(chatTurn: ChatHistoryTurn, chatTurnIndex: number): ModelMessage[] {
	const toolCalls = chatTurn.toolCalls ?? []
	if (toolCalls.length === 0) {
		return [{ role: "assistant", content: chatTurn.answer }]
	}
	return [...toToolCallModelMessages(toolCalls, String(chatTurnIndex)), { role: "assistant", content: chatTurn.answer }]
}

// tool calls as one assistant message of calls and one tool message of their results
function toToolCallModelMessages(toolCalls: ChatToolCall[], toolCallIdPrefix: string): ModelMessage[] {
	// key each tool call by its place in the conversation. the stored calls keep no id of their own, and a
	// provider rejects a request where two calls share one id
	const toolCallIds = toolCalls.map((_toolCall, index) => `${toolCallIdPrefix}-${index}`)
	return [
		{
			role: "assistant",
			content: toolCalls.map((toolCall, index) => ({
				type: "tool-call" as const,
				toolCallId: toolCallIds[index] ?? `${index}`,
				toolName: toolCall.toolName,
				input: toolCall.input,
			})),
		},
		{
			role: "tool",
			content: toolCalls.map((toolCall, index) => ({
				type: "tool-result" as const,
				toolCallId: toolCallIds[index] ?? `${index}`,
				toolName: toolCall.toolName,
				output: { type: "text" as const, value: toolCall.output },
			})),
		},
	]
}
