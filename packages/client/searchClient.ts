// the site search client
import {
	type SearchRequest,
	type SearchResultsPage,
	searchResultsPage,
	toSearchUrlParams,
} from "@carlnotes/contracts/search"
import { apiClient, readApiResponse } from "./apiClient"

/**
 * Returns one page of the site search, or throws for a request the api rejected, a rate-limited one included, and for
 * one the signal aborted.
 */
export async function searchSite(searchRequest: SearchRequest, signal?: AbortSignal): Promise<SearchResultsPage> {
	const response = await apiClient().api.search.$get({ query: toSearchUrlParams(searchRequest) }, { init: { signal } })
	if (!response.ok) {
		throw new Error(`search failed: ${response.status}`)
	}
	return readApiResponse(searchResultsPage, response)
}
