// the Topic Post chat eval's promptfoo provider, which runs the topic chat's reply under test on a question asked
// from a Topic Post's page

import { CHAT_COST_PER_MILLION_TOKENS, tokenCost } from "@carlnotes/models/budget"
import { chatModel } from "@carlnotes/models/models"
import { toModelMessages } from "@carlnotes/pipeline/chat/chatMessages"
import { buildTopicChatPrompt } from "@carlnotes/pipeline/chat/chatPrompts"
import { generateText } from "ai"
import type { ApiProvider, CallApiContextParams, ProviderResponse } from "promptfoo"
import { TOPIC_CHAT_CONTEXT } from "../topic-chat/topicChatCases"
import type { TopicPostChatCase } from "./topicPostChatCases"

// the variables that a case gives the reply writer. the question and the post it was asked about
type TopicPostChatVariables = Pick<TopicPostChatCase, "question" | "topicPost">

// the reply writer under test
export const topicPostChatReplyWriter: ApiProvider = {
	id: () => "topic-post-chat-reply-writer",
	callApi: writeCaseTopicPostReply,
}

// write one case's reply over the topic chat prompt with the post and its fragment, with no tool, as the app's own
// turn has no topic tool
async function writeCaseTopicPostReply(
	_renderedPrompt: string,
	context?: CallApiContextParams,
): Promise<ProviderResponse> {
	const topicPostChatVariables = context?.vars as TopicPostChatVariables
	const { question, topicPost } = topicPostChatVariables
	const chatPrompt = await buildTopicChatPrompt(TOPIC_CHAT_CONTEXT, { topicPost })
	const { text, usage } = await generateText({
		model: chatModel(),
		system: chatPrompt.prompt,
		messages: toModelMessages([], question),
	})
	return { output: text, cost: tokenCost(usage.totalTokens ?? 0, CHAT_COST_PER_MILLION_TOKENS) }
}
