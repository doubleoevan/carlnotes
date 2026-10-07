// the search queries eval's promptfoo provider, which runs the query writer under test and searches no query
import type { ApiProvider, CallApiContextParams, ProviderResponse } from "promptfoo"
import { generateSearchQueries } from "../../worker/ingest/search"
import type { SearchQueriesCase } from "./searchQueriesCases"

// the variables that a case gives the writer. everything in the case except its description and its rubric
export type SearchQueriesVariables = Omit<SearchQueriesCase, "description" | "rubric">

// the writer under test. its output is a JSON object with the queries that a Scan searches with
export const searchQueriesWriter: ApiProvider = { id: () => "search-queries-writer", callApi: writeCaseSearchQueries }

// write one case's search queries through the same function that a Scan calls
async function writeCaseSearchQueries(
	_renderedPrompt: string,
	context?: CallApiContextParams,
): Promise<ProviderResponse> {
	// read the case's variables
	const searchQueriesVariables = context?.vars as SearchQueriesVariables
	const { topicName, topicContext } = searchQueriesVariables

	// write the queries. generateSearchQueries returns no token usage, so the run reports no cost
	const searchQueries = await generateSearchQueries({ topicContext, topicName })
	return { output: JSON.stringify({ queries: searchQueries }) }
}
