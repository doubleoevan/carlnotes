// the promptfoo eval of the scan report writer, which makes real model calls. run the eval with: bun run eval:scan-report
import type { Assertion, AssertionValueFunctionContext, EvaluateResult, GradingResult, TestCase } from "promptfoo"
import { cheapModel } from "../../worker/models"
import { runEval, toGradingResult, toRubricAssertions, toRubricGrader } from "../evalHarness"
import { toWordCount } from "../evalLabels"
import { toLinkUrls } from "../evalReplies"
import { SCAN_REPORT_CASES, type ScanReportCase } from "./scanReportCases"
import { type ScanReportVariables, scanReportWriter } from "./scanReportProviders"
import {
	GRADER_MODEL,
	MATERIAL_LABEL,
	ORDER_RUBRIC,
	OUTPUT_SHAPE_RUBRIC,
	SUPPORT_RUBRIC,
	toScanReportMaterial,
	VOICE_RUBRIC,
} from "./scanReportRubrics"

// how many words a report may run, its findings list included
const MAX_REPORT_WORDS = 200

// a line that heads a findings list, with or without Markdown heading or bold marks
const FINDINGS_HEADING_LINE = /^[\s#*]*findings:?[\s*]*$/im

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
	writerModels: [cheapModel()],
	grader: toRubricGrader(GRADER_MODEL),
	gatePassRate: 0.9,
	defaultAssertions: DETERMINISTIC_ASSERTIONS,
	testCases: SCAN_REPORT_CASES.map(toTestCase),
	toCaseLine,
})

// one promptfoo test for a case. its variables, and the rubrics over its scan data
function toTestCase(scanReportCase: ScanReportCase): TestCase {
	const { description, rubric, ...scanReportVariables } = scanReportCase

	// the support, voice, and order rubrics, plus the case's own rubric, each with the scan data after it
	const rubricAssertions = toRubricAssertions({
		outputShapeRubric: OUTPUT_SHAPE_RUBRIC,
		caseRubrics: [
			{ metric: "says only what the scan data supports", rubric: SUPPORT_RUBRIC },
			{ metric: "sounds like Carl", rubric: VOICE_RUBRIC },
			{ metric: "keeps the prompt's order", rubric: ORDER_RUBRIC },
			...(rubric ? [{ metric: description, rubric }] : []),
		],
		materialLabel: MATERIAL_LABEL,
		material: toScanReportMaterial(scanReportVariables),
	})
	return { description, vars: scanReportVariables, assert: rubricAssertions }
}

// fail the check if the report links anywhere but a kept finding's url
function gradeLinksToKeptFindings(reportText: string, context: AssertionValueFunctionContext): GradingResult {
	const keptUrls = toKeptUrls(context)
	const disallowedUrl = toLinkUrls(reportText).find((linkUrl) => !keptUrls.includes(linkUrl))
	return toGradingResult(disallowedUrl && `the report links ${disallowedUrl}`)
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
