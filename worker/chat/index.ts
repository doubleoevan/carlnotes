// the generation side of topic chat
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
import {
	type ChatContext,
	type RetrievedFinding,
	retrieveChatContext,
	retrieveTeamChatContext,
	type TeamChatContext,
} from "./retrieve"
import { type SearchTotal, webSearchTool } from "./search"

// how many model steps one chat turn search may take
const MAX_TURN_STEPS = 8

// the reply's token limit, bounding what one chat turn can spend on expensive output tokens
const MAX_TURN_OUTPUT_TOKENS = 3000

// one earlier chat turn, replayed so the model can resolve what "that" and "the second one" point back to
export type ChatHistoryTurn = { question: string; answer: string }

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
}

// the streamed reply plus what it cost, resolved once the stream is fully read
export type ChatReplyStream = {
	textStream: AsyncIterable<string>
	completion: Promise<{ text: string; totalTokens: number; searchCount: number }>
}

/**
 * Streams one reply to a user's question about a topic, or null if the topic does not exist.
 */
export async function streamChatReply(input: ChatTurnInput): Promise<ChatReplyStream | null> {
	// assemble what the topic already holds, or every held topic for a team chat room, then write the prompt over it
	let chatContext: ChatContext | TeamChatContext | null
	if (input.teamId) {
		chatContext = await retrieveTeamChatContext(
			input.teamId,
			input.retrievalQuestion ?? input.question,
			input.litellmApiKey,
		)
	} else {
		// the topic path keeps its per-user reads, which the public team chat room never includes
		chatContext = await retrieveChatContext(
			input.topicId ?? "",
			input.retrievalQuestion ?? input.question,
			input.userId,
			// the owner flag scopes the topic's own attachments, and the keep flag the user's chat material
			input.isTopicOwner,
			input.litellmApiKey,
			input.includeAttachments ?? true,
		)
	}
	// a missing topic or team has nothing to chat about
	if (!chatContext) {
		return null
	}
	// a template drift here throws an error, and nothing downstream would otherwise report it
	let chatPrompt: BuiltPrompt
	try {
		// the team chat room writes over its own template, every other chat turn over the topic's
		chatPrompt = input.teamId
			? await buildTeamChatPrompt(chatContext as TeamChatContext)
			: await buildTopicChatPrompt(chatContext as ChatContext)
	} catch (error) {
		console.error(`chat prompt failed for ${input.teamId ? `team ${input.teamId}` : `topic ${input.topicId}`}`, error)
		reportError(error, "chat", { topicId: input.topicId ?? input.teamId ?? "" })
		throw error
	}

	// the system prompt is interpolated with the conversation sent as real messages
	const searchTotal: SearchTotal = { count: 0 }
	// one streamed completion over the assembled system prompt
	const replyStream = streamText({
		model: chatModel(input.litellmApiKey),
		system: chatPrompt.prompt,
		messages: toModelMessages(input.history, input.question, input.chatAttachments ?? []),
		tools: { searchWeb: webSearchTool(searchTotal) },
		maxOutputTokens: MAX_TURN_OUTPUT_TOKENS,
		stopWhen: stepCountIs(MAX_TURN_STEPS),
		...promptTelemetry(chatPrompt),
	})
	// stops an early failure here from crashing the process. it's still handled properly further down
	const completion = toCompletion(replyStream, searchTotal)
	completion.catch(() => {})
	return { textStream: replyStream.textStream, completion }
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
	const conversation = includedHistory.flatMap((chatTurn, index): ModelMessage[] => [
		{ role: "user", content: chatTurn.question },
		{
			role: "assistant",
			content: index < uncompactedChatTurnStart ? compactChatAnswer(chatTurn.answer) : chatTurn.answer,
		},
	])
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

// the assembled reply with its token and search counts, all of which resolve only once the chat stream is drained
async function toCompletion(
	replyStream: { text: PromiseLike<string>; usage: PromiseLike<{ totalTokens?: number }> },
	searchTotal: SearchTotal,
): Promise<{ text: string; totalTokens: number; searchCount: number }> {
	const usage = await replyStream.usage
	return { text: await replyStream.text, totalTokens: usage.totalTokens ?? 0, searchCount: searchTotal.count }
}

/**
 * Builds the system prompt from the 'chat-topic.md' template, with everything a user could have written fenced as data.
 */
export async function buildTopicChatPrompt(chatContext: ChatContext): Promise<BuiltPrompt> {
	const { template, name, registryPrompt } = await fetchPromptTemplate("chat-topic")

	// fill the template, composing each list block first
	const prompt = writePrompt(template, {
		topicName: chatContext.topicName,
		topicPrompt: chatContext.topicPrompt || "Nothing written down yet.",
		findingsBlock: toFindingsBlock(chatContext.findings),
		sourcesBlock: toSourcesBlock(chatContext.sources),
		scanSummariesBlock: toScanSummariesBlock(chatContext.scanSummaries),
		attachmentContext: chatContext.attachmentContext || "None.",
		chatAttachmentContext: chatContext.chatAttachmentContext || "None.",
		docsBlock: chatContext.docsBlock || "None.",
	})
	return { prompt, name, registryPrompt }
}

/**
 * Builds the team chat room's system prompt from the 'chat-team.md' template, reading across every topic the team holds.
 */
export async function buildTeamChatPrompt(teamContext: TeamChatContext): Promise<BuiltPrompt> {
	const { template, name, registryPrompt } = await fetchPromptTemplate("chat-team")

	// fill the template, composing each list block first
	const prompt = writePrompt(template, {
		teamName: teamContext.teamName,
		topicsBlock: toTopicsBlock(teamContext.topics),
		findingsBlock: toFindingsBlock(teamContext.findings),
		sourcesBlock: toSourcesBlock(teamContext.sources),
		scanSummariesBlock: toScanSummariesBlock(teamContext.scanSummaries),
		docsBlock: teamContext.docsBlock || "None.",
	})
	return { prompt, name, registryPrompt }
}

// each team topic's name with the prompt its owner wrote, or a plain line for a team with none
function toTopicsBlock(teamTopics: TeamChatContext["topics"]): string {
	if (teamTopics.length === 0) {
		return "This team holds no topics yet."
	}
	return teamTopics.map((topic) => `### ${topic.name}\n${topic.prompt || "Nothing written down yet."}`).join("\n\n")
}

// the findings as the model reads them, best-match first with recency breaking the near-ties
function toFindingsBlock(retrievedFindings: RetrievedFinding[]): string {
	if (retrievedFindings.length === 0) {
		return "No findings are indexed for this topic yet."
	}

	// each finding includes its own url
	return retrievedFindings
		.map((finding) =>
			[
				`### ${finding.topicName ? `[${finding.topicName}] ` : ""}${finding.title ?? finding.url}`,
				finding.url,
				`Found: ${finding.foundAt.toISOString().slice(0, 10)}`,
				`Relevance: ${finding.relevanceScore.toFixed(2)} — ${finding.relevanceExplanation}`,
				finding.text,
			].join("\n"),
		)
		.join("\n\n")
}

// the places this topic reads, one per line, or a plain line saying it has no sources
function toSourcesBlock(topicSources: string[]): string {
	if (topicSources.length === 0) {
		return "No sources are set up for this topic yet."
	}
	return topicSources.join("\n")
}

// the recent scan summaries, newest first, or a plain line saying there are none
function toScanSummariesBlock(scanSummaries: string[]): string {
	if (scanSummaries.length === 0) {
		return "No scan notes yet."
	}
	return scanSummaries.join("\n\n")
}
