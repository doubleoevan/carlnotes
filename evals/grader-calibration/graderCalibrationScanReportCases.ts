// the grader calibration cases of the scan report eval's rubrics.
// the topic is the topic chat eval's, and the scan and the scan reports are made up
import * as scanReportRubrics from "../scan-report/scanReportRubrics"
import { TOPIC_CHAT_CONTEXT } from "../topic-chat/topicChatCases"
import type { CalibratedEval, RubricCalibration } from "./graderCalibrationCases"

// the scan report eval, with one scan that kept two findings and filtered ten pages, as its grader reads the scan
const SCAN_REPORT_EVAL: CalibratedEval = {
	evalName: "scan-report",
	evalRubrics: scanReportRubrics,
	material: scanReportRubrics.toScanReportMaterial({
		topicName: TOPIC_CHAT_CONTEXT.topicName,
		topicText: TOPIC_CHAT_CONTEXT.topicPrompt,
		keptFindings: [
			{
				title: "A quieter burr set for home grinders",
				url: "https://burrnotes.example/quiet-burrs",
				relevanceScore: 0.91,
				relevanceExplanation:
					"A burr set that runs about a third quieter, for a reader who grinds before the house is awake.",
				isNew: true,
			},
			{
				title: "Pre-infusion on a budget machine",
				url: "https://shotlab.example/budget-preinfusion",
				relevanceScore: 0.78,
				relevanceExplanation: "A cheap mod that adds pre-infusion, which smooths out light roasts.",
				isNew: true,
			},
		],
		filteredCounts: { "below relevance threshold": 9, "duplicate content": 1 },
		scannedSources: [
			{ sourceKind: "search", status: "ok" },
			{ sourceKind: "rss", status: "ok" },
		],
	}),
}

// the parts of a scan report that keeps every scan report rubric, in the prompt's order.
// the prompt allows a report to leave the details out and to label its numbers line in bold, as this report does
const SCAN_REPORT_GIST =
	"The quieter burr set is the one for you. It runs about a third quieter, which matters when you grind before the house is awake."
const SCAN_REPORT_NUMBERS_LINE = "**The numbers:** kept 2, filtered 10."
const SCAN_REPORT_ANSWERED_TOPIC_LINE =
	"This scan answered what you asked, since quiet grinding is what the topic is after."
const SCAN_REPORT_FINDINGS_LIST = [
	"Findings:",
	"- [A quieter burr set for home grinders](https://burrnotes.example/quiet-burrs)",
	"- [Pre-infusion on a budget machine](https://shotlab.example/budget-preinfusion)",
].join("\n")
const PASSING_SCAN_REPORT = [
	SCAN_REPORT_GIST,
	SCAN_REPORT_NUMBERS_LINE,
	SCAN_REPORT_ANSWERED_TOPIC_LINE,
	SCAN_REPORT_FINDINGS_LIST,
].join("\n\n")

// every scan report rubric, each with an output that keeps the rubric and an output that breaks the rubric
export const SCAN_REPORT_RUBRIC_CALIBRATIONS: RubricCalibration[] = [
	{
		calibratedEval: SCAN_REPORT_EVAL,
		rubricName: "the support rubric",
		rubric: scanReportRubrics.SUPPORT_RUBRIC,
		passingOutput: { description: "a scan report that states only the scan data", fixedOutput: PASSING_SCAN_REPORT },
		failingOutput: {
			description: "a scan report that links a page that no kept finding has",
			fixedOutput: [
				SCAN_REPORT_GIST,
				SCAN_REPORT_NUMBERS_LINE,
				SCAN_REPORT_ANSWERED_TOPIC_LINE,
				`${SCAN_REPORT_FINDINGS_LIST}\n- [A grinder noise chart](https://burrnotes.example/noise-chart)`,
			].join("\n\n"),
		},
	},
	{
		calibratedEval: SCAN_REPORT_EVAL,
		rubricName: "the voice rubric",
		rubric: scanReportRubrics.VOICE_RUBRIC,
		passingOutput: {
			description: "a scan report in Carl's voice with a bold numbers label",
			fixedOutput: PASSING_SCAN_REPORT,
		},
		failingOutput: {
			description: "a scan report that opens with a greeting",
			fixedOutput: [
				`Hi there! ${SCAN_REPORT_GIST}`,
				SCAN_REPORT_NUMBERS_LINE,
				SCAN_REPORT_ANSWERED_TOPIC_LINE,
				SCAN_REPORT_FINDINGS_LIST,
			].join("\n\n"),
		},
	},
	{
		calibratedEval: SCAN_REPORT_EVAL,
		rubricName: "the order rubric",
		rubric: scanReportRubrics.ORDER_RUBRIC,
		passingOutput: {
			description: "a scan report in the prompt's order with its details left out",
			fixedOutput: PASSING_SCAN_REPORT,
		},
		failingOutput: {
			description: "a scan report that puts its findings list first",
			fixedOutput: [
				SCAN_REPORT_FINDINGS_LIST,
				SCAN_REPORT_GIST,
				SCAN_REPORT_NUMBERS_LINE,
				SCAN_REPORT_ANSWERED_TOPIC_LINE,
			].join("\n\n"),
		},
	},
]
