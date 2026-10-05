// the promptfoo eval of the topic chat reply. every case makes real calls on the local LiteLLM proxy.
// the calls cost real money, so the eval is never part of bun test. run it with: bun run eval:topic-chat
import type { Assertion, AssertionValueFunctionContext, EvaluateResult, GradingResult, TestCase } from "promptfoo"
import { scoreModel } from "../../worker/models"
import { runEval, toGradingResult, toLinkUrls, toRubricAssertions, toRubricGrader } from "../evalHarness"
import { TOPIC_CHAT_CASES, type TopicChatCase } from "./topicChatCases"
import { type TopicChatVariables, topicChatReplyWriter } from "./topicChatProviders"

// turn web search off. a search returns "web search is not configured", so a reply's links come only from the material
delete Bun.env.EXA_API_KEY

// how many paragraphs a reply may have, its lists aside
const MAX_REPLY_PARAGRAPHS = 3

// what every rubric tells the grader about the reply
const OUTPUT_SHAPE_RUBRIC =
	"The output is Carl's chat reply to a reader's question about one of their topics. Carl answers from the topic's findings and from his own knowledge."

// the rubric that fails a reply for crediting the findings with what they do not say
const SUPPORT_RUBRIC = [
	"Everything the reply credits to the findings is in the topic material below.",
	"Fail the output if it credits the findings with a fact the material does not have, or if it states a fact from outside the material without marking that it comes from outside the findings.",
	"Never fail the output for Carl's reactions or opinions, or for everyday reasoning about what the findings say.",
].join(" ")

// the rubric that fails a reply that does not open by answering the question
const OPENING_RUBRIC =
	"The reply opens by answering the question. Fail the output if it opens with a greeting or with praise for the question, or ends with a sign-off."

// the checks that every case gets and that need no model
const DETERMINISTIC_ASSERTIONS: Assertion[] = [
	{ type: "javascript", metric: "links only to the findings", value: gradeLinksToFindings },
	{ type: "javascript", metric: `has ${MAX_REPLY_PARAGRAPHS} paragraphs or fewer`, value: gradeParagraphCount },
]

// run every case. the grader is on a different model from the model that writes the reply
await runEval({
	name: "topic-chat",
	description: "topic chat reply",
	provider: topicChatReplyWriter,
	grader: toRubricGrader(scoreModel()),
	defaultAssertions: DETERMINISTIC_ASSERTIONS,
	testCases: TOPIC_CHAT_CASES.map(toTestCase),
	toCaseLine,
})

// one promptfoo test for a case. its variables, and the rubrics over its topic material
function toTestCase(topicChatCase: TopicChatCase): TestCase {
	const { description, rubric, ...topicChatVariables } = topicChatCase

	// the support and opening rubrics, plus the case's own rubric, each with the question and the material after it
	const rubricAssertions = toRubricAssertions({
		outputShapeRubric: OUTPUT_SHAPE_RUBRIC,
		caseRubrics: [
			{ metric: "credits the findings only with what they say", rubric: SUPPORT_RUBRIC },
			{ metric: "opens by answering the question", rubric: OPENING_RUBRIC },
			{ metric: description, rubric },
		],
		materialLabel: "The question and the topic material, as the reply's writer was given them",
		material: topicChatVariables,
	})
	return { description, vars: topicChatVariables, assert: rubricAssertions }
}

// fail the check if the reply links anywhere but a finding's url
function gradeLinksToFindings(replyText: string, context: AssertionValueFunctionContext): GradingResult {
	const { chatContext } = context.vars as TopicChatVariables
	const findingUrls = chatContext.findings.map((finding) => finding.url)
	const strayUrl = toLinkUrls(replyText).find((linkUrl) => !findingUrls.includes(linkUrl))
	return toGradingResult(strayUrl && `the reply links ${strayUrl}`)
}

// fail the check if the reply has more than MAX_REPLY_PARAGRAPHS paragraphs that are not lists
function gradeParagraphCount(replyText: string): GradingResult {
	const paragraphCount = toParagraphs(replyText).length
	return toGradingResult(
		paragraphCount > MAX_REPLY_PARAGRAPHS ? `the reply has ${paragraphCount} paragraphs` : undefined,
	)
}

// a case's paragraph count and reply cost
function toCaseLine(replyText: string, evaluateResult: EvaluateResult): string {
	return `${toParagraphs(replyText).length} paragraphs, $${(evaluateResult.cost ?? 0).toFixed(4)} to write`
}

// the reply's blocks between blank lines, without the blocks that open with a list marker
function toParagraphs(replyText: string): string[] {
	const textBlocks = replyText.split(/\n\s*\n/).map((textBlock) => textBlock.trim())
	return textBlocks.filter((textBlock) => textBlock && !/^([-*]|\d+\.)\s/.test(textBlock))
}
