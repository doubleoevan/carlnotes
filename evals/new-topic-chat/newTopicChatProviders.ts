// the new-topic chat eval's promptfoo provider, which runs the chat turn writer with the new-topic chat's tools, creates
// the topic through the real agreement check if the last turn proposed it, and records every tool call and the create
import { generateText, stepCountIs, type Tool } from "ai"
import type { ApiProvider, CallApiContextParams, ProviderResponse } from "promptfoo"
import { TEST_ANALYTICS_PROPERTIES } from "../../api/analyticsTestFixtures"
import { type ChatProposalResult, resolveChatProposal, toStandingChatProposal } from "../../api/chat/chatProposals"
import { toEmptyChatTurnToolCalls } from "../../api/tool/chatTools"
import {
	toCreateTopicText,
	toNewTopicChatTools,
	toProposeNewTopicTool,
	toSuggestionsText,
	toSuggestTopicSourcesTool,
} from "../../api/tool/newTopicChatTools"
import { CHAT_COST_PER_MILLION_TOKENS, tokenCost } from "../../worker/budget"
import { MAX_TURN_STEPS, toStepsText } from "../../worker/chat"
import { toModelMessages } from "../../worker/chat/chatMessages"
import { buildNewTopicChatPrompt } from "../../worker/chat/chatPrompts"
import { webSearchTool } from "../../worker/chat/search"
import { chatModel } from "../../worker/models"
import { type RecordedToolCall, toRecordedToolCalls, toRecordingTools } from "../evalHarness"
import { LEADER_TEAMS, type NewTopicChatCase, SUGGESTED_TOPIC_SOURCES } from "./newTopicChatCases"

// how many more topics the plan lets the user hold
const TOPICS_REMAINING = 3

// what the new-topic chat's tools are bound to
type NewTopicToolBinding = Parameters<typeof toNewTopicChatTools>[0]

// the new-topic chat page every case runs on
const EVAL_NEW_TOPIC_PAGE = { newTopic: true } as const

// the variables that a case gives the chat turn
export type NewTopicChatVariables = Pick<NewTopicChatCase, "history" | "topicDraft" | "question">

// the JSON output of one chat turn. the reply, every tool call in order, and the draft after the turn
export type NewTopicChatTurn = {
	reply: string
	toolCalls: RecordedToolCall[]
	topicDraft: NewTopicChatCase["topicDraft"]
}

// the chat turn writer under test
export const newTopicChatTurnWriter: ApiProvider = {
	id: () => "new-topic-chat-turn-writer",
	callApi: writeCaseChatTurn,
}

// write one case's chat turn with the system prompt, the messages, and the tools that the new-topic chat sends
async function writeCaseChatTurn(_renderedPrompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
	// read the case's variables, and copy the draft that the draftTopic tool writes into
	const newTopicChatVariables = context?.vars as NewTopicChatVariables
	const { history, question } = newTopicChatVariables
	const topicDraft = { ...newTopicChatVariables.topicDraft }

	// bind the tools to the copied draft, as a chat turn binds the tools to the user's topic draft
	const newTopicToolBinding: NewTopicToolBinding = {
		userId: "eval-user",
		toolCalls: toEmptyChatTurnToolCalls(),
		topicDraft,
		analyticsProperties: TEST_ANALYTICS_PROPERTIES,
	}

	// build the tools the new-topic chat binds, recording every call that the turn makes
	const recordedToolCalls: RecordedToolCall[] = []
	const tools = toRecordingTools(recordedToolCalls, {
		searchWeb: webSearchTool({ count: 0 }),
		suggestSources: toSuggestSourcesStandIn(newTopicToolBinding),
		proposeNewTopic: toProposeNewTopicTool(),
		...toNewTopicChatTools(newTopicToolBinding),
	})

	// answer the proposal the last turn left standing, recording a create as a createTopic call
	const chatProposalResult = await resolveCaseProposal(newTopicToolBinding, history, question)
	const serverToolCalls = chatProposalResult?.serverToolCalls ?? []
	recordedToolCalls.push(...toRecordedToolCalls(serverToolCalls))

	// write the turn after any create the server made
	const chatPrompt = await buildNewTopicChatPrompt("", topicDraft, TOPICS_REMAINING, LEADER_TEAMS, {
		proposalOutcome: chatProposalResult?.proposalOutcome,
	})
	const { steps, usage } = await generateText({
		model: chatModel(),
		system: chatPrompt.prompt,
		messages: toModelMessages(history, question, [], serverToolCalls),
		tools,
		stopWhen: stepCountIs(MAX_TURN_STEPS),
	})

	// return every step's text in order, the tool calls, the draft after the turn, and what the turn cost, the
	// agreement check included
	const reply = toStepsText(steps)
	const newTopicChatTurn: NewTopicChatTurn = { reply, toolCalls: recordedToolCalls, topicDraft }
	const totalTokens = (usage.totalTokens ?? 0) + (chatProposalResult?.agreementTokens ?? 0)
	return { output: JSON.stringify(newTopicChatTurn), cost: tokenCost(totalTokens, CHAT_COST_PER_MILLION_TOKENS) }
}

// resolve the new topic the last history turn proposed, through the real agreement check, with a stand-in for the
// create's database write. undefined if no proposal stands
async function resolveCaseProposal(
	newTopicToolBinding: NewTopicToolBinding,
	history: NewTopicChatVariables["history"],
	question: string,
): Promise<ChatProposalResult | undefined> {
	// the draft the last turn proposed, if it called proposeNewTopic
	const chatProposal = toStandingChatProposal({
		page: EVAL_NEW_TOPIC_PAGE,
		chatToolCalls: history.at(-1)?.toolCalls ?? [],
		topicDraft: newTopicToolBinding.topicDraft,
	})
	if (!chatProposal) {
		return undefined
	}

	// the real check over the case's question, and a create that writes nothing
	return resolveChatProposal({
		page: EVAL_NEW_TOPIC_PAGE,
		chatProposal,
		question,
		toolCalls: newTopicToolBinding.toolCalls,
		applyProposal: async () => [
			{
				toolName: "createTopic",
				input: {},
				output: toCreateTopicText({
					status: "created",
					topicId: "eval-topic",
					name: newTopicToolBinding.topicDraft.name,
					teamName: null,
					addTeamRejection: null,
				}),
			},
		],
	})
}

// suggestSources with its real description and schema, returning SUGGESTED_TOPIC_SOURCES instead of searching
function toSuggestSourcesStandIn(newTopicToolBinding: NewTopicToolBinding): Tool {
	const suggestSourcesTool = toSuggestTopicSourcesTool(newTopicToolBinding)
	return {
		...suggestSourcesTool,
		execute: async () => toSuggestionsText({ status: "ok", sources: SUGGESTED_TOPIC_SOURCES }),
	}
}
