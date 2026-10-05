// the source suggestions eval's promptfoo provider, the suggester under test. the suggester searches with Exa,
// calls the LiteLLM proxy through worker/models.ts, and reads every suggested Source the way its ingester will
import type { ApiProvider, CallApiContextParams, ProviderResponse } from "promptfoo"
import { toSourceSuggestions } from "../../worker/suggest"
import { type SourceSuggestionsCase, SUGGESTION_LIMIT } from "./sourceSuggestionsCases"

// the variables that a case gives the suggester. everything in the case except its description and its rubric
export type SourceSuggestionsVariables = Omit<SourceSuggestionsCase, "description" | "rubric">

// the suggester under test. its output is a JSON object with the readable suggestions, as the topic editor shows them,
// and its metadata has the new suggestion count and the readable suggestion count
export const sourceSuggester: ApiProvider = { id: () => "source-suggester", callApi: suggestCaseSources }

// suggest one case's Sources through toSourceSuggestions, the function behind suggestSources
async function suggestCaseSources(_renderedPrompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
	// read the case's variables
	const sourceSuggestionsVariables = context?.vars as SourceSuggestionsVariables
	const { name, prompt, excludeSources } = sourceSuggestionsVariables

	// suggest up to the case's open slots
	const { suggestedSources, newSuggestionCount, readableSuggestionCount } = await toSourceSuggestions({
		name,
		prompt,
		attachmentContext: "",
		excludeSources,
		limit: SUGGESTION_LIMIT,
	})
	return { output: JSON.stringify({ suggestedSources }), metadata: { newSuggestionCount, readableSuggestionCount } }
}
