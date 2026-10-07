// the promptfoo eval of the attachment summary writers, which makes real model calls.
// run the eval with: bun run eval:attachment-summaries
import type { Assertion, AssertionValueFunctionContext, EvaluateResult, GradingResult, TestCase } from "promptfoo"
import { chatModel, cheapModel } from "../../worker/models"
import { runEval, toGradingResult, toRubricAssertions, toRubricGrader } from "../evalHarness"
import { toWordCount } from "../evalLabels"
import {
	ATTACHMENT_SUMMARIES_CASES,
	type AttachmentSummariesCase,
	type DocumentAttachment,
} from "./attachmentSummariesCases"
import { type AttachmentSummariesVariables, attachmentSummariesWriter } from "./attachmentSummariesProviders"
import {
	GRADER_MODEL,
	MATERIAL_LABELS,
	OUTPUT_SHAPE_RUBRICS,
	SUPPORT_RUBRIC,
	toAttachmentSummariesMaterial,
	toKeyFactsRubric,
} from "./attachmentSummariesRubrics"

// the checks that every case gets and that need no model
const DETERMINISTIC_ASSERTIONS: Assertion[] = [{ type: "javascript", metric: "is not empty", value: gradeNotEmpty }]

// the check that a document's summary runs shorter than the document. an image's description has no length limit
const DOCUMENT_LENGTH_ASSERTION: Assertion = {
	type: "javascript",
	metric: "runs shorter than the document",
	value: gradeDocumentLength,
}

// run every case. the grader is on a different model from both models that write the summaries
await runEval({
	name: "attachment-summaries",
	description: "attachment summary writers",
	provider: attachmentSummariesWriter,
	writerModels: [cheapModel(), chatModel()],
	grader: toRubricGrader(GRADER_MODEL),
	gatePassRate: 0.9,
	defaultAssertions: DETERMINISTIC_ASSERTIONS,
	testCases: await Promise.all(ATTACHMENT_SUMMARIES_CASES.map(toTestCase)),
	toCaseLine,
})

// one promptfoo test for a case. its variables, a document's length check, and the rubrics over its attachment
async function toTestCase(attachmentSummariesCase: AttachmentSummariesCase): Promise<TestCase> {
	const { description, keyFacts, rubric, ...attachmentSummariesVariables } = attachmentSummariesCase

	// the support and key facts rubrics, plus the case's own rubric, each with what the writer was given after the rubric
	const rubricAssertions = toRubricAssertions({
		outputShapeRubric: OUTPUT_SHAPE_RUBRICS[attachmentSummariesCase.attachmentKind],
		caseRubrics: [
			{ metric: "says only what the attachment shows", rubric: SUPPORT_RUBRIC },
			{ metric: "keeps the key facts", rubric: toKeyFactsRubric(keyFacts) },
			...(rubric ? [{ metric: description, rubric }] : []),
		],
		materialLabel: MATERIAL_LABELS[attachmentSummariesCase.attachmentKind],
		material: await toAttachmentSummariesMaterial(attachmentSummariesCase),
	})

	// a document's summary also has to run shorter than the document
	const lengthAssertions = attachmentSummariesCase.attachmentKind === "document" ? [DOCUMENT_LENGTH_ASSERTION] : []
	return { description, vars: attachmentSummariesVariables, assert: [...lengthAssertions, ...rubricAssertions] }
}

// fail the check if the summary is empty
function gradeNotEmpty(summaryText: string): GradingResult {
	return toGradingResult(summaryText.trim() ? undefined : "the summary is empty")
}

// fail the check if a document's summary runs as long as the document or longer
function gradeDocumentLength(summaryText: string, context: AssertionValueFunctionContext): GradingResult {
	// count the summary's words and the document's
	const { documentText } = context.vars as DocumentAttachment
	const summaryWordCount = toWordCount(summaryText)
	const documentWordCount = toWordCount(documentText)
	return toGradingResult(
		summaryWordCount >= documentWordCount
			? `the summary runs ${summaryWordCount} words, and the document ${documentWordCount}`
			: undefined,
	)
}

// a case's attachment kind and its summary's word count
function toCaseLine(summaryText: string, evaluateResult: EvaluateResult): string {
	const { attachmentKind } = evaluateResult.testCase.vars as AttachmentSummariesVariables
	return `${attachmentKind} summary, ${toWordCount(summaryText)} words`
}
