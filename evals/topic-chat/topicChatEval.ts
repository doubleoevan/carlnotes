// the promptfoo eval of the topic chat reply, which makes real model calls. run the eval with: bun run eval:topic-chat
import type { Assertion, AssertionValueFunctionContext, EvaluateResult, GradingResult, TestCase } from "promptfoo"
import { chatModel } from "../../worker/models"
import { runEval, toGradingResult, toRubricAssertions, toRubricGrader } from "../evalHarness"
import { toDisallowedLinkUrl, toProseParagraphs } from "../evalReplies"
import { TOPIC_CHAT_CASES, type TopicChatCase } from "./topicChatCases"
import { type TopicChatVariables, topicChatReplyWriter } from "./topicChatProviders"
import { GRADER_MODEL, MATERIAL_LABEL, OPENING_RUBRIC, OUTPUT_SHAPE_RUBRIC, SUPPORT_RUBRIC } from "./topicChatRubrics"

// turn web search off. a search returns "web search is not configured", so a reply's links come only from the material
delete Bun.env.EXA_API_KEY

// how many paragraphs a reply may have, its lists and its headings aside
const MAX_REPLY_PARAGRAPHS = 3

// the checks that every case gets and that need no model
const DETERMINISTIC_ASSERTIONS: Assertion[] = [
	{ type: "javascript", metric: "links only to the findings and the docs", value: gradeLinksToMaterial },
	{ type: "javascript", metric: `has ${MAX_REPLY_PARAGRAPHS} paragraphs or fewer`, value: gradeParagraphCount },
]

// run every case. the grader is on a different model from the model that writes the reply
await runEval({
	name: "topic-chat",
	description: "topic chat reply",
	provider: topicChatReplyWriter,
	writerModels: [chatModel()],
	grader: toRubricGrader(GRADER_MODEL),
	gatePassRate: 0.9,
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
		materialLabel: MATERIAL_LABEL,
		material: topicChatVariables,
	})
	return { description, vars: topicChatVariables, assert: rubricAssertions }
}

// fail the check if the reply links anywhere but a finding's url, the docs root, or a docs page in the material
function gradeLinksToMaterial(replyText: string, context: AssertionValueFunctionContext): GradingResult {
	// find the first link that is neither a finding's url nor a docs page
	const { chatContext } = context.vars as TopicChatVariables
	const findingUrls = chatContext.findings.map((finding) => finding.url)
	const disallowedLinkUrl = toDisallowedLinkUrl({ replyText, findingUrls, docsBlock: chatContext.docsBlock })
	return toGradingResult(disallowedLinkUrl && `the reply links ${disallowedLinkUrl}`)
}

// fail the check if the reply has more than MAX_REPLY_PARAGRAPHS paragraphs that are not lists or headings
function gradeParagraphCount(replyText: string): GradingResult {
	const paragraphCount = toProseParagraphs(replyText).length
	return toGradingResult(
		paragraphCount > MAX_REPLY_PARAGRAPHS ? `the reply has ${paragraphCount} paragraphs` : undefined,
	)
}

// a case's paragraph count and reply cost
function toCaseLine(replyText: string, evaluateResult: EvaluateResult): string {
	return `${toProseParagraphs(replyText).length} paragraphs, $${(evaluateResult.cost ?? 0).toFixed(4)} to write`
}
