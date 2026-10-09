// the new-topic chat eval's promptfoo provider, which runs the chat turn writer with the new-topic chat's tools
// and records every tool call
import { generateText, stepCountIs, type Tool } from "ai"
import type { ApiProvider, CallApiContextParams, ProviderResponse } from "promptfoo"
import {
	toCreateTopicText,
	toNewTopicChatTools,
	toSuggestionsText,
	toSuggestTopicSourcesTool,
} from "../../api/tool/chatTools"
import { CHAT_COST_PER_MILLION_TOKENS, tokenCost } from "../../worker/budget"
import { buildNewTopicChatPrompt, MAX_TURN_STEPS, toConsentStep, toModelMessages } from "../../worker/chat"
import { webSearchTool } from "../../worker/chat/search"
import { chatModel } from "../../worker/models"
import { type RecordedToolCall, toRecordingTools } from "../evalHarness"
import { toStepsText } from "../evalReplies"
import { LEADER_TEAMS, type NewTopicChatCase, SUGGESTED_TOPIC_SOURCES } from "./newTopicChatCases"

// how many more topics the plan lets the user hold
const TOPICS_REMAINING = 3

// what the new-topic chat's tools are bound to
type NewTopicToolBinding = Parameters<typeof toNewTopicChatTools>[0]

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
		toolCalls: { count: 0, topicSaves: [], topicSaveRejections: [] },
		topicDraft,
		analyticsProperties: {
			entryPoint: "web",
			plan: "free",
			platform: "desktop",
			browserPlatform: "other",
			isInAppBrowser: false,
		},
	}

	// build the tools, recording every call that the turn makes
	const recordedToolCalls: RecordedToolCall[] = []
	const savingTools = toSavingTools(newTopicToolBinding)
	const tools = toRecordingTools(recordedToolCalls, {
		searchWeb: webSearchTool({ count: 0 }),
		suggestSources: toSuggestSourcesStandIn(newTopicToolBinding),
		...savingTools,
	})

	// write the turn, forcing a saving tool on a consent the way a chat turn does
	const chatPrompt = await buildNewTopicChatPrompt("", topicDraft, TOPICS_REMAINING, LEADER_TEAMS)
	const { steps, usage } = await generateText({
		model: chatModel(),
		system: chatPrompt.prompt,
		messages: toModelMessages(history, question),
		tools,
		prepareStep: ({ stepNumber }) => toConsentStep(stepNumber, { question, history }, savingTools),
		stopWhen: stepCountIs(MAX_TURN_STEPS),
	})

	// return every step's text in order, the tool calls, the draft after the turn, and what the turn cost
	const reply = toStepsText(steps)
	const newTopicChatTurn: NewTopicChatTurn = { reply, toolCalls: recordedToolCalls, topicDraft }
	return {
		output: JSON.stringify(newTopicChatTurn),
		cost: tokenCost(usage.totalTokens ?? 0, CHAT_COST_PER_MILLION_TOKENS),
	}
}

// the real draftTopic tool, which writes only into the bound draft,
// and createTopic with its real description and schema but a stand-in for the database write
function toSavingTools(newTopicToolBinding: NewTopicToolBinding): Record<string, Tool> {
	const { draftTopic, createTopic } = toNewTopicChatTools(newTopicToolBinding)
	return {
		draftTopic: draftTopic as Tool,
		createTopic: {
			...(createTopic as Tool),
			execute: async () =>
				toCreateTopicText({
					status: "created",
					topicId: "eval-topic",
					name: newTopicToolBinding.topicDraft.name,
					teamName: null,
					addTeamRejection: null,
				}),
		},
	}
}

// suggestSources with its real description and schema, returning SUGGESTED_TOPIC_SOURCES instead of searching
function toSuggestSourcesStandIn(newTopicToolBinding: NewTopicToolBinding): Tool {
	const suggestSourcesTool = toSuggestTopicSourcesTool(newTopicToolBinding)
	return {
		...suggestSourcesTool,
		execute: async () => toSuggestionsText({ status: "ok", sources: SUGGESTED_TOPIC_SOURCES }),
	}
}
