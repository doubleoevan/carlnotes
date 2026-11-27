// the suggested reply: the one short line the user is most likely to send carl next. one cheap call after carl's reply
// ends writes it, and any failure leaves none

import type { ChatHistoryTurn } from "@carlnotes/contracts/payloads"
import { toSafeSuggestedReply } from "@carlnotes/contracts/suggestedReplies"
import type { TopicDraft } from "@carlnotes/contracts/topicPayloads"
import { CHAT_COST_PER_MILLION_TOKENS, toEstimatedTokens, tokenCost } from "@carlnotes/models/budget"
import { cheapModel, isBudgetRejection } from "@carlnotes/models/models"
import { type BuiltPrompt, fetchPromptTemplate, promptTelemetry } from "@carlnotes/models/prompts/fetch"
import { writePrompt } from "@carlnotes/models/prompts/write"
import { reportError, toLoggableError } from "@carlnotes/server/monitoring"
import { generateText, Output } from "ai"
import { z } from "zod"
import { toTopicDraftBlock } from "./chatPrompts"

// how many of the latest chat turns the call reads, this turn included
const SUGGESTED_REPLY_TURN_COUNT = 3

// how much of each question, of each answer, and of the topic draft the call reads. an answer keeps its end, where
// carl's question is
const QUESTION_CHARS = 500
const ANSWER_CHARS = 1500
const TOPIC_DRAFT_CHARS = 2000

// the template's own characters, with room for its fences
const SUGGESTED_REPLY_TEMPLATE_CHARS = 4000

// the largest prompt the call sends, in characters, and the most tokens it writes: one short line inside its schema
const MAX_SUGGESTED_REPLY_PROMPT_CHARS =
	SUGGESTED_REPLY_TEMPLATE_CHARS + SUGGESTED_REPLY_TURN_COUNT * (QUESTION_CHARS + ANSWER_CHARS) + TOPIC_DRAFT_CHARS
const MAX_SUGGESTED_REPLY_OUTPUT_TOKENS = 60

/**
 * The call's largest cost at the chat rate, which it reserves against the user's budget before it runs.
 */
export const MAX_SUGGESTED_REPLY_DOLLARS = tokenCost(
	toEstimatedTokens(MAX_SUGGESTED_REPLY_PROMPT_CHARS) + MAX_SUGGESTED_REPLY_OUTPUT_TOKENS,
	CHAT_COST_PER_MILLION_TOKENS,
)

// how long the call may take before the turn ends with no suggestion
const SUGGESTED_REPLY_TIMEOUT_MS = 2000

// the one line the call returns through its schema, or null for none
const suggestedReplyOutput = Output.object({ schema: z.object({ suggestedReply: z.string().nullable() }) })

// the call's settings beside its prompt
type SuggestedReplyCallSettings = {
	output: typeof suggestedReplyOutput
	maxOutputTokens: number
	maxRetries: number
	abortSignal: AbortSignal
}

// one chat turn as the call reads it: the user's question and carl's answer
export type SuggestedReplyChatTurn = Pick<ChatHistoryTurn, "question" | "answer">

// the latest chat turns, oldest first and this turn last, the new-topic chat's draft, the key the call bills, and the
// request's abort signal, which stops the call
export type WriteSuggestedReplyOptions = {
	chatTurns: SuggestedReplyChatTurn[]
	topicDraft?: TopicDraft
	litellmApiKey: string
	requestAbortSignal?: AbortSignal
}

/**
 * Returns the call's settings beside its prompt: its output schema, its output limit, no retry, and the signal that
 * ends it, its time limit unless the caller started one earlier.
 */
export function toSuggestedReplyCallSettings(
	abortSignal = AbortSignal.timeout(SUGGESTED_REPLY_TIMEOUT_MS),
): SuggestedReplyCallSettings {
	return {
		output: suggestedReplyOutput,
		maxOutputTokens: MAX_SUGGESTED_REPLY_OUTPUT_TOKENS,
		// one try fits the limit, and a retry after a spent budget only spends the wait
		maxRetries: 0,
		abortSignal,
	}
}

// the suggestion, or null for none, and the tokens the call spent
export type SuggestedReplyResult = { suggestedReply: string | null; totalTokens: number }

/**
 * Writes the user's likely next message to carl, or none. A call that fails, times out, or runs into a spent budget
 * returns none, and only a failure other than a spent budget is reported.
 */
export async function writeSuggestedReply({
	chatTurns,
	topicDraft,
	litellmApiKey,
	requestAbortSignal,
}: WriteSuggestedReplyOptions): Promise<SuggestedReplyResult> {
	// the time limit starts before the prompt loads, so a slow registry read counts against it, and the request's abort
	// ends the call too
	const timeLimit = AbortSignal.timeout(SUGGESTED_REPLY_TIMEOUT_MS)
	const abortSignal = requestAbortSignal ? AbortSignal.any([timeLimit, requestAbortSignal]) : timeLimit

	// one cheap call that returns the line through the schema, then the code's own filter
	try {
		const suggestedReplyPrompt = await buildSuggestedReplyPrompt({ chatTurns, topicDraft })
		const { output, usage } = await generateText({
			model: cheapModel(litellmApiKey),
			prompt: suggestedReplyPrompt.prompt,
			...toSuggestedReplyCallSettings(abortSignal),
			...promptTelemetry(suggestedReplyPrompt),
		})
		return { suggestedReply: toSafeSuggestedReply(output.suggestedReply), totalTokens: usage.totalTokens ?? 0 }
	} catch (error) {
		// a spent budget and an aborted request are an ordinary none, and any other failure is reported
		if (!isBudgetRejection(error) && !requestAbortSignal?.aborted) {
			console.error("the suggested reply failed", toLoggableError(error))
			reportError(error, "chat")
		}
		return { suggestedReply: null, totalTokens: 0 }
	}
}

/**
 * Builds the suggestion's prompt from 'suggest-reply.md', with the latest chat turns and the topic draft fenced as
 * data, each cut to its size.
 */
export async function buildSuggestedReplyPrompt({
	chatTurns,
	topicDraft,
}: Omit<WriteSuggestedReplyOptions, "litellmApiKey">): Promise<BuiltPrompt> {
	// the latest turns as labeled lines, each question kept to its start and each answer kept to its end
	const conversation = chatTurns
		.slice(-SUGGESTED_REPLY_TURN_COUNT)
		.map(
			(chatTurn) =>
				`Reader: ${chatTurn.question.slice(0, QUESTION_CHARS)}\nCarl: ${chatTurn.answer.slice(-ANSWER_CHARS)}`,
		)
		.join("\n\n")

	// write the template with both inputs fenced
	const { template, name, registryPrompt } = await fetchPromptTemplate("suggest-reply")
	const prompt = writePrompt(template, {
		conversation,
		topicDraft: topicDraft ? toTopicDraftBlock(topicDraft).slice(0, TOPIC_DRAFT_CHARS) : "No topic draft.",
	})
	return { prompt, name, registryPrompt }
}
