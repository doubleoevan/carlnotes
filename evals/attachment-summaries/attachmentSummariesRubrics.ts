// the attachment summaries eval's grader and rubrics, and the attachment that the grader reads after each rubric.
// the output's shape and the material's label depend on the attachment's kind
import { buildContextPrompt } from "../../worker/attach"
import { scoreModel } from "../../worker/models"
import type { AttachmentSummariesVariables } from "./attachmentSummariesProviders"

// the kinds of attachment that the writers summarize: document, image
type AttachmentKind = AttachmentSummariesVariables["attachmentKind"]

// the model that grades every rubric
export const GRADER_MODEL = scoreModel()

// what every rubric tells the grader about the writer's output, by the attachment's kind
export const OUTPUT_SHAPE_RUBRICS: Record<AttachmentKind, string> = {
	document:
		"The output is notes on a document that a reader attached to one of their topics. The notes say what the document is about, with its key facts and themes, as context for search and review.",
	image:
		"The output is notes on an image that a reader attached in a chat. The notes describe what the image shows and any text it contains, as standalone context for later chat turns that never see the image.",
}

// the label of the attachment after each rubric, by the attachment's kind
export const MATERIAL_LABELS: Record<AttachmentKind, string> = {
	document: "The prompt that the notes' writer was given, with the document between its untrusted-data markers",
	image: "The image that the notes' writer was given, as the SVG markup it was drawn from",
}

// the rubric that fails a summary for stating anything that the attachment does not show
export const SUPPORT_RUBRIC = [
	"Every fact the notes state is in the attachment below.",
	"Fail the output if it states a fact, a number, a name, a date, or a detail that the attachment does not have, or one that contradicts it.",
	"Never fail the output for naming what kind of attachment it is, for describing its look or layout as the attachment shows it, for plain reasoning over what it says, or for reporting an instruction that it contains.",
].join(" ")

/**
 * Returns the rubric that fails a summary that leaves out or gets wrong a fact that a user needs.
 */
export function toKeyFactsRubric(keyFacts: string[]): string {
	// list each key fact on its own line
	const keyFactLines = keyFacts.map((keyFact) => `- ${keyFact}`).join("\n")
	return [
		`A reader needs these facts from the attachment, and the notes keep each one, in any wording:\n${keyFactLines}`,
		"Fail the output if it leaves out one of these facts or gets one wrong. Never fail the output for keeping other facts too.",
	].join("\n")
}

/**
 * Returns what an attachment's writer was given, in the form that the grader reads.
 */
export async function toAttachmentSummariesMaterial(
	attachmentSummariesVariables: AttachmentSummariesVariables,
): Promise<string> {
	// an image's writer was given the drawn image, which the grader reads as the markup that the image was drawn from
	if (attachmentSummariesVariables.attachmentKind === "image") {
		return attachmentSummariesVariables.imageSvg
	}

	// a document's writer was given the prompt that includes the document, cut where the app cuts a long document
	const contextPrompt = await buildContextPrompt(attachmentSummariesVariables.documentText)
	return contextPrompt.prompt
}
