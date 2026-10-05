// the topic chat tools eval's promptfoo provider, the chat turn writer under test. the writer calls the LiteLLM proxy
// through worker/models.ts with the tools that a user who may edit the topic gets, and records every tool call
import { generateText, stepCountIs, type Tool } from "ai"
import type { ApiProvider, CallApiContextParams, ProviderResponse } from "promptfoo"
import { toModelRoomQuestion } from "../../api/chat/roomTurns"
import {
	type ChatTurnToolCalls,
	toChatTopicTools,
	toOpenNewTopicChatTool,
	toTopicEditPreviewTools,
} from "../../api/tool/chatTools"
import { CHAT_COST_PER_MILLION_TOKENS, tokenCost } from "../../worker/budget"
import {
	buildTopicChatPrompt,
	MAX_TURN_STEPS,
	toConsentStep,
	toEditTopicBlock,
	toModelMessages,
} from "../../worker/chat"
import { webSearchTool } from "../../worker/chat/search"
import { chatModel } from "../../worker/models"
import { type RecordedToolCall, toRecordingTools, toStepsText } from "../evalHarness"
import { TOPIC_CHAT_CONTEXT } from "../topic-chat/topicChatCases"
import type { TopicChatToolsCase } from "./topicChatToolsCases"

// what each saving tool's stand-in returns, close to the real tool's text for a save that went through
const SAVING_TOOL_OUTPUTS: Record<string, (input: Record<string, unknown>) => string> = {
	updateTopicPrompt: () => `Saved the new prompt for ${TOPIC_CHAT_CONTEXT.topicName}.`,
	updateTopicFields: () => `Saved the settings for ${TOPIC_CHAT_CONTEXT.topicName}.`,
	addSource: (input) =>
		`Added ${input.value}. About 2¢ more a brew, around 9¢ a month at this topic's frequency. No brew started.`,
	removeSource: () => "Removed that source.",
}

// the variables that a case gives the chat turn
export type TopicChatToolsVariables = Pick<TopicChatToolsCase, "chatKind" | "history" | "question" | "chatContext">

// the JSON output of one chat turn. the reply, and every tool call in order
export type TopicChatToolsTurn = { reply: string; toolCalls: RecordedToolCall[] }

// the chat turn writer under test
export const topicChatToolsTurnWriter: ApiProvider = {
	id: () => "topic-chat-tools-turn-writer",
	callApi: writeCaseChatTurn,
}

// write one case's chat turn with the prompt, the messages, and the tools that a chat turn for an editor sends
async function writeCaseChatTurn(_renderedPrompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
	// read the case's variables
	const topicChatToolsVariables = context?.vars as TopicChatToolsVariables
	const { chatKind, history, question, chatContext = TOPIC_CHAT_CONTEXT } = topicChatToolsVariables

	// bind the editor's tools, with stand-ins for the saving tools' database writes, and record every call
	const toolCalls: ChatTurnToolCalls = { count: 0, topicSaves: [], topicSaveRejections: [] }
	const savingTools = toSavingToolStandIns(toChatTopicTools({ userId: "eval-user", topicId: "eval-topic", toolCalls }))
	const { proposeTopicEditTool, cancelTopicEditTool } = toTopicEditPreviewTools({ toolCalls })
	const recordedToolCalls: RecordedToolCall[] = []
	const tools = toRecordingTools(recordedToolCalls, {
		searchWeb: webSearchTool({ count: 0 }),
		...(chatKind === "solo" ? { openNewTopicChat: toOpenNewTopicChatTool({ toolCalls }) } : {}),
		proposeTopicEdit: proposeTopicEditTool,
		cancelTopicEdit: cancelTopicEditTool,
		...savingTools,
	})

	// the solo chat sends the history as messages. the team room sends a question written from the room's transcript,
	// with no history
	const turnQuestion =
		chatKind === "team"
			? await toModelRoomQuestion({
					summary: "Nothing yet.",
					chatRoomAttachmentsBlock: "None yet.",
					chatMessages: question,
				})
			: question
	const turnHistory = chatKind === "team" ? [] : history

	// write the turn, forcing a saving tool on a consent the way a chat turn does
	const chatPrompt = await buildTopicChatPrompt(chatContext, await toEditTopicBlock(savingTools))
	const { steps, usage } = await generateText({
		model: chatModel(),
		system: chatPrompt.prompt,
		messages: toModelMessages(turnHistory, turnQuestion),
		tools,
		prepareStep: ({ stepNumber }) =>
			toConsentStep(stepNumber, { question: turnQuestion, history: turnHistory }, savingTools),
		stopWhen: stepCountIs(MAX_TURN_STEPS),
	})

	// return every step's text in order, the tool calls, and what the turn cost
	const reply = toStepsText(steps)
	const topicChatToolsTurn: TopicChatToolsTurn = { reply, toolCalls: recordedToolCalls }
	return {
		output: JSON.stringify(topicChatToolsTurn),
		cost: tokenCost(usage.totalTokens ?? 0, CHAT_COST_PER_MILLION_TOKENS),
	}
}

// the saving tools with their real descriptions and schemas, and an execute that returns the save's text instead of
// writing to the database
function toSavingToolStandIns(savingTools: Record<string, Tool>): Record<string, Tool> {
	return Object.fromEntries(
		Object.entries(savingTools).map(([toolName, savingTool]) => [
			toolName,
			{
				...savingTool,
				execute: async (input: Record<string, unknown>) => SAVING_TOOL_OUTPUTS[toolName]?.(input) ?? "Saved.",
			},
		]),
	)
}
