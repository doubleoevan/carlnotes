// the promptfoo eval of the updates opener, which makes real model calls.
// run the eval with: bun run eval:updates-opener

import { UPDATES_OPENER_MAX_CHARS } from "@carlnotes/contracts/updates"
import { scoreModel } from "@carlnotes/models/models"
import type { Assertion, GradingResult, TestCase } from "promptfoo"
import { toGradingResult } from "../evalChecks"
import { runEval, toRubricAssertions, toRubricGrader } from "../evalHarness"
import { UPDATES_OPENER_CASES, type UpdatesOpenerCase } from "./updatesOpenerCases"
import { updatesOpenerWriter } from "./updatesOpenerProviders"
import {
	GRADER_MODEL,
	MATERIAL_LABEL,
	NO_GUILT_RUBRIC,
	OUTPUT_SHAPE_RUBRIC,
	TRUE_ALL_DAY_RUBRIC,
	VOICE_RUBRIC,
} from "./updatesOpenerRubrics"

// a digit, a markdown mark, or a link
const COUNT_OR_MARKUP = /\d|[*_#`[\]]|https?:/

// the words that report what the reader missed
const MISSED_WORDS = /\b(?:missed|fell behind|falling behind|while you were|since you left|welcome back|come back)\b/i

// the checks that every case gets and that need no model
const DETERMINISTIC_ASSERTIONS: Assertion[] = [
	{ type: "javascript", metric: `at most ${UPDATES_OPENER_MAX_CHARS} characters`, value: gradeLength },
	{ type: "javascript", metric: "no digit, markdown, or link", value: gradePlainText },
	{ type: "javascript", metric: "reports nothing the reader missed", value: gradeNoMissedWords },
]

// run every case. the grader is on a different model from the model that writes the opener
await runEval({
	name: "updates-opener",
	description: "updates opener",
	provider: updatesOpenerWriter,
	writerModels: [scoreModel()],
	grader: toRubricGrader(GRADER_MODEL),
	gatePassRate: 0.9,
	defaultAssertions: DETERMINISTIC_ASSERTIONS,
	testCases: UPDATES_OPENER_CASES.map(toTestCase),
	toCaseLine: (output) => output,
})

// one promptfoo test for a case. its variables, the rubrics every opener gets, and the case's own rubric
function toTestCase({ description, rubric, ...variables }: UpdatesOpenerCase): TestCase {
	return {
		description,
		vars: variables,
		assert: toRubricAssertions({
			outputShapeRubric: OUTPUT_SHAPE_RUBRIC,
			caseRubrics: [
				{ metric: "stays true for any list that day", rubric: TRUE_ALL_DAY_RUBRIC },
				{ metric: "reports nothing missed and asks for nothing", rubric: NO_GUILT_RUBRIC },
				{ metric: "sounds like Carl", rubric: VOICE_RUBRIC },
				...(rubric ? [{ metric: description, rubric }] : []),
			],
			materialLabel: MATERIAL_LABEL,
			material: variables,
		}),
	}
}

// a check that the opener fits its limit
function gradeLength(output: string): GradingResult {
	return toGradingResult(output.length > UPDATES_OPENER_MAX_CHARS ? `${output.length} characters` : undefined)
}

// a check that the opener is plain text with no count in digits
function gradePlainText(output: string): GradingResult {
	return toGradingResult(COUNT_OR_MARKUP.test(output) ? `has a digit, markdown, or a link: ${output}` : undefined)
}

// a check that the opener says nothing about what the reader missed
function gradeNoMissedWords(output: string): GradingResult {
	return toGradingResult(MISSED_WORDS.test(output) ? `reports what the reader missed: ${output}` : undefined)
}
