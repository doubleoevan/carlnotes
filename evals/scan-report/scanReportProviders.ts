// the scan report eval's promptfoo provider, the writer under test.
// the writer calls the LiteLLM proxy through worker/models.ts
import type { ApiProvider, CallApiContextParams, ProviderResponse } from "promptfoo"
import { newBudget } from "../../worker/budget"
import { summarizeTopicScan } from "../../worker/review/summarize"
import { emptyReviewOutcome } from "../../worker/review/track"
import type { ScanReportCase } from "./scanReportCases"

// the variables that a case gives the writer. everything in the case except its description and its rubric
export type ScanReportVariables = Omit<ScanReportCase, "description" | "rubric">

// the writer under test. the writer's output is the scan report that the topic page shows
export const scanReportWriter: ApiProvider = { id: () => "scan-report-writer", callApi: writeCaseScanReport }

// write one case's scan report through the same function that a Scan calls
async function writeCaseScanReport(_renderedPrompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
	// read the case's variables
	const scanReportVariables = context?.vars as ScanReportVariables
	const { topicName, topicText, keptFindings, filteredCounts, scannedSources } = scanReportVariables

	// build the review outcome, a fresh budget, and the topic context. the report reads only the topic's name and text
	const reviewOutcome = emptyReviewOutcome()
	reviewOutcome.keptFindings = keptFindings
	Object.assign(reviewOutcome.filteredCounts, filteredCounts)
	const budget = newBudget()
	const topicContext = { name: topicName, text: topicText, embedding: [], contextHash: "", scoreText: "" }

	// write the report. the budget's cheap scoring stage holds what the report call cost
	const reportText = await summarizeTopicScan(topicContext, reviewOutcome, scannedSources, budget)
	return { output: reportText, cost: budget.stageCosts.scoringCheap }
}
