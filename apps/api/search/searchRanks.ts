// the site search's order: how every kind ranks against the others, the newest and trending sorts, and the page cut
import type { TopicFindingSort } from "@carlnotes/contracts/findings"
import {
	SEARCH_RESULT_KINDS,
	SEARCH_ROW_RESULT_KINDS,
	type SearchResultsPage,
	type SearchRow,
} from "@carlnotes/contracts/search"
import { toNormalizedUsername } from "@carlnotes/contracts/usernames"

// the rows of every kind, the query they matched, and the sort
type ToRankedSearchRowsOptions = { searchRows: SearchRow[]; query: string; sort: TopicFindingSort }

/**
 * Orders search rows by relevance, or by newest or trending with the rows that have no date or count after the rest,
 * each group in relevance order.
 */
export function toRankedSearchRows({ searchRows, query, sort }: ToRankedSearchRowsOptions): SearchRow[] {
	// relevance order is every sort's base order and its tiebreak
	const relevanceRankedRows = toRelevanceRankedRows(searchRows, query)
	if (sort === "relevant") {
		return relevanceRankedRows
	}

	// newest reads each row's date and trending its count. a stable sort keeps relevance order among equal values
	const toSortValue = (searchRow: SearchRow): number | null =>
		sort === "newest" ? (searchRow.date === null ? null : Date.parse(searchRow.date)) : searchRow.count
	const valuedRows = relevanceRankedRows.filter((searchRow) => toSortValue(searchRow) !== null)
	const unvaluedRows = relevanceRankedRows.filter((searchRow) => toSortValue(searchRow) === null)
	const sortedValuedRows = valuedRows.sort(
		(first, second) => (toSortValue(second) as number) - (toSortValue(first) as number),
	)
	return [...sortedValuedRows, ...unvaluedRows]
}

/**
 * Returns how a name matches the query, both lowercased: 1 if it is the query, 2 if it starts with it, 3 if a word in it
 * starts with it, 4 if it contains it, and 5 for a row that matched another way.
 */
export function toMatchTier(name: string, query: string): number {
	// the name and query compared without case
	const lowercaseName = name.toLowerCase()
	const lowercaseQuery = query.toLowerCase()
	if (lowercaseName === lowercaseQuery) {
		return 1
	}
	if (lowercaseName.startsWith(lowercaseQuery)) {
		return 2
	}

	// a word starts after any character that is not a letter or a digit
	const escapedQuery = lowercaseQuery.replaceAll(/[.*+?^${}()|[\]\\/]/g, "\\$&")
	const wordStartPattern = new RegExp(`[^\\p{L}\\p{N}]${escapedQuery}`, "u")
	if (wordStartPattern.test(lowercaseName)) {
		return 3
	}
	return lowercaseName.includes(lowercaseQuery) ? 4 : 5
}

/**
 * Returns one page of the ranked rows, with the count of every row and where the page sits.
 */
export function toSearchPage(
	rankedRows: SearchRow[],
	{ page, size }: { page: number; size: number },
): Omit<SearchResultsPage, "podcastEpisodes"> {
	const pageRows = rankedRows.slice((page - 1) * size, page * size)
	return {
		rows: pageRows,
		rowCount: rankedRows.length,
		page,
		pageCount: Math.max(1, Math.ceil(rankedRows.length / size)),
		pageSize: size,
	}
}

// order rows by match tier, then by kind in the Filters menu's order, then shorter name first, then id
function toRelevanceRankedRows(searchRows: SearchRow[], query: string): SearchRow[] {
	// each row's tier, read once
	const matchTierByRow = new Map(searchRows.map((searchRow) => [searchRow, toRowMatchTier(searchRow, query)]))
	const toKindOrder = (searchRow: SearchRow): number =>
		SEARCH_RESULT_KINDS.indexOf(SEARCH_ROW_RESULT_KINDS[searchRow.kind])
	return [...searchRows].sort(
		(first, second) =>
			(matchTierByRow.get(first) as number) - (matchTierByRow.get(second) as number) ||
			toKindOrder(first) - toKindOrder(second) ||
			first.name.length - second.name.length ||
			first.id.localeCompare(second.id),
	)
}

// a row's match tier. a username matched on its normalized form is tiered on the normalized forms too
function toRowMatchTier(searchRow: SearchRow, query: string): number {
	if (searchRow.kind !== "user") {
		return toMatchTier(searchRow.name, query)
	}
	return toMatchTier(toUsernameLetters(searchRow.name), toUsernameLetters(query))
}

// a username or a query as the username search matches it: its lowercase letters and digits
function toUsernameLetters(text: string): string {
	return toNormalizedUsername(text).replaceAll(/[^a-z0-9]/g, "")
}
