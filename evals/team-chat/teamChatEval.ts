// the promptfoo eval of the team chat reply, read across every topic a team holds, which makes real model calls.
// run the eval with: bun run eval:team-chat

import { chatModel } from "@carlnotes/models/models"
import type { TestCase } from "promptfoo"
import { toChatReplyAssertions, toChatReplyCaseLine } from "../evalChecks"
import { runEval, toRubricAssertions, toRubricGrader } from "../evalHarness"
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

// run every case. the grader is on a different model from the model that writes the reply. every case gets the
// checks that need no model, over its team material
await runEval({
	name: "team-chat",
	description: "team chat reply",
	provider: teamChatReplyWriter,
	writerModels: [chatModel()],
	grader: toRubricGrader(GRADER_MODEL),
	gatePassRate: 0.9,
	defaultAssertions: toChatReplyAssertions((context) => (context.vars as TeamChatVariables).teamChatContext),
	testCases: TEAM_CHAT_CASES.map(toTestCase),
	toCaseLine: toChatReplyCaseLine,
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
