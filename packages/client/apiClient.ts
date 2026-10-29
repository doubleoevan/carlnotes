// the typed Hono client for the api and the plain fetch beside it, both configured once by the app that runs them, and
// readApiErrorMessage, which reads the api's error message. the types-only AppType import adds no api code to an app's
// bundle
import type { AppType } from "@carlnotes/api"
import { isObjectionableTextResponse, toModerationRejectionMessage } from "@carlnotes/contracts/moderation"
import { isTermsOutdatedResponse, TERMS_OUTDATED_LINE } from "@carlnotes/contracts/terms"
import { hc } from "hono/client"

// what the headers function may read of the call: the credentials mode the call asked for
export type ApiRequestContext = { credentials?: RequestCredentials }

// what an app gives the client: the api's base url, "" for the page's own origin, how an error is shown to the user,
// and for an app with no cookie jar the headers every request sends, read per request with the call's own
// credentials mode, its credentials mode, and what a 401 does
export type ApiClientSettings = {
	apiBaseUrl: string
	showError: (message: string) => void
	headers?: (request?: ApiRequestContext) => Record<string, string> | Promise<Record<string, string>>
	credentials?: RequestCredentials
	onUnauthorized?: () => void
	// what a write rejected for the Terms does: the app opens its acceptance dialog and says how it closed. an
	// accepted dialog sends the write again, and a dismissed one returns the rejection to the caller
	onTermsOutdated?: () => Promise<"accepted" | "dismissed">
}

// the parts of a response the client helpers read, which Hono's typed response and the runtime's Response both have
export type ApiResponse = Pick<Response, "ok" | "status" | "json" | "text">

// the typed client over the api's routes
type ApiClient = ReturnType<typeof hc<AppType>>

// the settings the app configured, and the client built from them. until an app configures the client, a request goes
// to the page's own origin and an error goes to the console
let apiClientSettings: ApiClientSettings = { apiBaseUrl: "", showError: (message) => console.error(message) }
let configuredApiClient: ApiClient = toConfiguredApiClient(apiClientSettings)

/**
 * Configures the client with the app's api base url, the way it shows an error, and its request settings.
 */
export function configureApiClient(settings: ApiClientSettings): void {
	apiClientSettings = settings
	configuredApiClient = toConfiguredApiClient(settings)
}

/**
 * Returns the typed client at the configured base url.
 */
export function apiClient(): ApiClient {
	return configuredApiClient
}

/**
 * Returns an api path as a url at the configured base url, for a url the platform loads itself.
 */
export function toApiUrl(path: string): string {
	return `${apiClientSettings.apiBaseUrl}${path}`
}

/**
 * Fetches an api path at the configured base url with the configured headers and credentials, and reports a 401.
 */
export async function fetchApi(path: string, init: RequestInit = {}): Promise<Response> {
	return fetchWithSettings(`${apiClientSettings.apiBaseUrl}${path}`, init)
}

/**
 * Shows an error message to the user the way the app shows one.
 */
export function showClientError(message: string): void {
	apiClientSettings.showError(message)
}

/**
 * Returns the error message in a failed api response's body, or undefined if the body has none.
 */
export async function readApiErrorMessage(response: ApiResponse): Promise<string | undefined> {
	const body = (await response.json().catch(() => null)) as { error?: string } | null
	// a rejected text and a write waiting on the Terms each have Carl's own words
	if (isObjectionableTextResponse(body)) {
		return toModerationRejectionMessage(body.category)
	}
	if (isTermsOutdatedResponse(body)) {
		return TERMS_OUTDATED_LINE
	}
	return body?.error ?? undefined
}

// the typed client at the base url, every call going through the settings' headers, credentials, and 401 report
function toConfiguredApiClient(settings: ApiClientSettings): ApiClient {
	return hc<AppType>(settings.apiBaseUrl, { fetch: fetchWithSettings })
}

// fetch a request with the configured headers under the call's own, read with the call's credentials mode, and the
// configured credentials over the call's, if the app set them
async function fetchWithSettings(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
	// await the configured headers only if an app configured them
	const settings = apiClientSettings
	const headers = new Headers(init.headers)
	const configuredHeaders = settings.headers ? await settings.headers({ credentials: init.credentials }) : {}
	for (const [name, value] of Object.entries(configuredHeaders)) {
		if (!headers.has(name)) {
			headers.set(name, value)
		}
	}

	// a call aborted while its headers were read never leaves the client
	init.signal?.throwIfAborted()
	const credentials = settings.credentials ?? init.credentials
	return fetchAndReportUnauthorized(input, { ...init, headers, credentials })
}

// fetch a request, report a 401 to the app, and send a write rejected for the Terms again once they are accepted
async function fetchAndReportUnauthorized(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const response = await fetch(input, init)
	if (response.status === 401) {
		apiClientSettings.onUnauthorized?.()
	}
	if (response.status !== 403 || !apiClientSettings.onTermsOutdated) {
		return response
	}

	// a 403 is read from a copy, so the caller still reads the body
	const body = await response
		.clone()
		.json()
		.catch(() => null)
	if (!isTermsOutdatedResponse(body)) {
		return response
	}

	// the terms rejection opens the app's acceptance dialog. the kept draft is sent again once the Terms are accepted,
	// and the rejection stands if the dialog is dismissed
	const dialogOutcome = await apiClientSettings.onTermsOutdated()
	return dialogOutcome === "accepted" ? fetch(input, init) : response
}
