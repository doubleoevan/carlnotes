// the promptfoo eval of the search query writer, which makes real model calls.
// run the eval with: bun run eval:search-queries
import type { Assertion, GradingResult, TestCase } from "promptfoo"
import { MAX_SEARCH_QUERIES } from "../../worker/ingest/search"
import { cheapModel } from "../../worker/models"
import { runEval, toGradingResult, toRubricAssertions, toRubricGrader } from "../evalHarness"
import { SEARCH_QUERIES_CASES, type SearchQueriesCase } from "./searchQueriesCases"
import { searchQueriesWriter } from "./searchQueriesProviders"
import { GRADER_MODEL, MATERIAL_LABEL, ON_TOPIC_RUBRIC, OUTPUT_SHAPE_RUBRIC } from "./searchQueriesRubrics"

// a quote mark or a search operator: a filter such as site:, a leading minus or plus, or an upper-case OR, AND, or NOT
const SEARCH_OPERATOR = /["“”]|\b(?:site|intitle|inurl|intext|filetype):|(?:^|\s)[-+]\w|\s(?:OR|AND|NOT)\s/

// the checks that every case gets and that need no model
const DETERMINISTIC_ASSERTIONS: Assertion[] = [
	{ type: "javascript", metric: `writes 1 to ${MAX_SEARCH_QUERIES} queries`, value: gradeQueryCount },
	{ type: "javascript", metric: "every query is distinct", value: gradeDistinctQueries },
	{
		type: "javascript",
		metric: "every query is plain text, with no search operators or quotes",
		value: gradePlainTextQueries,
	},
]

// run every case. the grader is on a different model from the model that writes the queries
await runEval({
	name: "search-queries",
	description: "search query writer",
	provider: searchQueriesWriter,
	writerModels: [cheapModel()],
	grader: toRubricGrader(GRADER_MODEL),
	gatePassRate: 0.9,
	defaultAssertions: DETERMINISTIC_ASSERTIONS,
	testCases: SEARCH_QUERIES_CASES.map(toTestCase),
	toCaseLine,
})

// one promptfoo test for a case. its variables, and the rubrics over its topic
function toTestCase(searchQueriesCase: SearchQueriesCase): TestCase {
	const { description, rubric, ...searchQueriesVariables } = searchQueriesCase

	// the on-topic rubric, plus the case's own rubric, each with the topic that the writer was given after the rubric
	const rubricAssertions = toRubricAssertions({
		outputShapeRubric: OUTPUT_SHAPE_RUBRIC,
		caseRubrics: [
			{ metric: "every query searches for the topic and respects its skips", rubric: ON_TOPIC_RUBRIC },
			...(rubric ? [{ metric: description, rubric }] : []),
		],
		materialLabel: MATERIAL_LABEL,
		material: searchQueriesVariables,
	})
	return { description, vars: searchQueriesVariables, assert: rubricAssertions }
}

// fail the check unless the writer wrote at least one query and at most MAX_SEARCH_QUERIES
function gradeQueryCount(writerOutput: string): GradingResult {
	// count the queries and check the range
	const searchQueryCount = toSearchQueries(writerOutput).length
	const isSearchQueryCountInRange = searchQueryCount >= 1 && searchQueryCount <= MAX_SEARCH_QUERIES
	return toGradingResult(isSearchQueryCountInRange ? undefined : `the writer wrote ${searchQueryCount} queries`)
}

// fail the check if two queries match once case and spacing are ignored
function gradeDistinctQueries(writerOutput: string): GradingResult {
	// compare the queries in lowercase with single spaces
	const normalizedSearchQueries = toSearchQueries(writerOutput).map((searchQuery) =>
		searchQuery.toLowerCase().replace(/\s+/g, " "),
	)
	const repeatedSearchQuery = normalizedSearchQueries.find(
		(searchQuery, i) => normalizedSearchQueries.indexOf(searchQuery) !== i,
	)
	return toGradingResult(repeatedSearchQuery && `the query ${repeatedSearchQuery} repeats`)
}

// fail the check if a query has a search operator or a quote mark
function gradePlainTextQueries(writerOutput: string): GradingResult {
	const operatorSearchQuery = toSearchQueries(writerOutput).find((searchQuery) => SEARCH_OPERATOR.test(searchQuery))
	return toGradingResult(
		operatorSearchQuery && `the query ${operatorSearchQuery} has a search operator or a quote mark`,
	)
}

// a case's query count, then its queries
function toCaseLine(writerOutput: string): string {
	const searchQueries = toSearchQueries(writerOutput)
	return `${searchQueries.length} queries: ${searchQueries.join(" | ")}`
}

// the writer's JSON output read back into its search queries
function toSearchQueries(writerOutput: string): string[] {
	return (JSON.parse(writerOutput) as { queries: string[] }).queries
}
