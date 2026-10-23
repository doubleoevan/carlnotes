// the search page's url values as the router holds them, and the site search they name
import {
	type SearchRequest,
	type SearchUrlParams,
	searchRequestPayload,
	toSearchRequest,
	toSearchUrlParams,
} from "@carlnotes/contracts/search"

// the search page's url values as the router parses them. the router reads a number as a number, so the page and size
// are numbers, and each list stays one comma list
type SearchRouteSearch = Omit<SearchUrlParams, "page" | "size"> & { page?: number; size?: number }

// every key a search has, in the contract's order
const SEARCH_REQUEST_KEYS = Object.keys(searchRequestPayload.shape) as (keyof SearchRequest)[]

/**
 * Returns the search page's url values with every key named, so a key the url leaves out or the contract rejects is
 * cleared instead of kept from the raw url.
 */
export function toValidatedRouteSearch(searchParams: Record<string, unknown>): SearchRouteSearch {
	const clearedRouteSearch = Object.fromEntries(SEARCH_REQUEST_KEYS.map((key) => [key, undefined]))
	return { ...clearedRouteSearch, ...toSearchRouteSearch(toRouteSearchRequest(searchParams)) }
}

/**
 * Returns the search a router's url values name. Each value the contract rejects reads as its default.
 */
export function toRouteSearchRequest(searchRouteSearch: Record<string, unknown>): SearchRequest {
	// every value as the url's text, which the contract reads
	const searchUrlParams: SearchUrlParams = {}
	for (const key of SEARCH_REQUEST_KEYS) {
		const urlValue = searchRouteSearch[key]
		if (urlValue !== undefined && urlValue !== null) {
			searchUrlParams[key] = String(urlValue)
		}
	}

	// read the text as the contract does
	return toSearchRequest(searchUrlParams)
}

/**
 * Returns a search as the router's url values, leaving out each value at its default.
 */
export function toSearchRouteSearch(searchRequest: SearchRequest): SearchRouteSearch {
	const { page, size, ...textValues } = toSearchUrlParams(searchRequest)
	return {
		...textValues,
		...(page === undefined ? {} : { page: Number(page) }),
		...(size === undefined ? {} : { size: Number(size) }),
	}
}
