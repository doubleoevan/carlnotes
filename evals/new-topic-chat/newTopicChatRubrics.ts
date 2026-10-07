// the new-topic chat eval's grader and rubrics, and the label of the conversation and the draft after each rubric
import { scoreModel } from "../../worker/models"

// the model that grades every rubric
export const GRADER_MODEL = scoreModel()

// what every rubric tells the grader about the chat turn's output
export const OUTPUT_SHAPE_RUBRIC = [
	"The output is a JSON object for one turn of the chat in which Carl helps a reader make a topic.",
	"reply is what Carl wrote, toolCalls lists every tool the turn called in order, and topicDraft is the draft after the turn.",
	"draftTopic and createTopic are the only tools that save anything.",
].join(" ")

// the label of the conversation and the draft after each rubric
export const MATERIAL_LABEL = "The conversation and the draft, as the turn was given them"

// the rubric that fails a reply that claims a save that no tool made
export const CLAIMED_SAVE_RUBRIC = [
	"Fail the output if the reply says a change is saved or written and toolCalls has no draftTopic call that wrote it,",
	"or if the reply says the topic exists and toolCalls has no createTopic call.",
].join(" ")

// the rubric that fails a reply that does not talk like Carl
export const VOICE_RUBRIC =
	"Fail the output if the reply opens with a greeting or with praise for the message, ends with a sign-off, or asks more than two questions."
