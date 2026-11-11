// a published Topic Post's summary, written from its title and text for its info popup and its page's description
import { toHtmlText, toOneLineText } from "@carlnotes/contracts/text"
import { TOPIC_POST_SUMMARY_MAX_CHARS } from "@carlnotes/contracts/topicPosts"
import { CHEAP_COST_PER_MILLION_TOKENS, tokenCost } from "@carlnotes/models/budget"
import { cheapModel } from "@carlnotes/models/models"
import { type BuiltPrompt, fetchPromptTemplate, promptTelemetry } from "@carlnotes/models/prompts/fetch"
import { writePrompt } from "@carlnotes/models/prompts/write"
import { generateText } from "ai"

// how much of a post's text one summary reads, which bounds what the call can cost
const MAX_SUMMARY_POST_CHARS = 12_000

// the summary is two sentences at most, with room to spare
const MAX_SUMMARY_OUTPUT_TOKENS = 400

// how long the summary's model call may take before it aborts
const SUMMARY_TIMEOUT_MS = 30_000

// what a summary is written from: the post's title and its stored body
type TopicPostSummaryInput = { title: string; html: string }

/**
 * Builds the summary prompt, with the post's title and text fenced as untrusted and the text limited in length.
 */
export async function buildTopicPostSummaryPrompt({ title, html }: TopicPostSummaryInput): Promise<BuiltPrompt> {
	const { template, registryPrompt } = await fetchPromptTemplate("summarize-topic-post")
	const prompt = writePrompt(
		template,
		{ title: toOneLineText(title), post: toHtmlText(html).slice(0, MAX_SUMMARY_POST_CHARS) },
		{ maxChars: String(TOPIC_POST_SUMMARY_MAX_CHARS) },
	)
	return { prompt, name: "summarize-topic-post", registryPrompt }
}

/**
 * Writes one Topic Post's summary within the summary limit, billed to the given key. Returns the summary with what
 * the call cost. Throws an error on an empty result.
 */
export async function summarizeTopicPost({
	litellmApiKey,
	...input
}: TopicPostSummaryInput & { litellmApiKey?: string }): Promise<{ summary: string; costDollars: number }> {
	const summaryPrompt = await buildTopicPostSummaryPrompt(input)
	const { text, usage } = await generateText({
		model: cheapModel(litellmApiKey),
		prompt: summaryPrompt.prompt,
		maxOutputTokens: MAX_SUMMARY_OUTPUT_TOKENS,
		abortSignal: AbortSignal.timeout(SUMMARY_TIMEOUT_MS),
		...promptTelemetry(summaryPrompt),
	})

	// an empty summary is a failed call, and a long one is cut at the limit
	const summary = toOneLineText(text).slice(0, TOPIC_POST_SUMMARY_MAX_CHARS)
	if (!summary) {
		throw new Error("Empty topic post summary")
	}
	return { summary, costDollars: tokenCost(usage.totalTokens ?? 0, CHEAP_COST_PER_MILLION_TOKENS) }
}
