// the promptfoo eval of the podcast chat reply to a question asked from the podcast player, which makes real model
// calls. run the eval with: bun run eval:podcast-chat
import type { Assertion, AssertionValueFunctionContext, EvaluateResult, GradingResult, TestCase } from "promptfoo"
import { chatModel } from "../../worker/models"
import { NO_MARKDOWN_ASSERTION, toGradingResult } from "../evalChecks"
import { runEval, toRubricAssertions, toRubricGrader } from "../evalHarness"
import { toWriteCostLabel } from "../evalLabels"
import { PODCAST_CHAT_CASES, type PodcastChatCase } from "./podcastChatCases"
import { podcastChatReplyWriter } from "./podcastChatProviders"
import { GRADER_MODEL, MATERIAL_LABEL, OUTPUT_SHAPE_RUBRIC, TAKES_THE_QUESTION_RUBRIC } from "./podcastChatRubrics"

// the checks that every case gets and that need no model
const DETERMINISTIC_ASSERTIONS: Assertion[] = [
	{ type: "javascript", metric: "picks the expected speaker", value: gradeSpeaker },
	NO_MARKDOWN_ASSERTION,
]

// run every case. the grader is on a different model from the model that writes the answer
await runEval({
	name: "podcast-chat",
	description: "podcast chat reply",
	provider: podcastChatReplyWriter,
	writerModels: [chatModel()],
	grader: toRubricGrader(GRADER_MODEL),
	gatePassRate: 0.9,
	defaultAssertions: DETERMINISTIC_ASSERTIONS,
	testCases: PODCAST_CHAT_CASES.map(toTestCase),
	toCaseLine,
})

// one promptfoo test for a case. its variables, the expected speaker, the takes-the-question rubric every case gets,
// and its own rubric if it has one
function toTestCase(podcastChatCase: PodcastChatCase): TestCase {
	const { description, rubric, expectedSpeaker, ...podcastChatVariables } = podcastChatCase

	// every case grades how the answer takes the question, and a case with a rubric grades it against the chapter too
	const rubricAssertions = toRubricAssertions({
		outputShapeRubric: OUTPUT_SHAPE_RUBRIC,
		caseRubrics: [
			{ metric: "takes the question like a call-in", rubric: TAKES_THE_QUESTION_RUBRIC },
			...(rubric ? [{ metric: description, rubric }] : []),
		],
		materialLabel: MATERIAL_LABEL,
		material: podcastChatVariables,
	})
	return { description, vars: { ...podcastChatVariables, expectedSpeaker }, assert: rubricAssertions }
}

// fail the check if the answer's speaker is not the speaker the case expects
function gradeSpeaker(_answer: string, context: AssertionValueFunctionContext): GradingResult {
	const { expectedSpeaker } = context.vars as Pick<PodcastChatCase, "expectedSpeaker">
	const speaker = context.metadata?.speaker
	return toGradingResult(
		speaker !== expectedSpeaker ? `the ${speaker} answered, not the ${expectedSpeaker}` : undefined,
	)
}

// a case's speaker and answer length, and its cost
function toCaseLine(answer: string, evaluateResult: EvaluateResult): string {
	const speaker = evaluateResult.response?.metadata?.speaker ?? "unknown"
	return `${speaker}, ${answer.length} characters, ${toWriteCostLabel(evaluateResult.cost)}`
}
