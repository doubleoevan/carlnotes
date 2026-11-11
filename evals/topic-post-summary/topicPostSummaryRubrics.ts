// the Topic Post summary eval's grader and rubrics, and the label of the post after each rubric
import { chatModel } from "@carlnotes/models/models"

// the model that grades every rubric
export const GRADER_MODEL = chatModel()

// what every rubric tells the grader about the writer's output
export const OUTPUT_SHAPE_RUBRIC =
	"The output is a short summary of a post that a person wrote about a topic. It shows in the post's info popup and in its link preview, for a reader deciding whether to open the post."

// the label of the post after each rubric
export const MATERIAL_LABEL = "The post's title and body, as the summary's writer was given them"

// the rubric that fails a summary that adds to the post or misstates it
export const FAITHFUL_RUBRIC = [
	"The summary says only what the post says.",
	"Fail the output if it states a fact, a number, or a conclusion that the post does not state, or contradicts the post.",
	"Fail the output if it gives an opinion of the post, praises it, or addresses the reader with a question or a call to do something.",
].join(" ")

// the rubric that fails a summary that talks about the post instead of its subject
export const SUBJECT_RUBRIC = [
	"The summary is about the post's subject, in the third person.",
	'Fail the output if it refers to "the post", "this post", "the article", "the author", or "the writer".',
	"Never fail the output for naming a person or a thing the post itself names.",
].join(" ")

/**
 * Returns the rubric that fails a summary missing any of a case's key facts.
 */
export function toKeyFactsRubric(keyFacts: string[]): string {
	return [
		"The summary keeps each of these facts from the post, in any wording:",
		...keyFacts.map((keyFact) => `- ${keyFact}`),
		"Fail the output if any one of them is missing or wrong.",
	].join("\n")
}
