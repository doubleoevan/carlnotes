// the team chat eval's promptfoo provider, which runs the reply writer under test

import { toEmptyChatTurnToolCalls, toOpenNewTopicChatTool } from "@carlnotes/api/tool/chatTools"
import { CHAT_COST_PER_MILLION_TOKENS, tokenCost } from "@carlnotes/models/budget"
import { chatModel } from "@carlnotes/models/models"
import { toModelMessages } from "@carlnotes/pipeline/chat/chatMessages"
import { buildTeamChatPrompt } from "@carlnotes/pipeline/chat/chatPrompts"
import { MAX_TURN_STEPS, toStepsText } from "@carlnotes/pipeline/chat/index"
import { webSearchTool } from "@carlnotes/pipeline/chat/search"
import { generateText, stepCountIs } from "ai"
import type { ApiProvider, CallApiContextParams, ProviderResponse } from "promptfoo"
import type { TeamChatCase } from "./teamChatCases"

// the variables that a case gives the reply writer. the question and the team material
export type TeamChatVariables = Pick<TeamChatCase, "question" | "teamChatContext">

// the reply writer under test. the writer's output is the reply that the team member reads
export const teamChatReplyWriter: ApiProvider = { id: () => "team-chat-reply-writer", callApi: writeCaseChatReply }

// write one case's reply from the system prompt, the messages, and the tools that a chat turn on a team's page sends
async function writeCaseChatReply(_renderedPrompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
	// read the case's variables
	const teamChatVariables = context?.vars as TeamChatVariables
	const { question, teamChatContext } = teamChatVariables

	// bind the search tool and the tool that opens the new-topic chat
	const toolCalls = toEmptyChatTurnToolCalls()
	const tools = { searchWeb: webSearchTool({ count: 0 }), openNewTopicChat: toOpenNewTopicChatTool({ toolCalls }) }

	// write the reply over the team chat prompt
	const chatPrompt = await buildTeamChatPrompt(teamChatContext)
	const { steps, usage } = await generateText({
		model: chatModel(),
		system: chatPrompt.prompt,
		messages: toModelMessages([], question),
		tools,
		stopWhen: stepCountIs(MAX_TURN_STEPS),
	})

	// return every step's text in order, and what the reply cost
	const replyText = toStepsText(steps)
	return { output: replyText, cost: tokenCost(usage.totalTokens ?? 0, CHAT_COST_PER_MILLION_TOKENS) }
}
