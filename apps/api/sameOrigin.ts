// whether a request came from a page on the app's own origin or from the app, for a write that any other website
// could send

import { isNativePlatform, PLATFORM_HEADER } from "@carlnotes/contracts/clientTelemetry"
import { appUrl } from "@carlnotes/server/appUrl"

/**
 * Returns true if the browser marked the request same-origin, or if the mobile app sent it. A browser that sends no
 * Sec-Fetch-Site header passes if its Origin header is the app's origin. Any other request, a cross-site one
 * included, is false.
 */
export function isSameOriginRequest(request: Request): boolean {
	// trust the browser's Sec-Fetch-Site header if it sent one
	const fetchSite = request.headers.get("sec-fetch-site")
	if (fetchSite) {
		return fetchSite === "same-origin"
	}

	// the app names its platform on every request and sends no Origin. the api serves no CORS headers, so a page on
	// another origin cannot add that header from a browser
	if (isNativePlatform(request.headers.get(PLATFORM_HEADER))) {
		return true
	}

	// else compare the Origin header with the app's origin
	return request.headers.get("origin") === new URL(appUrl()).origin
}
