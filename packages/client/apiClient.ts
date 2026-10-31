// the typed Hono client for the api and the plain fetch beside it, both configured once by the app that runs them, with
// readApiResponse and readApiErrorMessage for reading a response, and the native file part a multipart body takes. the
// AppType import is types only
import type { AppType } from "@carlnotes/api"
import {
	APP_VERSION_OUTDATED_LINE,
	type AppVersionOutdatedResponse,
	isAppVersionOutdatedResponse,
} from "@carlnotes/contracts/appVersions"
import { isObjectionableContentResponse, toModerationRejectionMessage } from "@carlnotes/contracts/moderation"
import { toReportedPath } from "@carlnotes/contracts/reportedPath"
import { isTermsOutdatedResponse, TERMS_OUTDATED_LINE } from "@carlnotes/contracts/terms"
import { takeDroppedEntryCount } from "@carlnotes/contracts/tolerantReads"
import { hc } from "hono/client"
import type { z } from "zod"

// what the headers function may read of the call: the credentials mode the call asked for
export type ApiRequestContext = { credentials?: RequestCredentials }

// what an app gives the client: the api's base url, with "" for the page's own origin, how an error is shown to the
// user, the headers every request sends, the credentials mode, and what a 401 does
export type ApiClientSettings = {
	apiBaseUrl: string
	showError: (message: string) => void
	headers?: (request?: ApiRequestContext) => Record<string, string> | Promise<Record<string, string>>
	credentials?: RequestCredentials
	onUnauthorized?: () => void
	// what a write rejected for the Terms does: the app opens its acceptance dialog and says how it closed. an
	// accepted dialog sends the write again, and a dismissed one returns the rejection to the caller
	onTermsOutdated?: () => Promise<"accepted" | "dismissed">
	// what a 426 does: the app shows its update notice. the body is null when the response had none to read
	onAppVersionOutdated?: (rejection: AppVersionOutdatedResponse | null) => void
	// the schema a response schema is parsed through. the web configures none and parses the contract itself, and the
	// app configures the tolerant schema
	toResponseSchema?: <Schema extends z.ZodType>(schema: Schema) => z.ZodType<z.output<Schema>>
	// what a tolerant parse that dropped entries does: the app records the route and the count, with no content
	onTolerantReadIssue?: (issue: TolerantReadIssue) => void
}

// a tolerant parse that dropped list or record entries: the route, with each id segment replaced by `:id`, and how many
export type TolerantReadIssue = { route: string; droppedEntryCount: number }

/**
 * A response that did not parse as its contract. The message names the route.
 */
export class ApiResponseError extends Error {
	constructor(
		readonly route: string,
		readonly issueSummary: string,
	) {
		super(`the response for ${route} did not match its contract: ${issueSummary}`)
		this.name = "ApiResponseError"
	}
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
	configuredResponseSchemas = new WeakMap()
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
 * Returns a response's body parsed with the configured schema. Throws an ApiResponseError if it does not parse, and
 * reports the entries a tolerant parse dropped.
 */
export async function readApiResponse<Schema extends z.ZodType>(
	schema: Schema,
	response: ApiResponse & { url?: string },
): Promise<z.output<Schema>> {
	// read the body and parse it with the configured schema
	const route = toReportedResponsePath(response.url)
	const body: unknown = await response.json().catch(() => undefined)
	const parseResult = toConfiguredResponseSchema(schema).safeParse(body)

	// take this parse's dropped count before the throw, or a failed parse's drops count against the next route
	const droppedEntryCount = takeDroppedEntryCount()
	if (!parseResult.success) {
		throw new ApiResponseError(route, parseResult.error.issues.map((issue) => issue.path.join(".")).join(", "))
	}

	// report what a tolerant parse dropped, by route and count alone
	if (droppedEntryCount > 0) {
		apiClientSettings.onTolerantReadIssue?.({ route, droppedEntryCount })
	}
	return parseResult.data
}

// the schema each contract is parsed with, built once per contract and per configuration
let configuredResponseSchemas = new WeakMap<z.ZodType, z.ZodType>()
function toConfiguredResponseSchema<Schema extends z.ZodType>(schema: Schema): z.ZodType<z.output<Schema>> {
	// the contract itself where no schema is configured
	if (!apiClientSettings.toResponseSchema) {
		return schema as unknown as z.ZodType<z.output<Schema>>
	}

	// the schema built for this contract, or a new one
	const builtSchema = configuredResponseSchemas.get(schema)
	if (builtSchema) {
		return builtSchema as z.ZodType<z.output<Schema>>
	}
	const configuredSchema = apiClientSettings.toResponseSchema(schema)
	configuredResponseSchemas.set(schema, configuredSchema)
	return configuredSchema
}

// an api path segment that is an id: a number, a uuid, or a token
const ID_SEGMENT_PATTERN = /^(\d+|[0-9a-f]{8}-[0-9a-f-]{27}|[A-Za-z0-9_-]{20,})$/

// the route a response came from, with each id segment replaced by `:id`, or "(unknown)" for a response without a url
function toReportedResponsePath(url: string | undefined): string {
	if (!url) {
		return "(unknown)"
	}

	// the path alone, each id segment replaced by `:id`
	const pathname = url.startsWith("/") ? url : new URL(url, "http://localhost").pathname
	return toReportedPath(pathname)
		.split("/")
		.map((segment) => (ID_SEGMENT_PATTERN.test(segment) ? ":id" : segment))
		.join("/")
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
	if (isObjectionableContentResponse(body)) {
		return toModerationRejectionMessage(body.category)
	}
	if (isTermsOutdatedResponse(body)) {
		return TERMS_OUTDATED_LINE
	}

	// an outdated build gets the update line, and any other body gives its own error
	if (isAppVersionOutdatedResponse(body)) {
		return APP_VERSION_OUTDATED_LINE
	}
	return body?.error ?? undefined
}

// the typed client at the base url, every call going through fetchWithSettings
function toConfiguredApiClient(settings: ApiClientSettings): ApiClient {
	return hc<AppType>(settings.apiBaseUrl, { fetch: fetchWithSettings })
}

// fetch a request with the configured headers, which the call's own headers override. the configured credentials mode
// overrides the call's
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
	return fetchAndHandleRejections(input, { ...init, headers, credentials })
}

// fetch a request, report a 401 and a 426 to the app, and send a write rejected for the Terms again once they are
// accepted
async function fetchAndHandleRejections(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const response = await fetch(input, init)
	if (response.status === 401) {
		apiClientSettings.onUnauthorized?.()
	}

	// an outdated build is reported with the body, read from a copy so the caller still reads it
	if (response.status === 426) {
		const rejection = await readResponseBodyCopy(response)
		apiClientSettings.onAppVersionOutdated?.(isAppVersionOutdatedResponse(rejection) ? rejection : null)
		return response
	}
	if (response.status !== 403 || !apiClientSettings.onTermsOutdated) {
		return response
	}

	// a 403 is read from a copy too
	const body = await readResponseBodyCopy(response)
	if (!isTermsOutdatedResponse(body)) {
		return response
	}

	// the terms rejection opens the app's acceptance dialog. the kept draft is sent again once the Terms are accepted,
	// and the rejection stands if the dialog is dismissed
	const dialogOutcome = await apiClientSettings.onTermsOutdated()
	return dialogOutcome === "accepted" ? fetch(input, init) : response
}

// a response's json body from a copy, or null when it has none
function readResponseBodyCopy(response: Response): Promise<unknown> {
	return response
		.clone()
		.json()
		.catch(() => null)
}

// a native file part, which React Native's FormData reads from the file at its uri
export type NativeFilePart = { uri: string; name: string; type: string }

/**
 * Appends a native file part to a multipart body. React Native's FormData takes a local file descriptor in place of a
 * browser Blob, which the DOM's FormData type does not know.
 */
export function appendNativeFilePart(formData: FormData, fieldName: string, nativeFilePart: NativeFilePart): void {
	formData.append(fieldName, nativeFilePart as unknown as Blob)
}
