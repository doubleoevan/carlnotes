// whether a request came from a page on the app's own origin, for a write that any other website could send

import { appUrl } from "@carlnotes/server/appUrl"

/**
 * Returns true if the browser marked the request same-origin. A browser that sends no Sec-Fetch-Site header passes if
 * its Origin header is the app's origin. Any other request, a cross-site one included, is false.
 */
export function isSameOriginRequest(request: Request): boolean {
	// trust the browser's Sec-Fetch-Site header if it sent one
	const fetchSite = request.headers.get("sec-fetch-site")
	if (fetchSite) {
		return fetchSite === "same-origin"
	}

	// else compare the Origin header with the app's origin
	return request.headers.get("origin") === new URL(appUrl()).origin
}
