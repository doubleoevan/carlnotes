// the grader calibration cases of the attachment summaries eval's rubrics, on a made-up image, document, and notes.
// the support rubric is calibrated on the image and the key facts rubric on the document, each with its kind's material
import type { AttachmentSummariesVariables } from "../attachment-summaries/attachmentSummariesProviders"
import * as attachmentSummariesRubrics from "../attachment-summaries/attachmentSummariesRubrics"
import type { CalibratedEval, RubricCalibration } from "./graderCalibrationCases"

// a sign of white text on dark green, with a heading, a coffee, its tasting notes, and its price
const POUR_OVER_SIGN_SVG = [
	`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" font-family="Arial, Helvetica, sans-serif">`,
	`<rect width="600" height="400" fill="#1e4620"/>`,
	`<text x="300" y="90" font-size="40" font-weight="bold" text-anchor="middle" fill="#ffffff">Today's pour-over</text>`,
	`<text x="300" y="190" font-size="32" text-anchor="middle" fill="#ffffff">Kenya Nyeri AA</text>`,
	`<text x="300" y="250" font-size="24" text-anchor="middle" fill="#ffffff">Blackcurrant and grapefruit</text>`,
	`<text x="300" y="330" font-size="36" font-weight="bold" text-anchor="middle" fill="#ffffff">$5.50</text>`,
	`</svg>`,
].join("\n")

// the attachment summaries eval, with the sign's markup that its grader reads
const IMAGE_ATTACHMENT_SUMMARIES_EVAL = await toAttachmentSummariesEval({
	attachmentKind: "image",
	imageSvg: POUR_OVER_SIGN_SVG,
})

// the lines of notes on the sign that keep the support rubric.
// the rubric allows lines that name the kind of attachment and describe its look and layout, as these lines do
const SIGN_NOTE_LINES = [
	"An image of white text, centered on a dark green background.",
	'- The heading, in bold at the top: "Today\'s pour-over"',
	'- Below it: "Kenya Nyeri AA"',
	'- In smaller text under that: "Blackcurrant and grapefruit"',
	'- At the bottom, in bold: "$5.50"',
]

// a roastery's cupping notes, with four scores, a decision, and a next step
const CUPPING_NOTES_TEXT = `Cupping notes, October 2, 2026
Cuppers: Priya (operations), Lena (head roaster)

Samples
- Kenya Nyeri AA, roasted September 30: 87 points, the highest of the four samples. Blackcurrant and grapefruit.
- Guatemala Huehuetenango, roasted September 30: 85 points. Red apple and caramel.
- Ethiopia Guji, roasted October 1: 84 points. Peach and black tea, a little thin.
- Brazil Cerrado, roasted October 1: 82 points. Flat at the lighter roast.

Decision
- Buy two bags of the Kenya Nyeri AA for the holiday menu.

Next steps
- Lena roasts the Brazil Cerrado one minute longer and cups it again on October 9.`

// the attachment summaries eval, with the prompt that includes the cupping notes, in the form that the eval's grader reads
const DOCUMENT_ATTACHMENT_SUMMARIES_EVAL = await toAttachmentSummariesEval({
	attachmentKind: "document",
	documentText: CUPPING_NOTES_TEXT,
})

// the facts from the cupping notes that a user needs
const CUPPING_KEY_FACTS = [
	"The Kenya Nyeri AA scored 87 points, the highest of the four samples.",
	"The decision: buy two bags of the Kenya Nyeri AA for the holiday menu.",
	"The Brazil Cerrado is roasted one minute longer and cupped again on October 9.",
]

// the summary lines of the cupping notes, then its decision line and its next-step line. the three together keep
// every key fact and the Brazil Cerrado's score too. the rubric allows an extra fact
const CUPPING_SUMMARY_LINES = [
	"Cupping notes from October 2, 2026, scoring four coffee samples.",
	"- The Kenya Nyeri AA scored highest, at 87 points.",
	"- The Brazil Cerrado scored lowest, at 82, and tasted flat at the lighter roast.",
]
const CUPPING_DECISION_LINE = "- Decision: buy two bags of the Kenya Nyeri AA for the holiday menu."
const CUPPING_NEXT_STEP_LINE =
	"- Next, Lena roasts the Brazil Cerrado one minute longer and cups it again on October 9."

// every attachment summaries rubric, each with an output that keeps the rubric and an output that breaks the rubric
export const ATTACHMENT_SUMMARIES_RUBRIC_CALIBRATIONS: RubricCalibration[] = [
	{
		calibratedEval: IMAGE_ATTACHMENT_SUMMARIES_EVAL,
		rubricName: "the support rubric",
		rubric: attachmentSummariesRubrics.SUPPORT_RUBRIC,
		passingOutput: {
			description: "notes on an image that describe its look and quote only its text",
			fixedOutput: SIGN_NOTE_LINES.join("\n"),
		},
		failingOutput: {
			description: "notes on an image that quote a line of text that the image does not have",
			fixedOutput: [...SIGN_NOTE_LINES, '- Under the price, in small text: "Free refills before 10 am"'].join("\n"),
		},
	},
	{
		calibratedEval: DOCUMENT_ATTACHMENT_SUMMARIES_EVAL,
		rubricName: "the key facts rubric",
		rubric: attachmentSummariesRubrics.toKeyFactsRubric(CUPPING_KEY_FACTS),
		passingOutput: {
			description: "notes on a document that keep every key fact and one more",
			fixedOutput: [...CUPPING_SUMMARY_LINES, CUPPING_DECISION_LINE, CUPPING_NEXT_STEP_LINE].join("\n"),
		},
		failingOutput: {
			description: "notes on a document that leave out its decision",
			fixedOutput: [...CUPPING_SUMMARY_LINES, CUPPING_NEXT_STEP_LINE].join("\n"),
		},
	},
]

// the attachment summaries eval for one attachment.
// the output's shape and the material's label of its kind, and the attachment in the form that the eval's grader reads
async function toAttachmentSummariesEval(
	attachmentSummariesVariables: AttachmentSummariesVariables,
): Promise<CalibratedEval> {
	const { attachmentKind } = attachmentSummariesVariables
	return {
		evalName: "attachment-summaries",
		evalRubrics: {
			GRADER_MODEL: attachmentSummariesRubrics.GRADER_MODEL,
			OUTPUT_SHAPE_RUBRIC: attachmentSummariesRubrics.OUTPUT_SHAPE_RUBRICS[attachmentKind],
			MATERIAL_LABEL: attachmentSummariesRubrics.MATERIAL_LABELS[attachmentKind],
		},
		material: await attachmentSummariesRubrics.toAttachmentSummariesMaterial(attachmentSummariesVariables),
	}
}
