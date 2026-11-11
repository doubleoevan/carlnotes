// the promptfoo eval of the topic chat's reply to a question asked from a Topic Post's page, which makes real model
// calls. run the eval with: bun run eval:topic-post-chat

import { chatModel } from "@carlnotes/models/models"
import type { EvaluateResult, TestCase } from "promptfoo"
import { runEval, toRubricAssertions, toRubricGrader } from "../evalHarness"
import { toWriteCostLabel } from "../evalLabels"
import { TOPIC_POST_CHAT_CASES, type TopicPostChatCase } from "./topicPostChatCases"
import { topicPostChatReplyWriter } from "./topicPostChatProviders"
import { FAITHFUL_RUBRIC, GRADER_MODEL, MATERIAL_LABEL, OUTPUT_SHAPE_RUBRIC } from "./topicPostChatRubrics"

// run every case. the grader is on a different model from the model that writes the reply
await runEval({
	name: "topic-post-chat",
	description: "topic post chat reply",
	provider: topicPostChatReplyWriter,
	writerModels: [chatModel()],
	grader: toRubricGrader(GRADER_MODEL),
	gatePassRate: 0.9,
	defaultAssertions: [],
	testCases: TOPIC_POST_CHAT_CASES.map(toTestCase),
	toCaseLine,
})

// one promptfoo test for a case. its variables, the faithful rubric every case gets, and its own rubric
function toTestCase({ description, rubric, ...topicPostChatVariables }: TopicPostChatCase): TestCase {
	return {
		description,
		vars: topicPostChatVariables,
		assert: toRubricAssertions({
			outputShapeRubric: OUTPUT_SHAPE_RUBRIC,
			caseRubrics: [
				{ metric: "reports only what the post and its Comments say", rubric: FAITHFUL_RUBRIC },
				{ metric: description, rubric },
			],
			materialLabel: MATERIAL_LABEL,
			material: topicPostChatVariables,
		}),
	}
}

// a case's reply length and its cost
function toCaseLine(reply: string, evaluateResult: EvaluateResult): string {
	return `${reply.length} characters, ${toWriteCostLabel(evaluateResult.cost)}`
}
