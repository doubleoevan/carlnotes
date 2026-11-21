import { DEGRADED_RENDER_HEADER } from "@carlnotes/contracts/seo"
import { createIsomorphicFn } from "@tanstack/react-start"

/**
 * Runs a route loader's read on the server only. In the browser, loadOnServer returns browserValue at once.
 */
export function loadOnServer<T>(readServerValue: () => Promise<T>, browserValue: T): Promise<T> {
	return typeof window === "undefined" ? readServerValue() : Promise.resolve(browserValue)
}

/**
 * Runs a page read on the server only, and returns undefined in the browser or for a read that fails, which marks the
 * render degraded.
 */
export function loadPageReadOnServer<T>(read: () => Promise<T>): Promise<T | undefined> {
	return loadOnServer(() => readWithDegradedFallback(read, undefined), undefined)
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
