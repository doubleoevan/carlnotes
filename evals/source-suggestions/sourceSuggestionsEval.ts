// the promptfoo eval of the source suggester, which makes real calls on Exa, the models, and the suggested Sources.
// run the eval with: bun run eval:source-suggestions
import type { Assertion, EvaluateResult, GradingResult, TestCase } from "promptfoo"
import { cheapModel } from "../../worker/models"
import type { SuggestedSource } from "../../worker/suggest"
import { runEval, toGradingResult, toRubricAssertions, toRubricGrader } from "../evalHarness"
import { toPercentLabel } from "../evalLabels"
import {
	MIN_READABLE_SUGGESTIONS,
	SOURCE_SUGGESTIONS_CASES,
	type SourceSuggestionsCase,
	SUGGESTION_LIMIT,
} from "./sourceSuggestionsCases"
import { sourceSuggester } from "./sourceSuggestionsProviders"
import { FIT_RUBRIC, GRADER_MODEL, MATERIAL_LABEL, OUTPUT_SHAPE_RUBRIC } from "./sourceSuggestionsRubrics"

// the checks that every case gets and that need no model
const DETERMINISTIC_ASSERTIONS: Assertion[] = [
	{
		type: "javascript",
		metric: `fills at least ${MIN_READABLE_SUGGESTIONS} of ${SUGGESTION_LIMIT} open slots with readable sources`,
		value: gradeOpenSlotsFilled,
	},
]

// run every case. the grader is on a different model from the model that suggests the sources
await runEval({
	name: "source-suggestions",
	description: "source suggester",
	provider: sourceSuggester,
	writerModels: [cheapModel()],
	grader: toRubricGrader(GRADER_MODEL),
	// live search results and live sites make this eval report only
	gatePassRate: null,
	defaultAssertions: DETERMINISTIC_ASSERTIONS,
	testCases: SOURCE_SUGGESTIONS_CASES.map(toTestCase),
	toCaseLine,
	toSummaryLine,
})

// one promptfoo test for a case. its variables, and the rubrics over its topic
function toTestCase(sourceSuggestionsCase: SourceSuggestionsCase): TestCase {
	const { description, rubric, ...sourceSuggestionsVariables } = sourceSuggestionsCase

	// the fit rubric, plus the case's own rubric, each with the topic that the suggester was given after it
	const rubricAssertions = toRubricAssertions({
		outputShapeRubric: OUTPUT_SHAPE_RUBRIC,
		caseRubrics: [
			{ metric: "every source fits the topic and keeps producing", rubric: FIT_RUBRIC },
			...(rubric ? [{ metric: description, rubric }] : []),
		],
		materialLabel: MATERIAL_LABEL,
		material: sourceSuggestionsVariables,
	})
	return { description, vars: sourceSuggestionsVariables, assert: rubricAssertions }
}

// fail the check unless at least MIN_READABLE_SUGGESTIONS open slots have a suggestion that its ingester could read
function gradeOpenSlotsFilled(suggesterOutput: string): GradingResult {
	const suggestionCount = toSuggestedSources(suggesterOutput).length
	return toGradingResult(
		suggestionCount < MIN_READABLE_SUGGESTIONS
			? `${suggestionCount} readable suggestions for ${SUGGESTION_LIMIT} slots`
			: undefined,
	)
}

// a case's share of new suggestions that read, then its suggested Sources, each as its kind and its value
function toCaseLine(suggesterOutput: string, evaluateResult: EvaluateResult): string {
	const { newSuggestionCount, readableSuggestionCount } = toSuggestionCounts([evaluateResult])
	const suggestionLines = toSuggestedSources(suggesterOutput).map(
		(suggestedSource) => `${suggestedSource.sourceOption}: ${suggestedSource.value}`,
	)
	return `${readableSuggestionCount} of ${newSuggestionCount} new suggestions read. ${suggestionLines.join(", ")}`
}

// the share of new suggestions that resolved and read across every run
function toSummaryLine(evaluateResults: EvaluateResult[]): string {
	const { newSuggestionCount, readableSuggestionCount } = toSuggestionCounts(evaluateResults)
	const readableSuggestionRatio = newSuggestionCount > 0 ? readableSuggestionCount / newSuggestionCount : 0
	return `${toPercentLabel(readableSuggestionRatio)} of new suggestions read, ${readableSuggestionCount} of ${newSuggestionCount}`
}

// the new and readable suggestion counts, added up across the runs
function toSuggestionCounts(evaluateResults: EvaluateResult[]): {
	newSuggestionCount: number
	readableSuggestionCount: number
} {
	const suggestionCountsByRun = evaluateResults.map((evaluateResult) => ({
		newSuggestionCount: Number(evaluateResult.response?.metadata?.newSuggestionCount ?? 0),
		readableSuggestionCount: Number(evaluateResult.response?.metadata?.readableSuggestionCount ?? 0),
	}))
	return {
		newSuggestionCount: suggestionCountsByRun.reduce(
			(sum, runSuggestionCounts) => sum + runSuggestionCounts.newSuggestionCount,
			0,
		),
		readableSuggestionCount: suggestionCountsByRun.reduce(
			(sum, runSuggestionCounts) => sum + runSuggestionCounts.readableSuggestionCount,
			0,
		),
	}
}

// the suggester's JSON output read back into its suggestions
function toSuggestedSources(suggesterOutput: string): SuggestedSource[] {
	return (JSON.parse(suggesterOutput) as { suggestedSources: SuggestedSource[] }).suggestedSources
}
