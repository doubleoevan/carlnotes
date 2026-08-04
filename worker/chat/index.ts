// the generation side of topic chat. one question becomes a streamed reply written from the topic's own material,
// and the caller meters what it cost once the stream finishes
import {
	CHAT_HISTORY_TURNS,
	type ChatAttachment,
	compactChatAnswer,
	toUncompactedChatTurnStart,
} from "@shared/contracts"
import { reportError } from "@shared/monitoring"
import { type ImagePart, type ModelMessage, stepCountIs, streamText, type TextPart } from "ai"
import { chatModel } from "../models"
import { type BuiltPrompt, fetchPromptTemplate, promptTelemetry } from "../prompts/fetch"
import { writePrompt } from "../prompts/write"
import { type ChatContext, retrieveChatContext } from "./retrieve"
import { type SearchTotal, webSearchTool } from "./search"

// how many model steps one chat turn search may take. this is a loop backstop,
// since the monthly budget already meters what a chat turn's searches cost
const MAX_TURN_STEPS = 8

// one earlier chat turn, replayed so the model can resolve what "that" and "the second one" point back to
export type HistoryTurn = { question: string; answer: string }

// everything one chat turn needs to answer a user's question about a topic
export type ChatTurnInput = {
	topicId: string
	question: string
	history: HistoryTurn[]
	attachments?: ChatAttachment[]
	// who is asking. chat is signed-in only, and this scopes their kept chat attachments
	userId: string
	// whether this user owns the topic, resolved by the authorization gate before the call
	isOwner: boolean
	litellmApiKey?: string
}

// the streamed reply plus what it cost, resolved once the stream is fully read
export type ChatReplyStream = {
	textStream: AsyncIterable<string>
	completion: Promise<{ text: string; totalTokens: number; searchCount: number }>
}

/**
 * Streams one reply to a user's question about a topic, or null when the topic does not exist.
 */
export async function streamChatReply(input: ChatTurnInput): Promise<ChatReplyStream | null> {
	// assemble what the topic already holds, then write the prompt over it
	const chatContext = await retrieveChatContext(
		input.topicId,
		input.question,
		input.userId,
		input.isOwner,
		input.litellmApiKey,
	)
	if (!chatContext) {
		return null
	}
	// a template drift here throws, and nothing downstream would otherwise report it: chat never runs as a
	// Temporal activity, so there is no workflow history to catch this the way a scan or attachment would
	let chatPrompt: BuiltPrompt
	try {
		chatPrompt = await buildChatPrompt(chatContext)
	} catch (error) {
		console.error(`chat prompt failed for topic ${input.topicId}`, error)
		reportError(error, "chat", { topicId: input.topicId })
		throw error
	}

	// the briefing interpolates the system prompt with the conversation as real messages.
	// every chat turn gets the search tool, and the total counts what it spends
	const searchTotal: SearchTotal = { count: 0 }
	const replyStream = streamText({
		model: chatModel(input.litellmApiKey),
		system: chatPrompt.prompt,
		messages: toModelMessages(input.history, input.question, input.attachments ?? []),
		tools: { searchWeb: webSearchTool(searchTotal) },
		stopWhen: stepCountIs(MAX_TURN_STEPS),
		...promptTelemetry(chatPrompt),
	})
	// stops an early failure here from crashing the process. it's still handled properly further down
	const completion = toCompletion(replyStream, searchTotal)
	completion.catch(() => {})
	return { textStream: replyStream.textStream, completion }
}

/**
 * The conversation as model messages, ending on the reader's latest question and whatever they attached to it.
 */
export function toModelMessages(
	history: HistoryTurn[],
	question: string,
	attachments: ChatAttachment[] = [],
): ModelMessage[] {
	// cap the client-included history here, so no user can inflate what one chat turn costs
	const includedHistory = history.slice(-CHAT_HISTORY_TURNS)

	// the newest chat is returned verbatim, and older answers are trimmed to their openings,
	// budgeted by characters so a verbose conversation compacts sooner than a terse one
	const uncompactedChatTurnStart = toUncompactedChatTurnStart(includedHistory)
	const conversation = includedHistory.flatMap((chatTurn, index): ModelMessage[] => [
		{ role: "user", content: chatTurn.question },
		{
			role: "assistant",
			content: index < uncompactedChatTurnStart ? compactChatAnswer(chatTurn.answer) : chatTurn.answer,
		},
	])
	return [...conversation, { role: "user", content: toUserContent(question, attachments) }]
}

// an attachment name flattened onto one line. the name becomes the header its contents sit under,
// so newlines are stripped to avoid closing that header early
function toAttachmentName(name: string): string {
	return name.replace(/\s+/g, " ").trim()
}

// the newest message's content. a question with no attachments is a bare string,
// otherwise the question includes its text attachments in one part, with every image as a part of its own
function toUserContent(question: string, attachments: ChatAttachment[]): string | (TextPart | ImagePart)[] {
	if (attachments.length === 0) {
		return question
	}
	// text attachments join the question in one text part, each attachment under the name the reader gave it
	const textBlocks = attachments
		.filter((attachment) => attachment.kind === "text")
		.map((attachment) => `--- attached: ${toAttachmentName(attachment.name)} ---\n${attachment.text}`)
	// each image is its own part, so the model sees the picture instead of a mention of one
	const images = attachments
		.filter((attachment) => attachment.kind === "image")
		.map((attachment) => ({ type: "image" as const, image: attachment.data }))
	return [{ type: "text" as const, text: [question, ...textBlocks].join("\n\n") }, ...images]
}

// the assembled reply with its token and search counts, all of which settle only once the chat stream is drained
async function toCompletion(
	replyStream: { text: PromiseLike<string>; usage: PromiseLike<{ totalTokens?: number }> },
	searchTotal: SearchTotal,
): Promise<{ text: string; totalTokens: number; searchCount: number }> {
	const usage = await replyStream.usage
	return { text: await replyStream.text, totalTokens: usage.totalTokens ?? 0, searchCount: searchTotal.count }
}

/**
 * Builds the system briefing from the 'chat-topic.md' prompt template, with everything a reader could have written fenced as data.
 */
export async function buildChatPrompt(chatContext: ChatContext): Promise<BuiltPrompt> {
	const { template, name, registryPrompt } = await fetchPromptTemplate("chat-topic")

	// fill the template, composing each list block first since the templates carry no loops
	const prompt = writePrompt(template, {
		topicName: chatContext.topicName,
		topicPrompt: chatContext.topicPrompt || "Nothing written down yet.",
		findingsBlock: toFindingsBlock(chatContext),
		scanSummariesBlock: toScanSummariesBlock(chatContext),
		attachmentContext: chatContext.attachmentContext || "None.",
		chatAttachmentContext: chatContext.chatAttachmentContext || "None.",
	})
	return { prompt, name, registryPrompt }
}

// the findings as the model reads them, best-match first.
// an empty set says so in words, so the model never invents an answer for a topic with nothing indexed
function toFindingsBlock(chatContext: ChatContext): string {
	if (chatContext.findings.length === 0) {
		return "No findings are indexed for this topic yet."
	}

	// each finding includes its own url, so a reply can link what it cites
	return chatContext.findings
		.map((finding) =>
			[
				`### ${finding.title ?? finding.url}`,
				finding.url,
				`Relevance: ${finding.relevanceScore.toFixed(2)} — ${finding.relevanceExplanation}`,
				finding.text,
			].join("\n"),
		)
		.join("\n\n")
}

// the recent scan notes, newest first, or a plain line saying there are none
function toScanSummariesBlock(chatContext: ChatContext): string {
	if (chatContext.scanSummaries.length === 0) {
		return "No scan notes yet."
	}
	return chatContext.scanSummaries.join("\n\n")
}
