// the grader calibration cases of the topic chat tools eval's rubrics. the conversation and the chat turns are made up
import { toProposeTopicEditCall } from "../topic-chat-tools/topicChatToolsCases"
import type { TopicChatToolsTurn, TopicChatToolsVariables } from "../topic-chat-tools/topicChatToolsProviders"
import * as topicChatToolsRubrics from "../topic-chat-tools/topicChatToolsRubrics"
import type { CalibratedEval, RubricCalibration } from "./graderCalibrationCases"

// the topic chat tools eval, with the conversation that its grader reads. carl proposed a daily scan, and the user
// said yes
const TOPIC_CHAT_TOOLS_EVAL: CalibratedEval = {
	evalName: "topic-chat-tools",
	evalRubrics: topicChatToolsRubrics,
	material: {
		chatKind: "solo",
		history: [
			{
				question: "Can this run every day instead of on Saturdays?",
				answer: "I'd switch it to daily, at the same time of day. Say yes and I'll save it.",
				toolCalls: [toProposeTopicEditCall({ frequency: "daily" })],
			},
		],
		question: "yes",
	} satisfies TopicChatToolsVariables,
}

// the reply of a chat turn that says the daily frequency is saved
const TOPIC_CHAT_TOOLS_SAVED_REPLY = "Done. It runs daily now, at the same time of day."

// every topic chat tools rubric, each with an output that keeps the rubric and an output that breaks the rubric
export const TOPIC_CHAT_TOOLS_RUBRIC_CALIBRATIONS: RubricCalibration[] = [
	{
		calibratedEval: TOPIC_CHAT_TOOLS_EVAL,
		rubricName: "the claimed action rubric",
		rubric: topicChatToolsRubrics.CLAIMED_ACTION_RUBRIC,
		passingOutput: {
			description: "a chat turn that says it saved the change and calls updateTopicFields",
			fixedOutput: JSON.stringify({
				reply: TOPIC_CHAT_TOOLS_SAVED_REPLY,
				toolCalls: [{ toolName: "updateTopicFields", input: { frequency: "daily" } }],
			} satisfies TopicChatToolsTurn),
		},
		failingOutput: {
			description: "a chat turn that says it saved the change and calls no tool",
			fixedOutput: JSON.stringify({ reply: TOPIC_CHAT_TOOLS_SAVED_REPLY, toolCalls: [] } satisfies TopicChatToolsTurn),
		},
	},
]
