// the promptfoo eval of the scan report writer. every case makes real calls on the local LiteLLM proxy.
// the calls cost real money, so the eval is never part of bun test. run it with: bun run eval:scan-report
import type { Assertion, AssertionValueFunctionContext, EvaluateResult, GradingResult, TestCase } from "promptfoo"
import { newBudget } from "../../worker/budget"
import { chatModel } from "../../worker/models"
import { toCostLine } from "../../worker/review/summarize"
import { emptyReviewOutcome } from "../../worker/review/track"
import { runEval, toGradingResult, toLinkUrls, toRubricAssertions, toRubricGrader } from "../evalHarness"
import { SCAN_REPORT_CASES, type ScanReportCase } from "./scanReportCases"
import { type ScanReportVariables, scanReportWriter } from "./scanReportProviders"

// how many words a report may run, its findings list included
const MAX_REPORT_WORDS = 200

// a line that heads a findings list, with or without Markdown heading or bold marks
const FINDINGS_HEADING_LINE = /^[\s#*]*findings:?[\s*]*$/im

// what every rubric tells the grader about the writer's output
const OUTPUT_SHAPE_RUBRIC =
	"The output is Carl's note for one content scan of a reader's topic, shown on the topic's page under a heading that already names it."

// the rubric that fails a report for stating anything that the scan data does not support
const SUPPORT_RUBRIC = [
	"Every finding, count, source, and trend the note states is in the scan data below.",
	"Fail the output if it states a finding, a count, a source, or a trend that the scan data does not have, or one that contradicts it.",
	"Never fail the output for Carl's own voice or reactions, or for a plain judgment about whether the scan answered what the reader asked.",
].join(" ")

// the rubric that fails a report that reads like a form letter. the numbers line and the findings list are the
// report's format
const VOICE_RUBRIC = [
	"The note is Carl's, in short plain sentences.",
	"Its format is the gist, a numbers line that may have a bold label such as **The numbers:**, a line on whether the scan answered the topic, and a Findings list of links if the scan kept findings. Never fail the output for that format.",
	"Fail the output if it opens with a greeting, ends with a sign-off, calls Carl by name as if someone else wrote it, nags or guilt-trips the reader, or reads like a form letter.",
].join(" ")

// the rubric that fails a report whose parts are out of the prompt's order
const ORDER_RUBRIC = [
	"The note goes in this order: the gist, then the numbers line, then any details, then the line on whether the scan answered the topic, then the Findings list.",
	"Any part may be left out: the prompt lets the note skip the numbers line or the details, and the Findings list is left out if the scan kept nothing.",
	"Fail the output only if a part it has is out of that order. Never fail it for a part it left out.",
].join(" ")

// the checks that every case gets and that need no model
const DETERMINISTIC_ASSERTIONS: Assertion[] = [
	{ type: "javascript", metric: "links only to the kept findings", value: gradeLinksToKeptFindings },
	{ type: "javascript", metric: "links every kept finding", value: gradeEveryKeptFindingLinked },
	{ type: "javascript", metric: "a quiet scan has no findings heading", value: gradeQuietScanHeading },
	{ type: "javascript", metric: "opens without a title", value: gradeOpensWithoutTitle },
	{ type: "javascript", metric: `runs ${MAX_REPORT_WORDS} words or less`, value: gradeReportLength },
]

// run every case. the grader is on a different model from the model that writes the report
await runEval({
	name: "scan-report",
	description: "scan report writer",
	provider: scanReportWriter,
	grader: toRubricGrader(chatModel()),
	defaultAssertions: DETERMINISTIC_ASSERTIONS,
	testCases: SCAN_REPORT_CASES.map(toTestCase),
	toCaseLine,
})

// one promptfoo test for a case. its variables, and the rubrics over its scan data
function toTestCase(scanReportCase: ScanReportCase): TestCase {
	const { description, rubric, ...scanReportVariables } = scanReportCase

	// the grader reads what the writer was given. every filter reason with its count, zeros as well, the date,
	// and the cost line of the writer's fresh budget
	const writerScanData = {
		...scanReportVariables,
		filteredCounts: { ...emptyReviewOutcome().filteredCounts, ...scanReportVariables.filteredCounts },
		failedDuringReviewCount: 0,
		date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
		costLine: toCostLine(newBudget()),
	}

	// the support, voice, and order rubrics, plus the case's own rubric, each with the scan data after it
	const rubricAssertions = toRubricAssertions({
		outputShapeRubric: OUTPUT_SHAPE_RUBRIC,
		caseRubrics: [
			{ metric: "says only what the scan data supports", rubric: SUPPORT_RUBRIC },
			{ metric: "sounds like Carl", rubric: VOICE_RUBRIC },
			{ metric: "keeps the prompt's order", rubric: ORDER_RUBRIC },
			...(rubric ? [{ metric: description, rubric }] : []),
		],
		materialLabel: "Scan data, as the note's writer was given it",
		material: writerScanData,
	})
	return { description, vars: scanReportVariables, assert: rubricAssertions }
}

// fail the check if the report links anywhere but a kept finding's url
function gradeLinksToKeptFindings(reportText: string, context: AssertionValueFunctionContext): GradingResult {
	const keptUrls = toKeptUrls(context)
	const strayUrl = toLinkUrls(reportText).find((linkUrl) => !keptUrls.includes(linkUrl))
	return toGradingResult(strayUrl && `the report links ${strayUrl}`)
}

// fail the check if a kept finding's url is not linked
function gradeEveryKeptFindingLinked(reportText: string, context: AssertionValueFunctionContext): GradingResult {
	const linkUrls = toLinkUrls(reportText)
	const unlinkedUrl = toKeptUrls(context).find((keptUrl) => !linkUrls.includes(keptUrl))
	return toGradingResult(unlinkedUrl && `the report does not link ${unlinkedUrl}`)
}

// fail the check if a scan that kept nothing still heads a findings list
function gradeQuietScanHeading(reportText: string, context: AssertionValueFunctionContext): GradingResult {
	const isQuietScan = toKeptUrls(context).length === 0
	return toGradingResult(
		isQuietScan && FINDINGS_HEADING_LINE.test(reportText) ? "the report has a findings heading" : undefined,
	)
}

// fail the check if the report opens with a Markdown heading
function gradeOpensWithoutTitle(reportText: string): GradingResult {
	const firstLine = reportText.trimStart().split("\n")[0] ?? ""
	return toGradingResult(firstLine.startsWith("#") ? `the report opens with "${firstLine}"` : undefined)
}

// fail the check if the report runs past MAX_REPORT_WORDS
function gradeReportLength(reportText: string): GradingResult {
	const wordCount = toWordCount(reportText)
	return toGradingResult(wordCount > MAX_REPORT_WORDS ? `the report runs ${wordCount} words` : undefined)
}

// a case's word count and writing cost
function toCaseLine(reportText: string, evaluateResult: EvaluateResult): string {
	return `${toWordCount(reportText)} words, $${(evaluateResult.cost ?? 0).toFixed(4)} to write`
}

// the urls of the findings that a case's Scan kept
function toKeptUrls(context: AssertionValueFunctionContext): string[] {
	const { keptFindings } = context.vars as ScanReportVariables
	return keptFindings.map((keptFinding) => keptFinding.url)
}

// how many words the text has, split on whitespace
function toWordCount(text: string): number {
	return text.split(/\s+/).filter(Boolean).length
}
