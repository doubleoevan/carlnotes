// the topic chat tools eval's promptfoo provider, which runs the chat turn writer with the tools that a user who may
// edit the topic gets, and records every tool call and every save the server makes
import { toWordsWithoutModelMention } from "@shared/chatMentions"
import type { ChatToolCall } from "@shared/payloads"
import { generateText, stepCountIs } from "ai"
import type { ApiProvider, CallApiContextParams, ProviderResponse } from "promptfoo"
import {
	type ChatProposalResult,
	resolveChatProposal,
	toStandingChatProposal,
	toTopicEditSaves,
} from "../../api/chat/chatProposals"
import {
	type ChatRoomTranscriptMessage,
	EMPTY_CHAT_ROOM_ATTACHMENTS_BLOCK,
	EMPTY_CHAT_ROOM_SUMMARY,
	toChatRoomTranscriptLine,
	toModelRoomQuestion,
} from "../../api/chat/roomQuestion"
import {
	type ChatTurnToolCalls,
	toAddTopicSourceText,
	toEmptyChatTurnToolCalls,
	toOpenNewTopicChatTool,
	toRemovedTopicSourceText,
	toSavedTopicFieldsText,
	toSavedTopicPromptText,
	toTopicEditPreviewTools,
} from "../../api/tool/chatTools"
import { CHAT_COST_PER_MILLION_TOKENS, tokenCost } from "../../worker/budget"
import { MAX_TURN_STEPS, toStepsText } from "../../worker/chat"
import { toModelMessages } from "../../worker/chat/chatMessages"
import { buildTopicChatPrompt, toEditTopicBlock } from "../../worker/chat/chatPrompts"
import { webSearchTool } from "../../worker/chat/search"
import { chatModel } from "../../worker/models"
import { type RecordedToolCall, toRecordedToolCalls, toRecordingTools } from "../evalHarness"
import { BURRNOTES_TOPIC_SOURCE_LABEL, TOPIC_CHAT_CONTEXT } from "../topic-chat/topicChatCases"
import type { TopicChatToolsCase } from "./topicChatToolsCases"

// the output each stand-in save records for its saving tool, the real tool's text for a save that went through. the
// only source a case removes is the burrnotes feed
const SAVING_TOOL_OUTPUTS: Record<string, (input: Record<string, unknown>) => string> = {
	updateTopicPrompt: () => toSavedTopicPromptText(TOPIC_CHAT_CONTEXT.topicName),
	updateTopicFields: () => toSavedTopicFieldsText(TOPIC_CHAT_CONTEXT.topicName),
	addSource: (input) =>
		toAddTopicSourceText({
			status: "saved",
			topicSourceId: "eval-topic-source",
			topicSourceLabel: String(input.value),
			topicSourceCostDelta: { perScanCents: 2, perMonthCents: 9 },
		}),
	removeSource: () => toRemovedTopicSourceText(BURRNOTES_TOPIC_SOURCE_LABEL),
}

// the topic page every case runs on
const EVAL_TOPIC_PAGE = { topicId: "eval-topic" }

// the variables that a case gives the chat turn
export type TopicChatToolsVariables = Pick<
	TopicChatToolsCase,
	"chatKind" | "history" | "question" | "roomMessages" | "chatContext" | "attachments" | "roomProposal"
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
	const {
		chatKind,
		history,
		question = "",
		roomMessages = [],
		chatContext = TOPIC_CHAT_CONTEXT,
		attachments = [],
		roomProposal,
	} = topicChatToolsVariables

	// every turn gets the preview tools and no saving tool, in the solo chat and the team room alike
	const toolCalls = toEmptyChatTurnToolCalls()
	const { proposeTopicEditTool, cancelTopicEditTool } = toTopicEditPreviewTools({ toolCalls })

	// record every call the model makes
	const recordedToolCalls: RecordedToolCall[] = []
	const tools = toRecordingTools(recordedToolCalls, {
		searchWeb: webSearchTool({ count: 0 }),
		...(chatKind === "solo" ? { openNewTopicChat: toOpenNewTopicChatTool({ toolCalls }) } : {}),
		proposeTopicEdit: proposeTopicEditTool,
		cancelTopicEdit: cancelTopicEditTool,
	})

	// answer the proposal left standing first, through the real agreement check. a solo turn checks the history's last
	// turn, and a team room turn checks the room preview shown to the member who wrote the room's last chat message
	const chatProposalResult =
		chatKind === "solo"
			? await resolveCaseProposal(history.at(-1)?.toolCalls ?? [], question, toolCalls)
			: await resolveRoomCaseProposal(roomProposal, roomMessages.at(-1), toolCalls)
	const serverToolCalls = chatProposalResult?.serverToolCalls ?? []
	recordedToolCalls.push(...toRecordedToolCalls(serverToolCalls))

	// the solo chat sends the history as messages. the team room sends a question written from the room's transcript,
	// with no history, the way a new room with no summary and no shared files sends it
	const turnQuestion =
		chatKind === "team"
			? await toModelRoomQuestion({
					summary: EMPTY_CHAT_ROOM_SUMMARY,
					chatRoomAttachmentsBlock: EMPTY_CHAT_ROOM_ATTACHMENTS_BLOCK,
					chatMessages: roomMessages.map(toChatRoomTranscriptLine).join("\n"),
				})
			: question
	const turnHistory = chatKind === "team" ? [] : history

	// the edit block names the preview tools and the proposal outcome
	const editTopicBlock = await toEditTopicBlock({
		proposeTopicEditTool,
		proposalOutcome: chatProposalResult?.proposalOutcome,
	})

	// write the turn
	const chatPrompt = await buildTopicChatPrompt(chatContext, { editTopicBlock })
	const { steps, usage } = await generateText({
		model: chatModel(),
		system: chatPrompt.prompt,
		messages: toModelMessages(turnHistory, turnQuestion, attachments, serverToolCalls),
		tools,
		stopWhen: stepCountIs(MAX_TURN_STEPS),
	})

	// return every step's text in order, the tool calls, and what the turn cost, the agreement check included
	const reply = toStepsText(steps)
	const topicChatToolsTurn: TopicChatToolsTurn = { reply, toolCalls: recordedToolCalls }
	const totalTokens = (usage.totalTokens ?? 0) + (chatProposalResult?.agreementTokens ?? 0)
	return { output: JSON.stringify(topicChatToolsTurn), cost: tokenCost(totalTokens, CHAT_COST_PER_MILLION_TOKENS) }
}

// resolve the room preview over the words of the room's last chat message without the carl mention, the way a room
// turn does. only the member the preview was shown to can agree to it
async function resolveRoomCaseProposal(
	roomProposal: TopicChatToolsVariables["roomProposal"],
	lastRoomMessage: ChatRoomTranscriptMessage | undefined,
	toolCalls: ChatTurnToolCalls,
): Promise<ChatProposalResult | undefined> {
	if (!roomProposal || !lastRoomMessage || lastRoomMessage.authorUsername !== roomProposal.proposedToUsername) {
		return undefined
	}
	return resolveCaseProposal(roomProposal.chatToolCalls, toWordsWithoutModelMention(lastRoomMessage.content), toolCalls)
}

// resolve the proposal a turn's tool calls left standing, with the saving tools' stand-in text for the saves an agreed
// proposal makes
async function resolveCaseProposal(
	chatToolCalls: ChatToolCall[],
	question: string,
	toolCalls: ChatTurnToolCalls,
): Promise<ChatProposalResult | undefined> {
	// the preview the turn left standing, if any
	const chatProposal = toStandingChatProposal({ page: EVAL_TOPIC_PAGE, chatToolCalls })
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
