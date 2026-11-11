// the promptfoo eval of the Topic Post Discussion's script, which makes real model calls.
// run the eval with: bun run eval:topic-post-discussion

import { toWordCount } from "@carlnotes/contracts/topicPosts"
import { scoreModel } from "@carlnotes/models/models"
import { MAX_DISCUSSION_WORDS } from "@carlnotes/pipeline/topicPosts/topicPostDiscussionScript"
import type { Assertion, GradingResult, TestCase } from "promptfoo"
import { toGradingResult } from "../evalChecks"
import { runEval, toRubricAssertions, toRubricGrader } from "../evalHarness"
import { TOPIC_POST_DISCUSSION_CASES, type TopicPostDiscussionCase } from "./topicPostDiscussionCases"
import { topicPostDiscussionWriter } from "./topicPostDiscussionProviders"
import {
	CONVERSATION_RUBRIC,
	FAITHFUL_RUBRIC,
	GRADER_MODEL,
	MATERIAL_LABEL,
	OUTPUT_SHAPE_RUBRIC,
	toKeyFactsRubric,
} from "./topicPostDiscussionRubrics"

// the checks that every case gets and that need no model
const DETERMINISTIC_ASSERTIONS: Assertion[] = [
	{ type: "javascript", metric: "both hosts speak", value: gradeBothHosts },
	{ type: "javascript", metric: `at most ${MAX_DISCUSSION_WORDS} words`, value: gradeLength },
]

// run every case. the grader is on a different model from the model that writes the script
await runEval({
	name: "topic-post-discussion",
	description: "topic post discussion script",
	provider: topicPostDiscussionWriter,
	writerModels: [scoreModel()],
	grader: toRubricGrader(GRADER_MODEL),
	gatePassRate: 0.9,
	defaultAssertions: DETERMINISTIC_ASSERTIONS,
	testCases: TOPIC_POST_DISCUSSION_CASES.map(toTestCase),
	toCaseLine: (output) => output.split("\n").slice(0, 2).join(" / "),
})

// one promptfoo test for a case. its variables, the rubrics every script gets, and the case's own rubric
function toTestCase({ description, rubric, keyFacts, ...variables }: TopicPostDiscussionCase): TestCase {
	return {
		description,
		vars: variables,
		assert: toRubricAssertions({
			outputShapeRubric: OUTPUT_SHAPE_RUBRIC,
			caseRubrics: [
				{ metric: "covers the post's key facts", rubric: toKeyFactsRubric(keyFacts) },
				{ metric: "states only what the post and the Comments say", rubric: FAITHFUL_RUBRIC },
				{ metric: "reads as two hosts talking", rubric: CONVERSATION_RUBRIC },
				...(rubric ? [{ metric: description, rubric }] : []),
			],
			materialLabel: MATERIAL_LABEL,
			material: variables,
		}),
	}
}

// a check that a line of each host is in the script
function gradeBothHosts(output: string): GradingResult {
	const hasBothHosts = /^Carl: /m.test(output) && /^Vienna: /m.test(output)
	return toGradingResult(hasBothHosts ? undefined : "one host has no line")
}

// a check that the script stays inside seven minutes at the hosts' speaking rate
function gradeLength(output: string): GradingResult {
	const wordCount = toWordCount(output.replace(/^(Carl|Vienna): /gm, ""))
	return toGradingResult(wordCount > MAX_DISCUSSION_WORDS ? `${wordCount} words` : undefined)
}
