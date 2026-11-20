// how the web app configures the shared api client: where its requests go, and how a client error reaches the user
import { type ApiClientSettings, configureApiClient } from "@carlnotes/client/apiClient"
import { requestTermsAcceptance } from "@carlnotes/core/stores/termsAcceptanceStore"
import { toast } from "sonner"

// where a server render reads the api if API_ORIGIN is unset: its own process, on the port the api serves
const LOOPBACK_API_ORIGIN = "http://localhost:3000"

/**
 * Returns where a server render sends its api requests: the origin that API_ORIGIN names, with no slash at its end, or
 * the render's own process if the setting is unset or empty.
 */
export function toServerApiBaseUrl(apiOrigin: string | undefined): string {
	return apiOrigin?.replace(/\/+$/, "") || LOOPBACK_API_ORIGIN
}

/**
 * Returns the web app's api client settings for a base url. They set no headers and no credentials mode: a server
 * render's request brings no cookie, no forwarded address, and no marker.
 */
export function toWebApiClientSettings(apiBaseUrl: string): ApiClientSettings {
	return {
		apiBaseUrl,
		showError: (message) => toast.error(message),
		showMessage: (message) => toast.success(message),
		onTermsOutdated: requestTermsAcceptance,
	}
}

/**
 * Configures the api client for the web app. A browser request goes to the page's own origin. A server render's
 * request goes to the origin API_ORIGIN names, or to the render's own process on port 3000 if it is unset, in dev and
 * in production. An error a client shows is a toast.
 */
export function configureWebApiClient(): void {
	// only a server render reads the setting. the test is on window and not a createIsomorphicFn, because the MCP views'
	// bundle is built without the compiler that removes a server side, and would run it in the browser
	const apiBaseUrl = typeof window === "undefined" ? toServerApiBaseUrl(process.env.API_ORIGIN) : ""
	configureApiClient(toWebApiClientSettings(apiBaseUrl))
}
