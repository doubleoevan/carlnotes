// the promptfoo eval of the new-topic chat. every case makes real calls on the local LiteLLM proxy.
// the calls cost real money, so the eval is never part of bun test. run it with: bun run eval:new-topic-chat
import type { Assertion, EvaluateResult, GradingResult, TestCase } from "promptfoo"
import { scoreModel } from "../../worker/models"
import { runEval, toGradingResult, toRubricAssertions, toRubricGrader } from "../evalHarness"
import { NEW_TOPIC_CHAT_CASES, type NewTopicChatCase } from "./newTopicChatCases"
import { type NewTopicChatTurn, newTopicChatTurnWriter } from "./newTopicChatProviders"

// turn web search off. a search returns "web search is not configured", so every case's turn reads only its own
// material
delete Bun.env.EXA_API_KEY

// what every rubric tells the grader about the chat turn's output
const OUTPUT_SHAPE_RUBRIC = [
	"The output is a JSON object for one turn of the chat in which Carl helps a reader make a topic.",
	"reply is what Carl wrote, toolCalls lists every tool the turn called in order, and topicDraft is the draft after the turn.",
	"draftTopic and createTopic are the only tools that save anything.",
].join(" ")

// the rubric that fails a reply that claims a save that no tool made
const CLAIMED_SAVE_RUBRIC = [
	"Fail the output if the reply says a change is saved or written and toolCalls has no draftTopic call that wrote it,",
	"or if the reply says the topic exists and toolCalls has no createTopic call.",
].join(" ")

// the rubric that fails a reply that does not talk like Carl
const VOICE_RUBRIC =
	"Fail the output if the reply opens with a greeting or with praise for the message, ends with a sign-off, or asks more than two questions."

// run every case. the grader is on a different model from the model that writes the turn
await runEval({
	name: "new-topic-chat",
	description: "new-topic chat turn",
	provider: newTopicChatTurnWriter,
	grader: toRubricGrader(scoreModel()),
	defaultAssertions: [],
	testCases: NEW_TOPIC_CHAT_CASES.map(toTestCase),
	toCaseLine,
})

// one promptfoo test for a case. its variables, its create, tool, and draft checks, and the rubrics over its chat turn
function toTestCase(newTopicChatCase: NewTopicChatCase): TestCase {
	const { description, isCreateExpected, expectedToolName, checkTopicDraft, rubric, ...newTopicChatVariables } =
		newTopicChatCase

	// the turn creates the topic if and only if the case expects a create, calls the tool that the case names,
	// and leaves the draft as the case expects
	const toolAssertions: Assertion[] = [
		{
			type: "javascript",
			metric: isCreateExpected ? "creates the topic" : "creates no topic",
			value: (turnOutput: string) => gradeCreateCall(turnOutput, isCreateExpected),
		},
		...(expectedToolName
			? [
					{
						type: "javascript" as const,
						metric: `calls ${expectedToolName}`,
						value: (turnOutput: string): GradingResult => {
							const isExpectedToolCalled = toNewTopicChatTurn(turnOutput).toolCalls.some(
								(toolCall) => toolCall.toolName === expectedToolName,
							)
							return toGradingResult(isExpectedToolCalled ? undefined : `the turn made no ${expectedToolName} call`)
						},
					},
				]
			: []),
		...(checkTopicDraft
			? [
					{
						type: "javascript" as const,
						metric: "the draft holds what the user chose",
						value: (turnOutput: string): GradingResult =>
							toGradingResult(checkTopicDraft(toNewTopicChatTurn(turnOutput).topicDraft)),
					},
				]
			: []),
	]

	// the claimed save and voice rubrics, plus the case's own rubric, each with the conversation and the draft after it
	const rubricAssertions = toRubricAssertions({
		outputShapeRubric: OUTPUT_SHAPE_RUBRIC,
		caseRubrics: [
			{ metric: "claims no save that no tool made", rubric: CLAIMED_SAVE_RUBRIC },
			{ metric: "sounds like Carl", rubric: VOICE_RUBRIC },
			{ metric: description, rubric },
		],
		materialLabel: "The conversation and the draft, as the turn was given them",
		material: newTopicChatVariables,
	})
	return { description, vars: newTopicChatVariables, assert: [...toolAssertions, ...rubricAssertions] }
}

// fail the check unless the turn called createTopic once if a create is expected, and never otherwise
function gradeCreateCall(turnOutput: string, isCreateExpected: boolean): GradingResult {
	const { toolCalls } = toNewTopicChatTurn(turnOutput)
	const createCallCount = toolCalls.filter((toolCall) => toolCall.toolName === "createTopic").length
	const expectedCreateCallCount = isCreateExpected ? 1 : 0
	return toGradingResult(
		createCallCount === expectedCreateCallCount ? undefined : `the turn called createTopic ${createCallCount} times`,
	)
}

// a case's tool calls in order, and what the turn cost
function toCaseLine(turnOutput: string, evaluateResult: EvaluateResult): string {
	const toolNames = toNewTopicChatTurn(turnOutput).toolCalls.map((toolCall) => toolCall.toolName)
	return `tools: ${toolNames.join(", ") || "none"}, $${(evaluateResult.cost ?? 0).toFixed(4)} to write`
}

// the turn's JSON output read back into its reply, tool calls, and draft
function toNewTopicChatTurn(turnOutput: string): NewTopicChatTurn {
	return JSON.parse(turnOutput) as NewTopicChatTurn
}
