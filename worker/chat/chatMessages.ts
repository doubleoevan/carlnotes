// one chat turn's input, and the conversation shaped into the model messages the turn sends
import {
	CHAT_HISTORY_TURNS,
	compactChatAnswer,
	toStandingTopicEditCall,
	toUncompactedChatTurnStart,
} from "@shared/contracts"
import type { ChatAttachment, ChatToolCall } from "@shared/payloads"
import type { TopicDraft, TopicDraftTeam } from "@shared/topicPayloads"
import type { ImagePart, ModelMessage, TextPart, Tool } from "ai"

// one earlier chat turn, replayed so the model can resolve what "that" and "the second one" point back to
export type ChatHistoryTurn = { question: string; answer: string; toolCalls?: ChatToolCall[] }

// everything one chat turn needs to answer a user's question about a topic, or about a team's whole topic set
export type ChatTurnInput = {
	topicId?: string
	// the team whose own chat room is asking, which reads across every topic the team holds
	teamId?: string
	question: string
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
	// open the new-topic chat, show a proposed change on the topic's card, take it back off, and suggest sources
	openNewTopicChatTool?: Tool
	proposeTopicEditTool?: Tool
	cancelTopicEditTool?: Tool
	suggestSourcesTool?: Tool
	// the new-topic chat, bound to no topic and no team, and the draft its turn was sent with
	newTopic?: boolean
	topicDraft?: TopicDraft
	// how many more topics the plan lets the user hold
	topicsRemaining?: number
	// the teams the user leads, which the new-topic chat may put the topic on
	leaderTeams?: TopicDraftTeam[]
}

/**
 * Restricts a consent's first step to the tools that save, and leaves every other step unrestricted.
 * Only a yes that answers a change Carl proposed is restricted, so a yes to any other question never forces a save.
 */
export function toConsentStep(
	stepNumber: number,
	chatTurn: Pick<ChatTurnInput, "question" | "history">,
	savingTools: ChatTurnInput["tools"],
): { toolChoice: "required"; activeTools: string[] } | undefined {
	if (stepNumber !== 0 || !savingTools || !isConsent(chatTurn.question) || !isTopicEditProposed(chatTurn.history)) {
		return undefined
	}
	// name the tools that save. an empty set leaves the step unrestricted
	const savingToolNames = Object.keys(savingTools)
	return savingToolNames.length > 0 ? { toolChoice: "required", activeTools: savingToolNames } : undefined
}

// whether carl's last proposal is still standing, which is what a yes answers
export function isTopicEditProposed(history: ChatHistoryTurn[]): boolean {
	return toStandingTopicEditCall(history.flatMap((chatTurn) => chatTurn.toolCalls ?? [])) !== null
}

// the short questions that consent to whatever carl last proposed
const CONSENT_PATTERN =
	/^(yes|yep|yeah|yup|sure|sure thing|ok|okay|do it|go ahead|go for it|create it|save it|make it|sounds good|perfect|let'?s do it|let'?s go|ship it|yes please|please do)[\s!.,]*$/i

/**
 * Reads whether a question is a consent, the kind that answers a proposal instead of asking anything.
 */
export function isConsent(question: string): boolean {
	return CONSENT_PATTERN.test(question.trim())
}

/**
 * The conversation as model messages, ending on the user's latest question and whatever they attached to it.
 */
export function toModelMessages(
	history: ChatHistoryTurn[],
	question: string,
	attachments: ChatAttachment[] = [],
): ModelMessage[] {
	// limit the history the api client sends, so no user can inflate what one chat turn costs
	const includedHistory = history.slice(-CHAT_HISTORY_TURNS)

	// the newest chat is returned word for word
	const uncompactedChatTurnStart = toUncompactedChatTurnStart(includedHistory)
	const conversation = includedHistory.flatMap((chatTurn, index): ModelMessage[] => {
		// compact an older chat turn to its opening, without its tool calls
		if (index < uncompactedChatTurnStart) {
			return [
				{ role: "user", content: chatTurn.question },
				{ role: "assistant", content: compactChatAnswer(chatTurn.answer) },
			]
		}
		return [{ role: "user", content: chatTurn.question }, ...toAnswerModelMessages(chatTurn, index)]
	})
	return [...conversation, { role: "user", content: toUserContent(question, attachments) }]
}

// an attachment name flattened onto one line
function toAttachmentName(name: string): string {
	return name.replace(/\s+/g, " ").trim()
}

// the newest message's content
function toUserContent(question: string, attachments: ChatAttachment[]): string | (TextPart | ImagePart)[] {
	if (attachments.length === 0) {
		return question
	}
	// text attachments join the question in one text part, each attachment under the name the user gave it
	const textBlocks = attachments
		.filter((attachment) => attachment.kind === "text")
		.map((attachment) => `--- attached: ${toAttachmentName(attachment.name)} ---\n${attachment.text}`)
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
	// key each tool call by its place in the conversation. the stored calls keep no id of their own, and a
	// provider rejects a request where two calls share one id
	const toolCallIds = toolCalls.map((_toolCall, index) => `${chatTurnIndex}-${index}`)
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
		{ role: "assistant", content: chatTurn.answer },
	]
}
