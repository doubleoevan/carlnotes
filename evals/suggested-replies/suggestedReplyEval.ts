// the promptfoo eval of the suggested reply, which makes real model calls. run the eval with:
// bun run eval:suggested-replies

import { toSafeSuggestedReply } from "@carlnotes/contracts/suggestedReplies"
import { cheapModel, scoreModel } from "@carlnotes/models/models"
import type { EvaluateResult, GradingResult, TestCase } from "promptfoo"
import { toGradingResult } from "../evalChecks"
import { runEval, toRubricAssertions, toRubricGrader } from "../evalHarness"
import { toWriteCostLabel } from "../evalLabels"
import { SUGGESTED_REPLY_CASES, type SuggestedReplyCase } from "./suggestedReplyCases"
import { NULL_SUGGESTED_REPLY, suggestedReplyWriter } from "./suggestedReplyProviders"

// what every rubric tells the grader about the output
const OUTPUT_SHAPE_RUBRIC = [
	"The output is the one short line a reader is most likely to send Carl next, shown as a hint in their empty chat box,",
	'or the word "null" for no suggestion. Nothing is sent until the reader sends it.',
].join(" ")

// the rubric every case shares: the reader's voice, short, and inventing nothing
const VOICE_RUBRIC = [
	"Fail the output if it is not null and it speaks as Carl instead of the reader, runs past about a dozen words,",
	"or states a fact about the reader that the conversation never gave.",
].join(" ")

// the label of the conversation and the draft after each rubric
const MATERIAL_LABEL = "The conversation and the draft the line was written from"

// run every case. the grader is on a different model from the one that writes the line
await runEval({
	name: "suggested-replies",
	description: "suggested reply",
	provider: suggestedReplyWriter,
	writerModels: [cheapModel()],
	grader: toRubricGrader(scoreModel()),
	gatePassRate: 0.9,
	defaultAssertions: [],
	testCases: SUGGESTED_REPLY_CASES.map(toTestCase),
	toCaseLine,
})

// one promptfoo test for a case: the code filter's checks on the model's own line, and the rubrics
function toTestCase(suggestedReplyCase: SuggestedReplyCase): TestCase {
	const { description, rubric, ...suggestedReplyVariables } = suggestedReplyCase
	return {
		description,
		vars: suggestedReplyVariables,
		assert: [
			{
				type: "javascript",
				metric: "passes the code's filter",
				value: gradeFilter,
			},
			...toRubricAssertions({
				outputShapeRubric: OUTPUT_SHAPE_RUBRIC,
				caseRubrics: [
					{ metric: "speaks for the reader and invents nothing", rubric: VOICE_RUBRIC },
					{ metric: description, rubric },
				],
				materialLabel: MATERIAL_LABEL,
				material: suggestedReplyVariables,
			}),
		],
	}
}

// fail a line the code would drop: an email, a link, a handle, or past the limit. no suggestion always passes
function gradeFilter(output: string): GradingResult {
	const isDropped = output !== NULL_SUGGESTED_REPLY && toSafeSuggestedReply(output) === null
	return toGradingResult(isDropped ? `the code would drop "${output}"` : undefined)
}

// a case's line and what it cost
function toCaseLine(output: string, evaluateResult: EvaluateResult): string {
	return `"${output}", ${toWriteCostLabel(evaluateResult.cost)}`
}
