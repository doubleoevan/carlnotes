import type { PageHead } from "@shared/contracts/pageHead"
import { DEGRADED_RENDER_HEADER } from "@shared/seo"
import { createIsomorphicFn } from "@tanstack/react-start"

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
		() => Promise.all([readWithDegradedFallback(fetchPageHead, undefined), readWithDegradedFallback(fetchPage, null)]),
		[undefined, null],
	)
}

/**
 * Returns a server read's value, or the fallback if the read fails. A failed read marks the page's render degraded.
 */
export async function readWithDegradedFallback<T, TFallback>(
	read: () => Promise<T>,
	fallback: TFallback,
): Promise<T | TFallback> {
	try {
		return await read()
	} catch {
		await markRenderDegraded()
		return fallback
	}
}

// set the degraded render header on the page's response. only the server, inside a request, has a response to set it
// on, so the function has no browser side, and in a test it sets nothing
const markRenderDegraded = createIsomorphicFn().server(async () => {
	// import the server-only setter inside the server function, so the browser bundle leaves it out.
	// a call outside a request throws an error, and sets nothing
	const { setResponseHeader } = await import("@tanstack/react-start/server")
	try {
		setResponseHeader(DEGRADED_RENDER_HEADER, "1")
	} catch {}
})
