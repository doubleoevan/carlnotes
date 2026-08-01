// summarize tests for the report's failure isolation and the prompt it grounds in the scan's own totals
import { expect, test } from "bun:test"
import { newBudget } from "../budget"
// the scan report prompt input reuses the source outcome shape the scan hands over
import { buildScanReportPrompt, type ScannedSource, toTopicScanSummary } from "./summarize"

// an AI report that fails returns an empty summary
test("toScanSummary yields an empty summary when the report throws", async () => {
	// a successful AI report is returned untouched
	expect(await toTopicScanSummary("scan-1", async () => "a dated report")).toBe("a dated report")

	// a thrown AI report returns an empty summary
	expect(await toTopicScanSummary("scan-1", async () => Promise.reject(new Error("model unavailable")))).toBe("")
})

// buildScanReportPrompt writes the report prompt from summarize-topic-scan.md over the scan's totals, sources, and costs
test("buildScanReportPrompt grounds the report prompt in the scan's data", async () => {
	// one kept finding with its reader-facing note
	const keptFinding = { title: "One", url: "https://a.com/1", relevanceScore: 0.91, relevanceExplanation: "agent news" }

	// per-cause drop counts plus the deferred and failed counts
	const reviewOutcome = {
		keptFindings: [keptFinding],
		filteredCounts: {
			"duplicate content": 2,
			"near-duplicate": 1,
			"below relevance threshold": 4,
			"flagged by scanner": 1,
		},
		deferredCount: 1,
		failedCount: 0,
	}

	// the spend breakdown the cost line renders, ingestion included, and two sources with different outcomes
	const stageCosts = { ingestion: 0.005, embedding: 0.01, fetch: 0.02, scoringCheap: 0.03, scoringPremium: 0.0634 }
	const budget = { ...newBudget(), spent: 0.1284, stageCosts }
	const scannedSources: ScannedSource[] = [
		{ sourceKind: "rss", status: "ok" },
		{ sourceKind: "search", status: "failed" },
	]

	// render the report prompt over the sample scan
	const { prompt: reportPrompt } = await buildScanReportPrompt({
		topicName: "LLM tooling",
		topicContext: "agents and prompt engineering",
		date: "July 21, 2026",
		// the grounded data blocks
		reviewOutcome,
		scannedSources,
		budget,
	})

	// the date, kept finding, drop causes, and source outcomes all land in the prompt
	expect(reportPrompt).toContain("July 21, 2026")
	expect(reportPrompt).toContain("https://a.com/1")
	expect(reportPrompt).toContain("agent news")
	expect(reportPrompt).toContain("duplicate content: 2")
	expect(reportPrompt).toContain("rss: ok")
	expect(reportPrompt).toContain("search: failed")

	// the report beats survive rendering and no placeholder is left unfilled
	expect(reportPrompt).toContain("worth flagging")
	expect(reportPrompt).not.toContain("{{")
})
