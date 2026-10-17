// the topic chat tools eval's promptfoo provider, which runs the chat turn writer with the tools that a user who may
// edit the topic gets, and records every tool call and every save the server makes
import type { ChatToolCall } from "@shared/payloads"
import { generateText, stepCountIs, type Tool } from "ai"
import type { ApiProvider, CallApiContextParams, ProviderResponse } from "promptfoo"
import {
	type ChatProposalResult,
	resolveChatProposal,
	toStandingChatProposal,
	toTopicEditSaves,
} from "../../api/chat/chatProposals"
import { toModelRoomQuestion } from "../../api/chat/roomQuestion"
import {
	type ChatTurnToolCalls,
	toChatTopicTools,
	toOpenNewTopicChatTool,
	toTopicEditPreviewTools,
} from "../../api/tool/chatTools"
import { CHAT_COST_PER_MILLION_TOKENS, tokenCost } from "../../worker/budget"
import { MAX_TURN_STEPS } from "../../worker/chat"
import { toConsentStep, toModelMessages } from "../../worker/chat/chatMessages"
import { buildTopicChatPrompt, toEditTopicBlock } from "../../worker/chat/chatPrompts"
import { webSearchTool } from "../../worker/chat/search"
import { chatModel } from "../../worker/models"
import { type RecordedToolCall, toRecordedToolCalls, toRecordingTools } from "../evalHarness"
import { toStepsText } from "../evalReplies"
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

// the topic page every solo case runs on
const EVAL_TOPIC_PAGE = { topicId: "eval-topic" }

// the variables that a case gives the chat turn
export type TopicChatToolsVariables = Pick<
	TopicChatToolsCase,
	"chatKind" | "history" | "question" | "chatContext" | "attachments"
>

// the JSON output of one chat turn. the reply, and every tool call and server save in order
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
	const { chatKind, history, question, chatContext = TOPIC_CHAT_CONTEXT, attachments = [] } = topicChatToolsVariables

	// a team room turn gets the room's saving tools with stand-ins for their database writes. a solo turn gets no
	// saving tool, the way the private chat binds them
	const toolCalls: ChatTurnToolCalls = { count: 0, topicSaves: [], topicSaveRejections: [] }
	const savingTools =
		chatKind === "team"
			? toSavingToolStandIns(toChatTopicTools({ userId: "eval-user", topicId: "eval-topic", toolCalls }))
			: undefined
	const { proposeTopicEditTool, cancelTopicEditTool } = toTopicEditPreviewTools({ toolCalls })

	// record every call the model makes
	const recordedToolCalls: RecordedToolCall[] = []
	const tools = toRecordingTools(recordedToolCalls, {
		searchWeb: webSearchTool({ count: 0 }),
		...(chatKind === "solo" ? { openNewTopicChat: toOpenNewTopicChatTool({ toolCalls }) } : {}),
		proposeTopicEdit: proposeTopicEditTool,
		cancelTopicEdit: cancelTopicEditTool,
		...savingTools,
	})

	// a solo turn first answers the proposal its last history turn left standing, through the real agreement check
	const chatProposalResult = chatKind === "solo" ? await resolveCaseProposal(history, question, toolCalls) : undefined
	const serverToolCalls = chatProposalResult?.serverToolCalls ?? []
	recordedToolCalls.push(...toRecordedToolCalls(serverToolCalls))

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

	// the room's block names the saving tools, and the private block names the preview tools and the proposal outcome
	const editTopicBlock = await toEditTopicBlock(
		chatKind === "team"
			? { tools: savingTools }
			: { proposeTopicEditTool, proposalOutcome: chatProposalResult?.proposalOutcome },
	)

	// write the turn, forcing a saving tool on a consent in the room the way a room turn does
	const chatPrompt = await buildTopicChatPrompt(chatContext, { editTopicBlock })
	const { steps, usage } = await generateText({
		model: chatModel(),
		system: chatPrompt.prompt,
		messages: toModelMessages(turnHistory, turnQuestion, attachments, serverToolCalls),
		tools,
		prepareStep: ({ stepNumber }) =>
			toConsentStep(stepNumber, { question: turnQuestion, history: turnHistory }, savingTools),
		stopWhen: stepCountIs(MAX_TURN_STEPS),
	})

	// return every step's text in order, the tool calls, and what the turn cost, the agreement check included
	const reply = toStepsText(steps)
	const topicChatToolsTurn: TopicChatToolsTurn = { reply, toolCalls: recordedToolCalls }
	const totalTokens = (usage.totalTokens ?? 0) + (chatProposalResult?.agreementTokens ?? 0)
	return { output: JSON.stringify(topicChatToolsTurn), cost: tokenCost(totalTokens, CHAT_COST_PER_MILLION_TOKENS) }
}

// resolve the proposal the solo history's last turn left standing, with the saving tools' stand-in text for the saves an
// agreed proposal makes
async function resolveCaseProposal(
	history: TopicChatToolsVariables["history"],
	question: string,
	toolCalls: ChatTurnToolCalls,
): Promise<ChatProposalResult | undefined> {
	// the preview the last turn left standing, if any
	const chatProposal = toStandingChatProposal({ page: EVAL_TOPIC_PAGE, chatToolCalls: history.at(-1)?.toolCalls ?? [] })
	if (chatProposal?.kind !== "topicEdit") {
		return undefined
	}

	// the real check, and stand-in saves in the order the server applies them
	return resolveChatProposal({
		page: EVAL_TOPIC_PAGE,
		chatProposal,
		question,
		toolCalls,
		applyProposal: async () =>
			toTopicEditSaves(chatProposal.topicEdit).map(
				(topicEditSave): ChatToolCall => ({
					...topicEditSave,
					output: SAVING_TOOL_OUTPUTS[topicEditSave.toolName]?.(topicEditSave.input) ?? "Saved.",
				}),
			),
	})
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
