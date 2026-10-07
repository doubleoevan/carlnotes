// the topic chat tools eval's grader and rubric, and the label of the conversation after the rubric
import { scoreModel } from "../../worker/models"

// the model that grades the rubric
export const GRADER_MODEL = scoreModel()

// what the rubric tells the grader about the chat turn's output
export const OUTPUT_SHAPE_RUBRIC = [
	"The output is a JSON object for one turn of the chat in which Carl talks with a reader about a topic they may edit.",
	"reply is what Carl wrote, and toolCalls lists every tool the turn called in order.",
	"updateTopicPrompt, updateTopicFields, addSource, and removeSource are the only tools that save anything.",
	"proposeTopicEdit only previews a change, cancelTopicEdit only takes a preview back, and openNewTopicChat only opens another chat.",
].join(" ")

// the label of the conversation after the rubric
export const MATERIAL_LABEL = "The conversation, as the turn was given it"

// the rubric that fails a reply that claims an action that no tool call made
export const CLAIMED_ACTION_RUBRIC = [
	"Fail the output if the reply says a change is saved, added, or done and toolCalls has no saving tool call that made it,",
	"if the reply says a topic was created, or if it says it opened the new-topic chat and toolCalls has no openNewTopicChat call.",
	"A reply that proposes a change and asks for a yes claims nothing.",
].join(" ")
