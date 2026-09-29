import type { PageHead } from "@shared/contracts"

/**
 * Runs a route loader's read on the server only. In the browser, loadOnServer returns browserValue at once.
 */
export function loadOnServer<T>(readServerValue: () => Promise<T>, browserValue: T): Promise<T> {
	return typeof window === "undefined" ? readServerValue() : Promise.resolve(browserValue)
}

// the two reads of one page, its head and its page data
type LoadPageOnServerOptions<TPage> = {
	fetchPageHead: () => Promise<PageHead | null>
	fetchPage: () => Promise<TPage>
}

/**
 * Reads a page's head and page data on the server. The head is null for a page the api does not have, and undefined if its read fails.
 * The page is null if its read fails. In the browser loadPageOnServer returns an undefined head and a null page at once.
 */
export function loadPageOnServer<TPage>({
	fetchPageHead,
	fetchPage,
}: LoadPageOnServerOptions<TPage>): Promise<[PageHead | null | undefined, TPage | null]> {
	return loadOnServer<[PageHead | null | undefined, TPage | null]>(
		() => Promise.all([fetchPageHead().catch(() => undefined), fetchPage().catch(() => null)]),
		[undefined, null],
	)
}
