// the suggested reply eval's promptfoo provider: the real prompt and call settings, returning the model's own line before
// the code's filter

import { CHAT_COST_PER_MILLION_TOKENS, tokenCost } from "@carlnotes/models/budget"
import { cheapModel } from "@carlnotes/models/models"
import { buildSuggestedReplyPrompt, toSuggestedReplyCallSettings } from "@carlnotes/pipeline/chat/suggestedReply"
import { generateText } from "ai"
import type { ApiProvider, CallApiContextParams, ProviderResponse } from "promptfoo"
import type { SuggestedReplyCase } from "./suggestedReplyCases"

// the variables a case gives the call
type SuggestedReplyVariables = Pick<SuggestedReplyCase, "chatTurns" | "topicDraft">

/**
 * The text the output holds for a call that returned null.
 */
export const NULL_SUGGESTED_REPLY = "null"

// the suggestion writer under test
export const suggestedReplyWriter: ApiProvider = {
	id: () => "suggested-reply-writer",
	callApi: writeCaseSuggestedReply,
}

// write one case's suggestion with the prompt and the settings the app sends, the line as the model wrote it
async function writeCaseSuggestedReply(
	_renderedPrompt: string,
	context?: CallApiContextParams,
): Promise<ProviderResponse> {
	const { chatTurns, topicDraft } = (context?.vars ?? { chatTurns: [] }) as SuggestedReplyVariables
	const suggestedReplyPrompt = await buildSuggestedReplyPrompt({ chatTurns, topicDraft })
	const { output, usage } = await generateText({
		model: cheapModel(),
		prompt: suggestedReplyPrompt.prompt,
		...toSuggestedReplyCallSettings(),
	})
	return {
		output: output.suggestedReply ?? NULL_SUGGESTED_REPLY,
		cost: tokenCost(usage.totalTokens ?? 0, CHAT_COST_PER_MILLION_TOKENS),
	}
}
