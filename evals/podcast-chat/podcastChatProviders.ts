// the podcast chat eval's promptfoo provider, which runs the podcast reply under test and returns its answer, with
// the answer's speaker in the response's metadata
import type { ApiProvider, CallApiContextParams, ProviderResponse } from "promptfoo"
import { CHAT_COST_PER_MILLION_TOKENS, tokenCost } from "../../worker/budget"
import { toModelMessages } from "../../worker/chat/chatMessages"
import { buildTopicChatPrompt } from "../../worker/chat/chatPrompts"
import { streamPodcastReply } from "../../worker/chat/podcastReply"
import { chatModel } from "../../worker/models"
import { TOPIC_CHAT_CONTEXT } from "../topic-chat/topicChatCases"
import type { PodcastChatCase } from "./podcastChatCases"

// the variables that a case gives the reply writer. the question and the chapter it was asked during
export type PodcastChatVariables = Pick<PodcastChatCase, "question" | "podcastEpisodeChapter">

// the reply writer under test
export const podcastChatReplyWriter: ApiProvider = {
	id: () => "podcast-chat-reply-writer",
	callApi: writeCasePodcastReply,
}

// write one case's reply over the topic chat prompt with the chapter and the spoken fragment, through the podcast
// reply's own structured stream
async function writeCasePodcastReply(
	_renderedPrompt: string,
	context?: CallApiContextParams,
): Promise<ProviderResponse> {
	// read the case's variables, and build the prompt a podcast chat turn sends
	const podcastChatVariables = context?.vars as PodcastChatVariables
	const { question, podcastEpisodeChapter } = podcastChatVariables
	const chatPrompt = await buildTopicChatPrompt(TOPIC_CHAT_CONTEXT, { isSpoken: true, podcastEpisodeChapter })
	const podcastReply = streamPodcastReply({
		model: chatModel(),
		system: chatPrompt.prompt,
		messages: toModelMessages([], question),
		telemetryOptions: {},
	})

	// read every part so the completion resolves
	for await (const _replyPart of podcastReply.replyParts) {
	}

	// return the answer, its speaker, and what the turn cost
	const { text, speaker, totalTokens } = await podcastReply.completion
	return { output: text, metadata: { speaker }, cost: tokenCost(totalTokens, CHAT_COST_PER_MILLION_TOKENS) }
}
