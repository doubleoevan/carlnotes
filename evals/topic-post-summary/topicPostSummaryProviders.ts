// the Topic Post summary eval's promptfoo provider, which runs the summary writer under test

import { summarizeTopicPost } from "@carlnotes/pipeline/topicPosts/summarizeTopicPost"
import type { ApiProvider, CallApiContextParams, ProviderResponse } from "promptfoo"
import type { TopicPostSummaryCase } from "./topicPostSummaryCases"

// the variables that a case gives the writer
type TopicPostSummaryVariables = Pick<TopicPostSummaryCase, "title" | "html">

// the writer under test. its output is the summary
export const topicPostSummaryWriter: ApiProvider = {
	id: () => "topic-post-summary-writer",
	callApi: writeCaseSummary,
}

// write one case's summary through the app's own writer
async function writeCaseSummary(_renderedPrompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
	const topicPostSummaryVariables = context?.vars as TopicPostSummaryVariables
	const { title, html } = topicPostSummaryVariables
	const { summary, costDollars } = await summarizeTopicPost({ title, html })
	return { output: summary, cost: costDollars }
}
