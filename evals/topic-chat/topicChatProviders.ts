// the topic chat eval's promptfoo provider, which runs the reply writer under test

import { CHAT_COST_PER_MILLION_TOKENS, tokenCost } from "@carlnotes/models/budget"
import { chatModel } from "@carlnotes/models/models"
import { toModelMessages } from "@carlnotes/pipeline/chat/chatMessages"
import { buildTopicChatPrompt } from "@carlnotes/pipeline/chat/chatPrompts"
import { MAX_TURN_STEPS, toStepsText } from "@carlnotes/pipeline/chat/index"
import { webSearchTool } from "@carlnotes/pipeline/chat/search"
import { generateText, stepCountIs } from "ai"
import type { ApiProvider, CallApiContextParams, ProviderResponse } from "promptfoo"
import type { TopicChatCase } from "./topicChatCases"

// the variables that a case gives the reply writer. the question, the topic material, and whether the question was
// spoken
export type TopicChatVariables = Pick<TopicChatCase, "question" | "chatContext" | "isSpoken">

// the reply writer under test. the writer's output is the reply that the user reads
export const topicChatReplyWriter: ApiProvider = { id: () => "topic-chat-reply-writer", callApi: writeCaseChatReply }

// write one case's reply from the system prompt, the messages, and the search tool that a chat turn sends
async function writeCaseChatReply(_renderedPrompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
	// read the case's variables
	const topicChatVariables = context?.vars as TopicChatVariables
	const { question, chatContext, isSpoken = false } = topicChatVariables

	// write the reply over the topic chat prompt, with the spoken fragment spliced on a spoken question
	const chatPrompt = await buildTopicChatPrompt(chatContext, { isSpoken })
	const { steps, usage } = await generateText({
		model: chatModel(),
		system: chatPrompt.prompt,
		messages: toModelMessages([], question),
		tools: { searchWeb: webSearchTool({ count: 0 }) },
		stopWhen: stepCountIs(MAX_TURN_STEPS),
	})

	// return every step's text in order, and what the reply cost
	const replyText = toStepsText(steps)
	return { output: replyText, cost: tokenCost(usage.totalTokens ?? 0, CHAT_COST_PER_MILLION_TOKENS) }
}
