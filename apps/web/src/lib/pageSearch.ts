import { CARDS_PAGE_MAX } from "@carlnotes/contracts/cardPages"

/**
 * Returns the page numbers past the first that a url's search params name under the given keys, an absent key meaning
 * the first page.
 */
export function toPageSearch<PageSearchKey extends string>(
	search: Record<string, unknown>,
	pageSearchKeys: readonly PageSearchKey[],
): Partial<Record<PageSearchKey, number>> {
	return Object.fromEntries(
		pageSearchKeys.flatMap((pageSearchKey) => {
			const pageNumber = toPageNumber(search[pageSearchKey])
			return pageNumber ? [[pageSearchKey, pageNumber]] : []
		}),
	) as Partial<Record<PageSearchKey, number>>
}

// a page number from a search param, or undefined if the param is not a page number past the first within the card
// pages' limit. the url counts from 1 and the read counts from 0
function toPageNumber(value: unknown): number | undefined {
	const pageNumber = Number(value)
	return Number.isInteger(pageNumber) && pageNumber > 1 && pageNumber <= CARDS_PAGE_MAX + 1 ? pageNumber : undefined
}
