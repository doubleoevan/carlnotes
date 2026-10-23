// the search bar's choices: what enter opens, the search page its text opens, and a list of kinds after a toggle
import {
	SEARCH_MIN_CHARS,
	type SearchRequest,
	type SearchResultsPage,
	type SearchRow,
	toSearchPath,
} from "@carlnotes/contracts/search"

// the highlighted row, the typeahead's search and whether a newer one is pending, and the typed query
type ToEnterChoiceOptions = {
	highlightedRow: SearchRow | undefined
	searchPage: SearchResultsPage | null
	isSearching: boolean
	searchQuery: string
}

/**
 * Returns what enter opens: the highlighted row, else the only row of a finished search, else the search page for a
 * query long enough to search. A pending search counts as more than one row, and a highlighted See all option opens
 * the search page too.
 */
export function toEnterChoice({
	highlightedRow,
	searchPage,
	isSearching,
	searchQuery,
}: ToEnterChoiceOptions): SearchRow | "searchPage" | null {
	if (highlightedRow) {
		return highlightedRow
	}

	// the only row of a finished search
	const onlyRow = !isSearching && searchPage?.rowCount === 1 ? searchPage.rows[0] : undefined
	if (onlyRow) {
		return onlyRow
	}
	return searchQuery.length >= SEARCH_MIN_CHARS ? "searchPage" : null
}

/**
 * Returns the search page the bar's search opens, or null for text too short to search.
 */
export function toSearchBarPath(searchRequest: SearchRequest): string | null {
	return searchRequest.q.length >= SEARCH_MIN_CHARS ? toSearchPath(searchRequest) : null
}

/**
 * Returns a list with one item turned on or off, in the order the Filters menu lists them. The last item stays on.
 */
export function toToggledList<Item extends string>({
	items,
	toggledItem,
	menuOrder,
}: {
	items: Item[]
	toggledItem: Item
	menuOrder: readonly Item[]
}): Item[] {
	// the last item on stays on
	const isOn = items.includes(toggledItem)
	if (isOn && items.length === 1) {
		return items
	}

	// every item in menu order, with the toggled one flipped
	return menuOrder.filter((menuItem) => (menuItem === toggledItem ? !isOn : items.includes(menuItem)))
}
