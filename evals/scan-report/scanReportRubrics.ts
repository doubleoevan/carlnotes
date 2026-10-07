// the scan report eval's grader and rubrics, and the scan data that the grader reads after each rubric
import { newBudget } from "../../worker/budget"
import { chatModel } from "../../worker/models"
import { toCostLine } from "../../worker/review/summarize"
import { emptyReviewOutcome, type FilterReason } from "../../worker/review/track"
import type { ScanReportVariables } from "./scanReportProviders"

// the model that grades every rubric
export const GRADER_MODEL = chatModel()

// what every rubric tells the grader about the writer's output
export const OUTPUT_SHAPE_RUBRIC =
	"The output is Carl's note for one content scan of a reader's topic, shown on the topic's page under a heading that already names it."

// the label of the scan data after each rubric
export const MATERIAL_LABEL = "Scan data, as the note's writer was given it"

// the rubric that fails a report for stating anything that the scan data does not support
export const SUPPORT_RUBRIC = [
	"Every finding, count, source, and trend the note states is in the scan data below.",
	"Fail the output if it states a finding, a count, a source, or a trend that the scan data does not have, or one that contradicts it.",
	"Never fail the output for Carl's own voice or reactions, or for a plain judgment about whether the scan answered what the reader asked.",
].join(" ")

// the rubric that fails a report that reads like a form letter.
// the numbers line and the findings list are the report's format
export const VOICE_RUBRIC = [
	"The note is Carl's, in short plain sentences.",
	"Its format is the gist, a numbers line that may have a bold label such as **The numbers:**, a line on whether the scan answered the topic, and a Findings list of links if the scan kept findings. Never fail the output for that format.",
	"Fail the output if it opens with a greeting, ends with a sign-off, calls Carl by name as if someone else wrote it, nags or guilt-trips the reader, or reads like a form letter.",
].join(" ")

// the rubric that fails a report whose parts are out of the prompt's order
export const ORDER_RUBRIC = [
	"The note goes in this order: the gist, then the numbers line, then any details, then the line on whether the scan answered the topic, then the Findings list.",
	"Any part may be left out: the prompt lets the note skip the numbers line or the details, and the Findings list is left out if the scan kept nothing.",
	"Fail the output only if a part it has is out of that order. Never fail it for a part it left out.",
].join(" ")

// the scan data that the grader reads. a case's variables with every filter reason's count, the review failure count,
// the date, and the cost line
type ScanReportMaterial = Omit<ScanReportVariables, "filteredCounts"> & {
	filteredCounts: Record<FilterReason, number>
	failedDuringReviewCount: number
	date: string
	costLine: string
}

/**
 * Returns the scan data that the grader reads for a case, in the form that the writer was given.
 */
export function toScanReportMaterial(scanReportVariables: ScanReportVariables): ScanReportMaterial {
	return {
		...scanReportVariables,
		filteredCounts: { ...emptyReviewOutcome().filteredCounts, ...scanReportVariables.filteredCounts },
		failedDuringReviewCount: 0,
		date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
		costLine: toCostLine(newBudget()),
	}
}
