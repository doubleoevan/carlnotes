// the promptfoo eval of Carl's dashboard paragraph, which makes real model calls.
// run the eval with: bun run eval:dashboard-paragraph

import { DASHBOARD_PARAGRAPH_MAX_CHARS } from "@carlnotes/contracts/dashboards"
import { cheapModel } from "@carlnotes/models/models"
import { toDashboardParagraphLines } from "@carlnotes/pipeline/dashboardParagraph"
import type { Assertion, GradingResult, TestCase } from "promptfoo"
import { toGradingResult } from "../evalChecks"
import { runEval, toRubricAssertions, toRubricGrader } from "../evalHarness"
import { DASHBOARD_PARAGRAPH_CASES, type DashboardParagraphCase } from "./dashboardParagraphCases"
import { dashboardParagraphWriter, toCaseSeries } from "./dashboardParagraphProviders"
import {
	FAITHFUL_RUBRIC,
	GRADER_MODEL,
	MATERIAL_LABEL,
	NOTHING_ASKED_RUBRIC,
	OUTPUT_SHAPE_RUBRIC,
	VOICE_RUBRIC,
} from "./dashboardParagraphRubrics"

// a markdown mark or a link
const MARKUP = /[*_#`[\]]|https?:/

// the checks that every case gets and that need no model
const DETERMINISTIC_ASSERTIONS: Assertion[] = [
	{ type: "javascript", metric: `at most ${DASHBOARD_PARAGRAPH_MAX_CHARS} characters`, value: gradeLength },
	{ type: "javascript", metric: "no markdown or link", value: gradePlainText },
]

// run every case. the grader is on a different model from the model that writes the paragraph
await runEval({
	name: "dashboard-paragraph",
	description: "dashboard paragraph",
	provider: dashboardParagraphWriter,
	writerModels: [cheapModel()],
	grader: toRubricGrader(GRADER_MODEL),
	gatePassRate: 0.9,
	defaultAssertions: DETERMINISTIC_ASSERTIONS,
	testCases: DASHBOARD_PARAGRAPH_CASES.map(toTestCase),
	toCaseLine: (output) => output,
})

// one promptfoo test for a case. its variables, the rubrics every paragraph gets, and the case's own rubric, graded
// against the lines that the writer was given
function toTestCase({ description, rubric, ...variables }: DashboardParagraphCase): TestCase {
	const { summary, ...seriesVariables } = variables
	const { numberLines, placeLines } = toDashboardParagraphLines({ summary, series: toCaseSeries(seriesVariables) })
	return {
		description,
		vars: variables,
		assert: toRubricAssertions({
			outputShapeRubric: OUTPUT_SHAPE_RUBRIC,
			caseRubrics: [
				{ metric: "uses only the numbers given", rubric: FAITHFUL_RUBRIC },
				{ metric: "asks for nothing and names no item", rubric: NOTHING_ASKED_RUBRIC },
				{ metric: "sounds like Carl", rubric: VOICE_RUBRIC },
				...(rubric ? [{ metric: description, rubric }] : []),
			],
			materialLabel: MATERIAL_LABEL,
			material: { numbers: numberLines, placesMostPeopleFirst: placeLines },
		}),
	}
}

// a check that the paragraph fits its limit
function gradeLength(output: string): GradingResult {
	return toGradingResult(output.length > DASHBOARD_PARAGRAPH_MAX_CHARS ? `${output.length} characters` : undefined)
}

// a check that the paragraph is plain text
function gradePlainText(output: string): GradingResult {
	return toGradingResult(MARKUP.test(output) ? `has markdown or a link: ${output}` : undefined)
}
