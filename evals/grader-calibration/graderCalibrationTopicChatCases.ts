// the grader calibration cases of the topic chat eval's rubrics. the finding is the eval's own, and the chat replies
// are made up
import { QUIET_BURR_SET_FINDING, TOPIC_CHAT_CONTEXT } from "../topic-chat/topicChatCases"
import type { TopicChatVariables } from "../topic-chat/topicChatProviders"
import * as topicChatRubrics from "../topic-chat/topicChatRubrics"
import type { CalibratedEval, RubricCalibration } from "./graderCalibrationCases"

// the question and the topic material that the topic chat eval's grader reads
const TOPIC_CHAT_MATERIAL: TopicChatVariables = {
	question: "I want a quieter grinder. Anything new?",
	chatContext: { ...TOPIC_CHAT_CONTEXT, findings: [QUIET_BURR_SET_FINDING], scanSummaries: [] },
}

// the topic chat eval, with the question and the topic material that its grader reads
const TOPIC_CHAT_EVAL: CalibratedEval = {
	evalName: "topic-chat",
	evalRubrics: topicChatRubrics,
	material: TOPIC_CHAT_MATERIAL,
}

// the same eval on a spoken question, whose reply is read aloud to the reader
const SPOKEN_TOPIC_CHAT_EVAL: CalibratedEval = {
	...TOPIC_CHAT_EVAL,
	material: {
		...TOPIC_CHAT_MATERIAL,
		question: "Hey Carl, is there anything new on quieter grinders?",
		isSpoken: true,
	} satisfies TopicChatVariables,
}

// the paragraphs of a chat reply that keeps every topic chat rubric. the reply answers first,
// credits the finding only with what the finding says, and marks the fact from outside the findings
const TOPIC_CHAT_REPLY_PARAGRAPH =
	"Yes. [A quieter burr set for home grinders](https://burrnotes.example/quiet-burrs) is the one: Tamber says its new 64 millimeter burrs run at 62 decibels at one meter, about a third quieter than its old set, and they ship in March for $89."
const TOPIC_CHAT_OUTSIDE_PARAGRAPH =
	"From my own knowledge, not the findings, a rubber mat under the grinder takes a little more edge off the noise."
const PASSING_TOPIC_CHAT_REPLY = [TOPIC_CHAT_REPLY_PARAGRAPH, TOPIC_CHAT_OUTSIDE_PARAGRAPH].join("\n\n")

// a spoken answer that keeps the spoken rubric. a few short sentences, with nothing read aloud as a list or a link
const SPOKEN_TOPIC_CHAT_REPLY =
	"Yes, and it's the one for you. Tamber just put out a 64 millimeter burr set that runs about a third quieter than the old one, 62 decibels at one meter. It drops into the Model S with no other changes, and it ships in March for $89."

// every topic chat rubric, each with an output that keeps the rubric and an output that breaks the rubric
export const TOPIC_CHAT_RUBRIC_CALIBRATIONS: RubricCalibration[] = [
	{
		calibratedEval: TOPIC_CHAT_EVAL,
		rubricName: "the support rubric",
		rubric: topicChatRubrics.SUPPORT_RUBRIC,
		passingOutput: {
			description: "a chat reply that marks the fact from outside the findings",
			fixedOutput: PASSING_TOPIC_CHAT_REPLY,
		},
		failingOutput: {
			description: "a chat reply that credits the finding with a fact that it does not have",
			fixedOutput: [
				`${TOPIC_CHAT_REPLY_PARAGRAPH} The finding also says they grind twice as fast as the old set.`,
				TOPIC_CHAT_OUTSIDE_PARAGRAPH,
			].join("\n\n"),
		},
	},
	{
		calibratedEval: TOPIC_CHAT_EVAL,
		rubricName: "the opening rubric",
		rubric: topicChatRubrics.OPENING_RUBRIC,
		passingOutput: {
			description: "a chat reply that opens by answering the question",
			fixedOutput: PASSING_TOPIC_CHAT_REPLY,
		},
		failingOutput: {
			description: "a chat reply that opens with praise for the question",
			fixedOutput: [`Great question! ${TOPIC_CHAT_REPLY_PARAGRAPH}`, TOPIC_CHAT_OUTSIDE_PARAGRAPH].join("\n\n"),
		},
	},
	{
		calibratedEval: SPOKEN_TOPIC_CHAT_EVAL,
		rubricName: "the spoken rubric",
		rubric: topicChatRubrics.SPOKEN_RUBRIC,
		passingOutput: {
			description: "a spoken answer of a few short sentences",
			fixedOutput: SPOKEN_TOPIC_CHAT_REPLY,
		},
		failingOutput: {
			description: "a spoken answer that reads a list and a link aloud",
			fixedOutput: [
				"Here's what's new on quiet grinders:",
				[
					"- [A quieter burr set for home grinders](https://burrnotes.example/quiet-burrs): 64 millimeter burrs at 62 decibels, about a third quieter",
					"- Fits the Model S with no other changes",
					"- Ships in March for $89",
				].join("\n"),
			].join("\n\n"),
		},
	},
]
