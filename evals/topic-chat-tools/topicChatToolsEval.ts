// the promptfoo eval of the topic chat's tool calls, in the solo chat and the team room, which makes real model calls.
// run the eval with: bun run eval:topic-chat-tools
import type { Assertion, EvaluateResult, GradingResult, TestCase } from "promptfoo"
import { chatModel } from "../../worker/models"
import { runEval, toGradingResult, toRubricAssertions, toRubricGrader } from "../evalHarness"
import { TOPIC_CHAT_TOOLS_CASES, type TopicChatToolsCase } from "./topicChatToolsCases"
import { type TopicChatToolsTurn, topicChatToolsTurnWriter } from "./topicChatToolsProviders"
import { CLAIMED_ACTION_RUBRIC, GRADER_MODEL, MATERIAL_LABEL, OUTPUT_SHAPE_RUBRIC } from "./topicChatToolsRubrics"

// turn web search off. a search returns "web search is not configured", so a turn reads only its own material
delete Bun.env.EXA_API_KEY

// the tool that a turn may call besides the expected tool
const SEARCH_TOOL_NAME = "searchWeb"

// run every case. the grader is on a different model from the model that writes the turn
await runEval({
	name: "topic-chat-tools",
	description: "topic chat tool calls",
	provider: topicChatToolsTurnWriter,
	writerModels: [chatModel()],
	grader: toRubricGrader(GRADER_MODEL),
	gatePassRate: 1,
	defaultAssertions: [],
	testCases: TOPIC_CHAT_TOOLS_CASES.map(toTestCase),
	toCaseLine,
})

// one promptfoo test for a case. its variables, its tool call check, and the rubric over its chat turn
function toTestCase(topicChatToolsCase: TopicChatToolsCase): TestCase {
	const { description, expectedToolCall, ...topicChatToolsVariables } = topicChatToolsCase

	// the turn calls the expected tool with the expected input and no other tool but a search, or calls no tool
	const toolCallAssertion: Assertion = {
		type: "javascript",
		metric: expectedToolCall ? `calls ${expectedToolCall.toolName} and nothing else` : "calls no tool",
		value: (turnOutput: string) => gradeToolCalls(turnOutput, expectedToolCall),
	}

	// the claimed action rubric, with the conversation that the turn was given after it
	const rubricAssertions = toRubricAssertions({
		outputShapeRubric: OUTPUT_SHAPE_RUBRIC,
		caseRubrics: [{ metric: "claims no action that no tool made", rubric: CLAIMED_ACTION_RUBRIC }],
		materialLabel: MATERIAL_LABEL,
		material: topicChatToolsVariables,
	})
	return { description, vars: topicChatToolsVariables, assert: [toolCallAssertion, ...rubricAssertions] }
}

// fail the check unless the expected tool was called with the expected input and every other call was a search
function gradeToolCalls(turnOutput: string, expectedToolCall: TopicChatToolsCase["expectedToolCall"]): GradingResult {
	const { toolCalls } = JSON.parse(turnOutput) as TopicChatToolsTurn

	// a call to anything but the expected tool or a search fails the check
	const expectedToolName = expectedToolCall?.toolName
	const unexpectedToolCall = toolCalls.find(
		(toolCall) => toolCall.toolName !== expectedToolName && toolCall.toolName !== SEARCH_TOOL_NAME,
	)
	if (unexpectedToolCall) {
		return toGradingResult(
			`the turn called ${unexpectedToolCall.toolName} with ${JSON.stringify(unexpectedToolCall.input)}`,
		)
	}

	// a turn that has to call a tool needs a call of that tool with the expected input
	const isExpectedToolCallMade =
		!expectedToolCall ||
		toolCalls.some(
			(toolCall) =>
				toolCall.toolName === expectedToolCall.toolName &&
				expectedToolCall.isInputExpected(toolCall.input as Record<string, unknown>),
		)
	return toGradingResult(
		isExpectedToolCallMade ? undefined : `the turn made no ${expectedToolName} call with that input`,
	)
}

// a case's tool calls in order, and what the turn cost
function toCaseLine(turnOutput: string, evaluateResult: EvaluateResult): string {
	const { toolCalls } = JSON.parse(turnOutput) as TopicChatToolsTurn
	const toolNames = toolCalls.map((toolCall) => toolCall.toolName)
	return `tools: ${toolNames.join(", ") || "none"}, $${(evaluateResult.cost ?? 0).toFixed(4)} to write`
}
