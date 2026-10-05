// the topic chat eval's promptfoo provider, the reply writer under test.
// the writer calls the LiteLLM proxy through worker/models.ts
import { generateText, stepCountIs } from "ai"
import type { ApiProvider, CallApiContextParams, ProviderResponse } from "promptfoo"
import { CHAT_COST_PER_MILLION_TOKENS, tokenCost } from "../../worker/budget"
import { buildTopicChatPrompt, MAX_TURN_STEPS, toModelMessages } from "../../worker/chat"
import { webSearchTool } from "../../worker/chat/search"
import { chatModel } from "../../worker/models"
import { toStepsText } from "../evalHarness"
import type { TopicChatCase } from "./topicChatCases"

// the variables that a case gives the reply writer. the question and the topic material
export type TopicChatVariables = Pick<TopicChatCase, "question" | "chatContext">

// the reply writer under test. the writer's output is the reply that the user reads
export const topicChatReplyWriter: ApiProvider = { id: () => "topic-chat-reply-writer", callApi: writeCaseChatReply }

// write one case's reply from the system prompt, the messages, and the search tool that a chat turn sends
async function writeCaseChatReply(_renderedPrompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
	// read the case's variables
	const topicChatVariables = context?.vars as TopicChatVariables
	const { question, chatContext } = topicChatVariables

	// write the reply over the topic chat prompt
	const chatPrompt = await buildTopicChatPrompt(chatContext)
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
