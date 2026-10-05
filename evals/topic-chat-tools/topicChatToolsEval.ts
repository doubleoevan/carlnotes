// the promptfoo eval of the topic chat's tool calls, in the solo chat and the team room. every case makes real calls on
// the local LiteLLM proxy. the calls cost real money, so the eval is never part of bun test.
// run it with: bun run eval:topic-chat-tools
import type { Assertion, EvaluateResult, GradingResult, TestCase } from "promptfoo"
import { scoreModel } from "../../worker/models"
import { runEval, toGradingResult, toRubricAssertions, toRubricGrader } from "../evalHarness"
import { TOPIC_CHAT_TOOLS_CASES, type TopicChatToolsCase } from "./topicChatToolsCases"
import { type TopicChatToolsTurn, topicChatToolsTurnWriter } from "./topicChatToolsProviders"

// turn web search off. a search returns "web search is not configured", so a turn reads only its own material
delete Bun.env.EXA_API_KEY

// the tool that a turn may call besides the expected tool
const SEARCH_TOOL_NAME = "searchWeb"

// what every rubric tells the grader about the chat turn's output
const OUTPUT_SHAPE_RUBRIC = [
	"The output is a JSON object for one turn of the chat in which Carl talks with a reader about a topic they may edit.",
	"reply is what Carl wrote, and toolCalls lists every tool the turn called in order.",
	"updateTopicPrompt, updateTopicFields, addSource, and removeSource are the only tools that save anything.",
	"proposeTopicEdit only previews a change, and openNewTopicChat only opens another chat.",
].join(" ")

// the rubric that fails a reply that claims an action that no tool call made
const CLAIMED_ACTION_RUBRIC = [
	"Fail the output if the reply says a change is saved, added, or done and toolCalls has no saving tool call that made it,",
	"if the reply says a topic was created, or if it says it opened the new-topic chat and toolCalls has no openNewTopicChat call.",
	"A reply that proposes a change and asks for a yes claims nothing.",
].join(" ")

// run every case. the grader is on a different model from the model that writes the turn
await runEval({
	name: "topic-chat-tools",
	description: "topic chat tool calls",
	provider: topicChatToolsTurnWriter,
	grader: toRubricGrader(scoreModel()),
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
		materialLabel: "The conversation, as the turn was given it",
		material: topicChatToolsVariables,
	})
	return { description, vars: topicChatToolsVariables, assert: [toolCallAssertion, ...rubricAssertions] }
}

// fail the check unless the expected tool was called with the expected input and every other call was a search
function gradeToolCalls(turnOutput: string, expectedToolCall: TopicChatToolsCase["expectedToolCall"]): GradingResult {
	const { toolCalls } = JSON.parse(turnOutput) as TopicChatToolsTurn

	// a call to anything but the expected tool or a search fails the check
	const expectedToolName = expectedToolCall?.toolName
	const strayToolCall = toolCalls.find(
		(toolCall) => toolCall.toolName !== expectedToolName && toolCall.toolName !== SEARCH_TOOL_NAME,
	)
	if (strayToolCall) {
		return toGradingResult(`the turn called ${strayToolCall.toolName} with ${JSON.stringify(strayToolCall.input)}`)
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
