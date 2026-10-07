// the grader calibration cases of the new-topic chat eval's rubrics. the user's message, the draft, and the chat
// turns are made up
import { EMPTY_TOPIC_DRAFT, type TopicDraft } from "@shared/contracts"
import type { NewTopicChatTurn, NewTopicChatVariables } from "../new-topic-chat/newTopicChatProviders"
import * as newTopicChatRubrics from "../new-topic-chat/newTopicChatRubrics"
import type { CalibratedEval, RubricCalibration } from "./graderCalibrationCases"

// the new-topic chat eval, with the user's first message and the empty draft that its grader reads
const NEW_TOPIC_CHAT_EVAL: CalibratedEval = {
	evalName: "new-topic-chat",
	evalRubrics: newTopicChatRubrics,
	material: {
		history: [],
		topicDraft: EMPTY_TOPIC_DRAFT,
		question: "I want to follow home espresso gear. I grind before my kids wake up, so quiet grinders matter most.",
	} satisfies NewTopicChatVariables,
}

// the draft that a new-topic chat turn writes from the user's first message,
// the reply that says the draft is written and asks one question, and the passing output built from the draft and the reply
const FIRST_TURN_TOPIC_DRAFT: TopicDraft = {
	...EMPTY_TOPIC_DRAFT,
	name: "Quiet home espresso",
	prompt:
		"Home espresso gear and technique, with quiet grinders first, since I grind before my kids wake up. Skip commercial machines.",
}
const NEW_TOPIC_CHAT_DRAFTED_REPLY = `I wrote a title and a prompt to the draft. Title: ${FIRST_TURN_TOPIC_DRAFT.name}. Prompt: ${FIRST_TURN_TOPIC_DRAFT.prompt} Want me to find sources for it?`
const PASSING_NEW_TOPIC_CHAT_OUTPUT = toNewTopicChatOutput(NEW_TOPIC_CHAT_DRAFTED_REPLY)

// every new-topic chat rubric, each with an output that keeps the rubric and an output that breaks the rubric
export const NEW_TOPIC_CHAT_RUBRIC_CALIBRATIONS: RubricCalibration[] = [
	{
		calibratedEval: NEW_TOPIC_CHAT_EVAL,
		rubricName: "the claimed save rubric",
		rubric: newTopicChatRubrics.CLAIMED_SAVE_RUBRIC,
		passingOutput: {
			description: "a new-topic chat turn that says it wrote the draft and calls draftTopic",
			fixedOutput: PASSING_NEW_TOPIC_CHAT_OUTPUT,
		},
		failingOutput: {
			description: "a new-topic chat turn that says it wrote the draft and calls no tool",
			fixedOutput: JSON.stringify({
				reply: NEW_TOPIC_CHAT_DRAFTED_REPLY,
				toolCalls: [],
				topicDraft: EMPTY_TOPIC_DRAFT,
			} satisfies NewTopicChatTurn),
		},
	},
	{
		calibratedEval: NEW_TOPIC_CHAT_EVAL,
		rubricName: "the voice rubric",
		rubric: newTopicChatRubrics.VOICE_RUBRIC,
		passingOutput: {
			description: "a new-topic chat turn that asks one question",
			fixedOutput: PASSING_NEW_TOPIC_CHAT_OUTPUT,
		},
		failingOutput: {
			description: "a new-topic chat turn that asks three questions",
			fixedOutput: toNewTopicChatOutput(
				`${NEW_TOPIC_CHAT_DRAFTED_REPLY} Should anyone else see it? Do you want it on a team?`,
			),
		},
	},
]

// a new-topic chat turn as the turn's JSON output. the reply that a case gives, with the draftTopic call that wrote
// the draft and the draft after the call
function toNewTopicChatOutput(reply: string): string {
	const newTopicChatTurn: NewTopicChatTurn = {
		reply,
		toolCalls: [
			{ toolName: "draftTopic", input: { name: FIRST_TURN_TOPIC_DRAFT.name, prompt: FIRST_TURN_TOPIC_DRAFT.prompt } },
		],
		topicDraft: FIRST_TURN_TOPIC_DRAFT,
	}
	return JSON.stringify(newTopicChatTurn)
}
