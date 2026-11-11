// the Topic Post Discussion eval's grader and rubrics, and the label of the material after each rubric
import { chatModel } from "@carlnotes/models/models"

// the model that grades every rubric
export const GRADER_MODEL = chatModel()

// what every rubric tells the grader about the writer's output
export const OUTPUT_SHAPE_RUBRIC =
	"The output is the script of a short recorded conversation between two podcast hosts, Carl and Vienna, about a post that a person wrote. Each line is one host's turn, starting with the host's name."

// the label of the material after each rubric
export const MATERIAL_LABEL =
	"The post's title, body, and author, the Comments the hosts were given, and the note that steers them, as the script's writer was given them"

// the rubric that fails a script that adds to the post or misstates it
export const FAITHFUL_RUBRIC = [
	"The hosts state as fact only what the post or a Comment says.",
	"Fail the output if a host states a number, a quote, or a claim as coming from the post or a Comment that the post or the Comment does not state, or contradicts either.",
	"Never fail the output for a host's own reaction, opinion, joke, or question that is clearly the host's own.",
].join(" ")

// the rubric that fails a script that does not read as two hosts talking about this post
export const CONVERSATION_RUBRIC = [
	"The script is a conversation: the hosts answer each other, and both add something about the post.",
	"Fail the output if one host only agrees or only asks questions, if the hosts summarize the post paragraph by paragraph with no reaction, or if the script introduces itself as a podcast episode with a cold open, chapters, or a sign-off that names a show.",
].join(" ")

/**
 * Returns the rubric that fails a script missing any of a case's key facts.
 */
export function toKeyFactsRubric(keyFacts: string[]): string {
	return [
		"The conversation covers each of these facts from the post, in any wording:",
		...keyFacts.map((keyFact) => `- ${keyFact}`),
		"Fail the output if any one of them is missing or wrong.",
	].join("\n")
}
