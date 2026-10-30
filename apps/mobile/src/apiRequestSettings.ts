// what the api client sends on every request from the app, and what a 401 and a 426 do: the stored session cookie,
// left off a public read, no platform credentials, a sign-out of a revoked session, and the update notice
import type { ApiClientSettings, ApiRequestContext } from "@carlnotes/client/apiClient"

// where the settings read the cookie and the session, and how they sign out and open the update notice
export type ApiRequestSettingsOptions = {
	getCookie: () => Promise<string>
	hasSession: () => boolean
	signOut: () => Promise<unknown>
	onAppVersionOutdated: NonNullable<ApiClientSettings["onAppVersionOutdated"]>
	deviceHeaders?: Record<string, string>
}

// the four settings the app adds to the api client
export type ApiRequestSettings = Required<
	Pick<ApiClientSettings, "headers" | "credentials" | "onUnauthorized" | "onAppVersionOutdated">
>

/**
 * Returns the request settings for the api client: the stored cookie as the Cookie header on every call but a public
 * read, no platform credentials, and a 401 that signs out once while the client still holds a session.
 */
export function toApiRequestSettings({
	getCookie,
	hasSession,
	signOut,
	onAppVersionOutdated,
	deviceHeaders = {},
}: ApiRequestSettingsOptions): ApiRequestSettings {
	// whether a sign-out is in flight. a burst of 401s from one screen signs out once
	let isSigningOut = false

	// sign out once per revoked session
	const signOutOnce = (): void => {
		if (isSigningOut || !hasSession()) {
			return
		}

		// one sign-out at a time
		isSigningOut = true

		// a sign-out that fails is logged, and the next 401 tries again
		signOut()
			.catch((error: unknown) => {
				console.error("the sign-out after a 401 failed", error)
			})
			.finally(() => {
				isSigningOut = false
			})
	}

	// the stored cookie as the Cookie header, or no header while no cookie is stored. a call that asked for no
	// credentials gets no cookie
	const toHeaders = async ({ credentials }: ApiRequestContext = {}): Promise<Record<string, string>> => {
		const cookie = credentials === "omit" ? "" : await getCookie()
		return cookie ? { ...deviceHeaders, cookie } : deviceHeaders
	}
	return { headers: toHeaders, credentials: "omit", onUnauthorized: signOutOnce, onAppVersionOutdated }
}
