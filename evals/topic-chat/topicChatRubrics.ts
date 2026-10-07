// the topic chat eval's grader and rubrics, and the label of the question and the topic material after each rubric
import { scoreModel } from "../../worker/models"

// the model that grades every rubric
export const GRADER_MODEL = scoreModel()

// what every rubric tells the grader about the reply
export const OUTPUT_SHAPE_RUBRIC =
	"The output is Carl's chat reply to a reader's question about one of their topics. Carl answers from the topic's findings and from his own knowledge."

// the label of the question and the topic material after each rubric
export const MATERIAL_LABEL = "The question and the topic material, as the reply's writer was given them"

// the rubric that fails a reply for crediting the findings with what the findings do not say
export const SUPPORT_RUBRIC = toChatSupportRubric("topic")

/**
 * Returns the support rubric of a chat that reads the topic material or the team material.
 */
export function toChatSupportRubric(materialKind: "topic" | "team"): string {
	return [
		`Everything the reply credits to the findings is in the ${materialKind} material below.`,
		"Fail the output if it credits the findings with a fact the material does not have, or if it states a fact from outside the material without marking that it comes from outside the findings.",
		"Never fail the output for Carl's reactions or opinions, or for everyday reasoning about what the findings say.",
	].join(" ")
}

// the rubric that fails a reply that does not open by answering the question
export const OPENING_RUBRIC =
	"The reply opens by answering the question. Fail the output if it opens with a greeting or with praise for the question, or ends with a sign-off."
