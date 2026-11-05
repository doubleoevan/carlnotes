import type { SuggestTopicsPayload } from "@carlnotes/contracts/personalSourcesPayloads"
import { type SuggestedTopic, topicSuggestionsResult } from "@carlnotes/contracts/topicSuggestions"
import { useEffect, useState } from "react"
import { callMcpViewTool } from "./mcpViewHost"

// match the site's typeahead delay
const AUTOCOMPLETE_DELAY_MS = 200

/**
 * Debounces editable Topic-name lookups and discards responses for an older query.
 */
export function useTopicAutocomplete({
	input,
	query,
	isEnabled,
}: {
	input: SuggestTopicsPayload
	query: string
	isEnabled: boolean
}): { topics: SuggestedTopic[]; isLoading: boolean } {
	// retain names only for the query that produced them
	const [suggestions, setSuggestions] = useState<{ query: string; topics: SuggestedTopic[] } | null>(null)
	const normalizedQuery = query.trim()
	useEffect(() => {
		if (!isEnabled || !normalizedQuery) {
			return
		}

		// cancel the timer and ignore a pending response when focus or text changes
		let isActive = true
		const timeout = setTimeout(() => {
			void callMcpViewTool("suggest_topics", {
				...input,
				query: normalizedQuery,
				cursor: undefined,
				autocomplete: true,
			})
				.then((response) => {
					const parsed = topicSuggestionsResult.safeParse(response.structuredContent)
					const topics =
						!response.isError && parsed.success && parsed.data.status === "suggested" ? parsed.data.editableTopics : []
					if (isActive) {
						setSuggestions({ query: normalizedQuery, topics })
					}
				})
				.catch(() => {
					if (isActive) {
						setSuggestions({ query: normalizedQuery, topics: [] })
					}
				})
		}, AUTOCOMPLETE_DELAY_MS)
		return () => {
			isActive = false
			clearTimeout(timeout)
		}
	}, [input, normalizedQuery, isEnabled])
	return {
		topics: suggestions?.query === normalizedQuery ? suggestions.topics : [],
		isLoading: isEnabled && Boolean(normalizedQuery) && suggestions?.query !== normalizedQuery,
	}
}
