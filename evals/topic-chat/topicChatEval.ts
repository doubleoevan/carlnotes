// the promptfoo eval of the topic chat reply, which makes real model calls. run the eval with: bun run eval:topic-chat

import { chatModel } from "@carlnotes/models/models"
import type { Assertion, TestCase } from "promptfoo"
import { NO_MARKDOWN_ASSERTION, toChatReplyAssertions, toChatReplyCaseLine } from "../evalChecks"
import { runEval, toRubricAssertions, toRubricGrader } from "../evalHarness"
import { TOPIC_CHAT_CASES, type TopicChatCase } from "./topicChatCases"
import { type TopicChatVariables, topicChatReplyWriter } from "./topicChatProviders"
import { GRADER_MODEL, MATERIAL_LABEL, OPENING_RUBRIC, OUTPUT_SHAPE_RUBRIC, SUPPORT_RUBRIC } from "./topicChatRubrics"

// turn web search off. a search returns "web search is not configured", so a reply's links come only from the material
delete Bun.env.EXA_API_KEY

// run every case. the grader is on a different model from the model that writes the reply. every case gets the
// checks that need no model, over its topic material
await runEval({
	name: "topic-chat",
	description: "topic chat reply",
	provider: topicChatReplyWriter,
	writerModels: [chatModel()],
	grader: toRubricGrader(GRADER_MODEL),
	gatePassRate: 0.9,
	defaultAssertions: toChatReplyAssertions((context) => (context.vars as TopicChatVariables).chatContext),
	testCases: TOPIC_CHAT_CASES.map(toTestCase),
	toCaseLine: toChatReplyCaseLine,
})

// one promptfoo test for a case. its variables, the no-markdown check of a spoken case, and the rubrics over its topic
// material
function toTestCase(topicChatCase: TopicChatCase): TestCase {
	const { description, rubric, ...topicChatVariables } = topicChatCase

	// the no-markdown check, which only a spoken case gets
	const spokenAssertions: Assertion[] = topicChatVariables.isSpoken ? [NO_MARKDOWN_ASSERTION] : []

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
	return { description, vars: topicChatVariables, assert: [...spokenAssertions, ...rubricAssertions] }
}
