// the streamed chat reply: the context and prompt one chat turn reads, and the text, tool results, and cost its
// stream yields
import type { ChatReplyLine } from "@carlnotes/contracts/chatTurns"
import type { PodcastEpisodeSpeaker } from "@carlnotes/contracts/enums"
import type { ChatToolCall } from "@carlnotes/contracts/payloads"
import { chatModel } from "@carlnotes/models/models"
import { type BuiltPrompt, promptTelemetry } from "@carlnotes/models/prompts/fetch"
import { reportError } from "@carlnotes/server/monitoring"
import { type StreamTextTransform, stepCountIs, streamText, type TextStreamPart, type ToolSet } from "ai"
import { type ChatTurnInput, toModelMessages } from "./chatMessages"
import { buildNewTopicChatPrompt, buildTeamChatPrompt, buildTopicChatPrompt, toEditTopicBlock } from "./chatPrompts"
import { streamPodcastReply } from "./podcastReply"
import { type ChatContext, retrieveChatContext } from "./retrieve"
import { retrieveDocsBlock } from "./retrieveDocs"
import { retrieveTeamChatContext, type TeamChatContext } from "./retrieveTeam"
import { type SearchTotal, webSearchTool } from "./search"

// how many model steps one chat turn may take
export const MAX_TURN_STEPS = 8

// the reply's token limit, bounding what one chat turn can spend on expensive output tokens
export const MAX_TURN_OUTPUT_TOKENS = 3000

// one part of a streamed reply: text as it arrives, or a tool call that returned
export type ChatReplyPart =
	| { type: "text"; text: string }
	| Extract<ChatReplyLine, { type: "speaker" }>
	| { type: "tool-result"; toolCall: ChatToolCall }

// what a reply wrote and cost, and on a podcast chat turn the host who answered it
export type ChatReplyCompletion = {
	text: string
	totalTokens: number
	searchCount: number
	toolCalls: ChatToolCall[]
	speaker?: PodcastEpisodeSpeaker
}

// the streamed reply plus its completion, resolved once the stream is fully read
export type ChatReplyStream = { replyParts: AsyncIterable<ChatReplyPart>; completion: Promise<ChatReplyCompletion> }

/**
 * Streams one reply to a user's question about a topic, or null if the topic does not exist.
 */
export async function streamChatReply(input: ChatTurnInput): Promise<ChatReplyStream | null> {
	// catch a failed read or a template drift here
	let chatContext: ChatContext | TeamChatContext | NewTopicChatContext | null
	let chatPrompt: BuiltPrompt
	try {
		// return null when there is no topic or team to chat about
		chatContext = await retrieveReplyContext(input)
		if (!chatContext) {
			return null
		}
		chatPrompt = await buildReplyPrompt(input, chatContext)
	} catch (error) {
		// report the failure, then rethrow
		console.error(`chat reply failed for ${input.teamId ? `team ${input.teamId}` : `topic ${input.topicId}`}`, error)
		reportError(error, "chat", { topicId: input.topicId ?? input.teamId ?? "" })
		throw error
	}
	// a question asked from the podcast player is one structured call with no tools, whose speaker streams first
	if (input.podcastEpisodeChapter) {
		return streamPodcastReply({
			model: chatModel(input.litellmApiKey),
			system: chatPrompt.prompt,
			messages: toModelMessages(input.history, input.question, []),
			telemetryOptions: promptTelemetry(chatPrompt),
		})
	}

	// the system prompt is interpolated with the conversation sent as real messages
	const searchTotal: SearchTotal = { count: 0 }
	// one streamed completion
	const replyStream = streamText({
		model: chatModel(input.litellmApiKey),
		system: chatPrompt.prompt,
		messages: toModelMessages(input.history, input.question, input.chatAttachments ?? [], input.serverToolCalls),
		tools: {
			searchWeb: webSearchTool(searchTotal),
			...(input.openNewTopicChatTool ? { openNewTopicChat: input.openNewTopicChatTool } : {}),
			...(input.proposeTopicEditTool ? { proposeTopicEdit: input.proposeTopicEditTool } : {}),
			...(input.cancelTopicEditTool ? { cancelTopicEdit: input.cancelTopicEditTool } : {}),
			...(input.suggestSourcesTool ? { suggestSources: input.suggestSourcesTool } : {}),
			...(input.proposeNewTopicTool ? { proposeNewTopic: input.proposeNewTopicTool } : {}),
			...input.tools,
		},
		maxOutputTokens: MAX_TURN_OUTPUT_TOKENS,
		stopWhen: stepCountIs(MAX_TURN_STEPS),
		// a paragraph break between text a tool call separates, as the stored answer has it
		experimental_transform: breakTextAroundToolCalls(),
		...promptTelemetry(chatPrompt),
	})
	// the calls the server made before the reply
	const serverToolCalls = input.serverToolCalls ?? []

	// stops an early failure here from crashing the process. it's still handled properly further down
	const completion = toCompletion(replyStream, searchTotal, serverToolCalls)
	completion.catch(() => {})
	return { replyParts: toReplyParts(replyStream.stream, serverToolCalls), completion }
}

// the calls the server made before the reply, then the text and the tool results out of the model's full stream, in
// the order they arrive
async function* toReplyParts(
	modelStream: AsyncIterable<TextStreamPart<ToolSet>>,
	serverToolCalls: ChatToolCall[],
): AsyncGenerator<ChatReplyPart> {
	// forward the server's calls first
	for (const serverToolCall of serverToolCalls) {
		yield { type: "tool-result", toolCall: serverToolCall }
	}
	for await (const streamPart of modelStream) {
		// forward the text and each tool result
		if (streamPart.type === "text-delta") {
			yield { type: "text", text: streamPart.text }
		} else if (streamPart.type === "tool-result") {
			yield { type: "tool-result", toolCall: toChatToolCall(streamPart) }
		}
		// throw an error part. the full stream yields one instead of throwing
		if (streamPart.type === "error") {
			throw streamPart.error
		}
	}
}

// one tool result as the call it records. a tool that returned nothing records "null"
function toChatToolCall(toolResult: { toolName: string; input: unknown; output: unknown }): ChatToolCall {
	return {
		toolName: toolResult.toolName,
		input: toolResult.input,
		output: typeof toolResult.output === "string" ? toolResult.output : (JSON.stringify(toolResult.output) ?? "null"),
	}
}

/**
 * Puts a paragraph break between text a tool call separates, as a delta of the later text block, so the streamed
 * reply reads the way toStepsText stores it.
 */
export function breakTextAroundToolCalls(): StreamTextTransform<ToolSet> {
	return () => {
		// whether any text passed yet, and whether a tool call came after it with no text since
		let hasText = false
		let isBreakDue = false
		return new TransformStream<TextStreamPart<ToolSet>, TextStreamPart<ToolSet>>({
			transform(part, controller) {
				// mark a break due after a tool call that follows text
				if (part.type === "tool-call") {
					isBreakDue = hasText
				}
				// put the break at the front of the first text after that call
				if (part.type === "text-delta" && part.text !== "") {
					hasText = true
					// the break goes at the front of this delta
					if (isBreakDue) {
						isBreakDue = false
						controller.enqueue({ ...part, text: `\n\n${part.text}` })
						return
					}
				}
				controller.enqueue(part)
			},
		})
	}
}

// the new-topic chat's context, the docs alone. it has no topic material to read
type NewTopicChatContext = { docsBlock: string }

// what the reply reads: the topic's own material, every topic a team holds, or the docs alone for the new-topic chat.
// null for a topic or team that does not exist
async function retrieveReplyContext(
	input: ChatTurnInput,
): Promise<ChatContext | TeamChatContext | NewTopicChatContext | null> {
	if (input.newTopic) {
		return { docsBlock: await retrieveDocsBlock(input.question, input.litellmApiKey) }
	}
	if (input.teamId) {
		return retrieveTeamChatContext(input.teamId, input.retrievalQuestion ?? input.question, input.litellmApiKey)
	}
	// retrieve the topic's context with its per-user reads
	return retrieveChatContext(
		input.topicId ?? "",
		input.retrievalQuestion ?? input.question,
		input.userId,
		// the owner flag scopes the topic's own attachments, and the keep flag the user's chat material
		input.isTopicOwner,
		input.litellmApiKey,
		input.includeAttachments ?? true,
	)
}

// the system prompt over the context: the new-topic chat's own template, the team chat room's, or the topic's
async function buildReplyPrompt(
	input: ChatTurnInput,
	chatContext: ChatContext | TeamChatContext | NewTopicChatContext,
): Promise<BuiltPrompt> {
	const isSpoken = input.isSpoken ?? false
	if (input.newTopic) {
		return buildNewTopicChatPrompt(chatContext.docsBlock, input.topicDraft, input.topicsRemaining, input.leaderTeams, {
			isSpoken,
			proposalOutcome: input.proposalOutcome,
		})
	}
	// retrieve every topic the team holds for the team chat room
	if (input.teamId) {
		return buildTeamChatPrompt(chatContext as TeamChatContext, { isSpoken })
	}
	return buildTopicChatPrompt(chatContext as ChatContext, {
		editTopicBlock: await toEditTopicBlock(input),
		isSpoken,
		podcastEpisodeChapter: input.podcastEpisodeChapter,
	})
}

/**
 * Returns the text of every model step in order, with a blank line between steps, the way the reply streamed. A
 * reply's own text is only its final step's.
 */
export function toStepsText(steps: { text: string }[]): string {
	return steps
		.map((step) => step.text.trim())
		.filter(Boolean)
		.join("\n\n")
}

// the assembled reply with its token and search counts, all of which resolve only once the chat stream is read.
// the server's calls lead the tool calls, in the order they ran
async function toCompletion(
	replyStream: {
		steps: PromiseLike<{ text: string }[]>
		usage: PromiseLike<{ totalTokens?: number }>
		toolResults: PromiseLike<{ toolName: string; input: unknown; output: unknown }[]>
	},
	searchTotal: SearchTotal,
	serverToolCalls: ChatToolCall[],
): Promise<ChatReplyCompletion> {
	const usage = await replyStream.usage
	// collect every tool the chat turn called, with its input and output
	const toolCalls = [...serverToolCalls, ...(await replyStream.toolResults).map(toChatToolCall)]
	return {
		text: toStepsText(await replyStream.steps),
		totalTokens: usage.totalTokens ?? 0,
		searchCount: searchTotal.count,
		toolCalls,
	}
}
