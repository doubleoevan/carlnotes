// the Topic Post chat eval's grader and rubrics, and the label of the question and the post after each rubric
import { scoreModel } from "@carlnotes/models/models"

// the model that grades every rubric
export const GRADER_MODEL = scoreModel()

// what every rubric tells the grader about the answer
export const OUTPUT_SHAPE_RUBRIC =
	"The output is Carl's reply in a private chat to a reader's question, asked from the page of a post that another person wrote. Carl is given the post and the Comments readers shared on it."

// the label of the question and the post after each rubric
export const MATERIAL_LABEL =
	"The question and the post it was asked about, with its shared Comments, as the reply's writer was given them"

// the rubric that fails a reply that states what the post and its Comments do not
export const FAITHFUL_RUBRIC = [
	"What the reply reports as coming from the post or from a Comment is what the post or the Comment says.",
	"Fail the output if it attributes a fact, a number, or a view to the post or to a commenter that the material below does not hold.",
	"Never fail the output for Carl's own view or outside knowledge that the reply marks as his own.",
	"Carl also reads the topic's findings and sources, which are not shown below, so never fail the output for a fact it gives about the topic and does not attribute to the post or to a commenter.",
].join(" ")
