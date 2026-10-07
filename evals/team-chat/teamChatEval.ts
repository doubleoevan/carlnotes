// the promptfoo eval of the team chat reply, read across every topic a team holds, which makes real model calls.
// run the eval with: bun run eval:team-chat
import type { Assertion, AssertionValueFunctionContext, EvaluateResult, GradingResult, TestCase } from "promptfoo"
import { chatModel } from "../../worker/models"
import { runEval, toGradingResult, toRubricAssertions, toRubricGrader } from "../evalHarness"
import { toDisallowedLinkUrl, toProseParagraphs } from "../evalReplies"
import { TEAM_CHAT_CASES, type TeamChatCase } from "./teamChatCases"
import { type TeamChatVariables, teamChatReplyWriter } from "./teamChatProviders"
import {
	FINDING_TOPIC_RUBRIC,
	GRADER_MODEL,
	MATERIAL_LABEL,
	OUTPUT_SHAPE_RUBRIC,
	SUPPORT_RUBRIC,
} from "./teamChatRubrics"

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
	name: "team-chat",
	description: "team chat reply",
	provider: teamChatReplyWriter,
	writerModels: [chatModel()],
	grader: toRubricGrader(GRADER_MODEL),
	gatePassRate: 0.9,
	defaultAssertions: DETERMINISTIC_ASSERTIONS,
	testCases: TEAM_CHAT_CASES.map(toTestCase),
	toCaseLine,
})

// one promptfoo test for a case. its variables, and the rubrics over its team material
function toTestCase(teamChatCase: TeamChatCase): TestCase {
	const { description, rubric, ...teamChatVariables } = teamChatCase

	// the support and finding topic rubrics, plus the case's own rubric, each with the question and the material after the rubric
	const rubricAssertions = toRubricAssertions({
		outputShapeRubric: OUTPUT_SHAPE_RUBRIC,
		caseRubrics: [
			{ metric: "credits the findings only with what they say", rubric: SUPPORT_RUBRIC },
			{ metric: "names the right topic for each finding", rubric: FINDING_TOPIC_RUBRIC },
			{ metric: description, rubric },
		],
		materialLabel: MATERIAL_LABEL,
		material: teamChatVariables,
	})
	return { description, vars: teamChatVariables, assert: rubricAssertions }
}

// fail the check if the reply links anywhere but a finding's url, the docs root, or a docs page in the material
function gradeLinksToMaterial(replyText: string, context: AssertionValueFunctionContext): GradingResult {
	// find the first link that is neither a finding's url nor a docs page
	const { teamChatContext } = context.vars as TeamChatVariables
	const disallowedLinkUrl = toDisallowedLinkUrl({
		replyText,
		findingUrls: teamChatContext.findings.map((finding) => finding.url),
		docsBlock: teamChatContext.docsBlock,
	})
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
