// the scan report: a short write-up of what one Scan found, filtered, and spent
import { reportError } from "@shared/monitoring"
import { generateText } from "ai"
import { type Budget, CHEAP_COST_PER_MILLION_TOKENS, charge, tokenCost } from "../budget"
import { cheapModel } from "../models"
import { type BuiltPrompt, fetchPromptTemplate, promptTelemetry } from "../prompts/fetch"
import { writePrompt } from "../prompts/write"
import type { TopicContext } from "./filter"
import type { KeptFinding, ReviewOutcome } from "./track"

// how many kept findings the report lists in full before it just counts the rest
const MAX_TOPIC_SCAN_REPORT_FINDINGS = 20

// how many times the report call retries before it gives up
const REPORT_MAX_RETRIES = 4

// one Source's ingestion outcome, as the report's sources section lists it
// "fallback" means the Source ran without erroring but found nothing,
// which the report names so a dead feed is visible instead of reading as a quiet one
// a failed Source includes the reason it failed, so a blocked Source can read as blocked
export type ScannedSource = {
	sourceKind: string
	status: "ok" | "fallback" | "failed" | "skipped"
	fallbackMode?: string
	reason?: string
}

// the values the scan report prompt is rendered with
type ScanPromptData = {
	topicName: string
	topicContext: string
	date: string
	// the Scan's totals, its Sources' outcomes, and what it spent
	reviewOutcome: ReviewOutcome
	scannedSources: ScannedSource[]
	budget: Budget
}

/**
 * Runs the given summarize callback, returning an empty summary if it throws.
 */
export async function toTopicScanSummary(scanId: string, summarize: () => Promise<string>): Promise<string> {
	try {
		return await summarize()
	} catch (error) {
		// the Scan still succeeds with real Findings, so an empty recap is the only thing the user sees from a summary error
		console.error(`scan report failed for scan ${scanId}, leaving the summary empty`, error)
		reportError(error, "scan-report", { scanId })
		return ""
	}
}

/**
 * Writes the scan report for one Scan. Throws when the model returns nothing.
 */
export async function summarizeTopicScan(
	topicContext: TopicContext,
	reviewOutcome: ReviewOutcome,
	scannedSources: ScannedSource[],
	budget: Budget,
	litellmApiKey?: string,
): Promise<string> {
	// render the prompt over this Scan's own numbers
	const date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
	const reportPrompt = await buildScanReportPrompt({
		topicName: topicContext.name,
		topicContext: topicContext.text,
		date,
		reviewOutcome,
		scannedSources,
		budget,
	})

	// ask the cheap model for the write-up, then charge what it cost
	const { text, usage } = await generateText({
		model: cheapModel(litellmApiKey),
		prompt: reportPrompt.prompt,
		maxRetries: REPORT_MAX_RETRIES,
		...promptTelemetry(reportPrompt),
	})
	charge(budget, "scoringCheap", tokenCost(usage.totalTokens ?? 0, CHEAP_COST_PER_MILLION_TOKENS))

	// a blank answer is a failed call, so it throws instead of returning an empty report
	const reportText = text.trim()
	if (reportText.length === 0) {
		throw new Error(`scan report came back empty after ${usage.totalTokens ?? 0} tokens`)
	}
	return reportText
}

/**
 * Builds the scan report prompt from summarize-topic-scan.md.
 */
export async function buildScanReportPrompt(promptData: ScanPromptData): Promise<BuiltPrompt> {
	const { template, name, registryPrompt } = await fetchPromptTemplate("summarize-topic-scan")

	// fill the template. the topic text, the kept block, and the sources block are reachable by an attacker.
	// a failed Source's reason can include a host's own response text, so all three get fenced as untrusted
	const prompt = writePrompt(
		template,
		{
			topicName: promptData.topicName,
			topicContext: promptData.topicContext,
			keptFindingsBlock: toKeptFindingsBlock(promptData.reviewOutcome.keptFindings),
			sourcesBlock: toSourcesBlock(promptData.scannedSources),
		},
		{
			date: promptData.date,
			filteredBreakdown: toFilteredResourcesReport(promptData.reviewOutcome),
			costLine: toCostLine(promptData.budget),
		},
	)
	return { prompt, name, registryPrompt }
}

// lists each kept finding with its title, url, relevance score, and note
function toKeptFindingsBlock(keptFindings: KeptFinding[]): string {
	if (keptFindings.length === 0) {
		return "none"
	}

	// one bullet per finding, up to the listing limit
	const findingLines = keptFindings.slice(0, MAX_TOPIC_SCAN_REPORT_FINDINGS).map((finding) => {
		const relevanceNote = finding.relevanceExplanation || "no note"
		return `- ${finding.title ?? finding.url} — ${finding.url} — score ${finding.relevanceScore.toFixed(2)}\n  note: ${relevanceNote}`
	})

	// count whatever the limit left off
	const unlistedCount = keptFindings.length - MAX_TOPIC_SCAN_REPORT_FINDINGS
	if (unlistedCount > 0) {
		findingLines.push(`…and ${unlistedCount} more kept findings not listed`)
	}
	return findingLines.join("\n")
}

// counts the filtered resources by reason, and shows the failed total. the deferred count stays out.
function toFilteredResourcesReport(reviewOutcome: ReviewOutcome): string {
	const filterReasonLines = Object.entries(reviewOutcome.filteredCounts).map(
		([filterReason, filteredCount]) => `- ${filterReason}: ${filteredCount}`,
	)
	return [...filterReasonLines, `- failed during review: ${reviewOutcome.failedCount}`].join("\n")
}

// lists each Source with its kind, how it ended, any fallback it used, and why it failed
function toSourcesBlock(scannedSources: ScannedSource[]): string {
	if (scannedSources.length === 0) {
		return "none recorded"
	}

	// one bullet per Source. a failed Source states its reason, so the report can say it was blocked.
	// a Source that could not be reached would otherwise read as one that found nothing
	return scannedSources
		.map((scannedSource) => {
			const fallbackNote = scannedSource.fallbackMode ? ` — fell back to ${scannedSource.fallbackMode}` : ""
			const failureNote = scannedSource.reason ? ` — ${scannedSource.reason}` : ""
			return `- ${scannedSource.sourceKind}: ${scannedSource.status}${fallbackNote}${failureNote}`
		})
		.join("\n")
}

// the Scan's total spend with its per-stage breakdown, ingestion first since it is charged first
function toCostLine(budget: Budget): string {
	const { ingestion, embedding, fetch, scoringCheap, scoringPremium } = budget.stageCosts
	return `total $${budget.spentDollars.toFixed(4)} — ingestion $${ingestion.toFixed(4)}, embedding $${embedding.toFixed(4)}, fetch $${fetch.toFixed(4)}, cheap scoring $${scoringCheap.toFixed(4)}, premium scoring $${scoringPremium.toFixed(4)}`
}
