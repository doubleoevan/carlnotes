// the typed Hono client for the api, configured once by the app that runs it, and readApiErrorMessage, which reads
// the api's error message. the types-only AppType import adds no api code to an app's bundle
import type { AppType } from "@carlnotes/api"
import { hc } from "hono/client"

// what an app gives the client: the api's base url, "" for the page's own origin, and how an error is shown to the user
export type ApiClientSettings = { apiBaseUrl: string; showError: (message: string) => void }

// the parts of a response the client helpers read, which Hono's typed response and the runtime's Response both have
export type ApiResponse = Pick<Response, "ok" | "status" | "json" | "text">

// the typed client over the api's routes
type ApiClient = ReturnType<typeof hc<AppType>>

// the settings the app configured, and the client built from them. until an app configures the client, a request goes
// to the page's own origin and an error goes to the console
let apiClientSettings: ApiClientSettings = { apiBaseUrl: "", showError: (message) => console.error(message) }
let configuredApiClient: ApiClient = hc<AppType>("")

/**
 * Configures the client with the app's api base url and the way it shows an error.
 */
export function configureApiClient(settings: ApiClientSettings): void {
	apiClientSettings = settings
	configuredApiClient = hc<AppType>(settings.apiBaseUrl)
}

/**
 * Returns the typed client at the configured base url.
 */
export function apiClient(): ApiClient {
	return configuredApiClient
}

/**
 * Returns an api path as a url at the configured base url, for a plain fetch.
 */
export function toApiUrl(path: string): string {
	return `${apiClientSettings.apiBaseUrl}${path}`
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
	return body?.error
}
