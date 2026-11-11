// the promptfoo eval of the Topic Post summary, which makes real model calls.
// run the eval with: bun run eval:topic-post-summary

import { TOPIC_POST_SUMMARY_MAX_CHARS } from "@carlnotes/contracts/topicPosts"
import { cheapModel } from "@carlnotes/models/models"
import type { Assertion, GradingResult, TestCase } from "promptfoo"
import { toGradingResult } from "../evalChecks"
import { runEval, toRubricAssertions, toRubricGrader } from "../evalHarness"
import { TOPIC_POST_SUMMARY_CASES, type TopicPostSummaryCase } from "./topicPostSummaryCases"
import { topicPostSummaryWriter } from "./topicPostSummaryProviders"
import {
	FAITHFUL_RUBRIC,
	GRADER_MODEL,
	MATERIAL_LABEL,
	OUTPUT_SHAPE_RUBRIC,
	SUBJECT_RUBRIC,
	toKeyFactsRubric,
} from "./topicPostSummaryRubrics"

// a markdown mark, a link, or a line break
const MARKUP_OR_BREAK = /[*_#`[\]]|https?:|\n/

// the checks that every case gets and that need no model
const DETERMINISTIC_ASSERTIONS: Assertion[] = [
	{ type: "javascript", metric: `at most ${TOPIC_POST_SUMMARY_MAX_CHARS} characters`, value: gradeLength },
	{ type: "javascript", metric: "plain text on one line", value: gradePlainText },
]

// run every case. the grader is on a different model from the model that writes the summary
await runEval({
	name: "topic-post-summary",
	description: "topic post summary",
	provider: topicPostSummaryWriter,
	writerModels: [cheapModel()],
	grader: toRubricGrader(GRADER_MODEL),
	gatePassRate: 0.9,
	defaultAssertions: DETERMINISTIC_ASSERTIONS,
	testCases: TOPIC_POST_SUMMARY_CASES.map(toTestCase),
	toCaseLine: (output) => output,
})

// one promptfoo test for a case. its variables, the rubrics every summary gets, and the case's own rubric
function toTestCase({ description, rubric, keyFacts, ...variables }: TopicPostSummaryCase): TestCase {
	return {
		description,
		vars: variables,
		assert: toRubricAssertions({
			outputShapeRubric: OUTPUT_SHAPE_RUBRIC,
			caseRubrics: [
				{ metric: "keeps the post's key facts", rubric: toKeyFactsRubric(keyFacts) },
				{ metric: "says only what the post says", rubric: FAITHFUL_RUBRIC },
				{ metric: "is about the subject, not the post", rubric: SUBJECT_RUBRIC },
				...(rubric ? [{ metric: description, rubric }] : []),
			],
			materialLabel: MATERIAL_LABEL,
			material: variables,
		}),
	}
}

// a check that the summary fits its limit
function gradeLength(output: string): GradingResult {
	return toGradingResult(output.length > TOPIC_POST_SUMMARY_MAX_CHARS ? `${output.length} characters` : undefined)
}

// a check that the summary is plain text on one line
function gradePlainText(output: string): GradingResult {
	return toGradingResult(MARKUP_OR_BREAK.test(output) ? `has markdown, a link, or a line break: ${output}` : undefined)
}
