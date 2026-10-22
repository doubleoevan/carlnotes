// the fetch every story runs with, which rejects a call to the page's own api
import { isPathAtOrAfter } from "@/lib/utils"

/**
 * Returns a fetch that rejects a request to the origin's api and passes any other through to the original fetch.
 */
export function toGuardedFetch({
	originalFetch,
	origin,
}: {
	originalFetch: typeof fetch
	origin: string
}): typeof fetch {
	const guardedFetch = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
		// reject a request to this origin's /api path, relative or absolute
		const requestUrl = new URL(input instanceof Request ? input.url : String(input), origin)
		if (requestUrl.origin === origin && isPathAtOrAfter(requestUrl.pathname, "/api")) {
			return Promise.reject(new Error(`a story fetched ${requestUrl.pathname}. mock the client that calls it`))
		}
		return originalFetch(input, init)
	}

	// the fetch type also names its preconnect, which passes through unguarded
	return Object.assign(guardedFetch, { preconnect: originalFetch.preconnect })
}
