// what the api client sends on every request from the app, and what a 401 does: the stored session cookie, no
// platform credentials, and a sign-out of a revoked session
import type { ApiClientSettings } from "@carlnotes/client/apiClient"

// where the settings read the cookie and the session, and how they sign out
export type ApiRequestSettingsOptions = {
	getCookie: () => Promise<string>
	hasSession: () => boolean
	signOut: () => Promise<unknown>
}

// the three settings the app adds to the api client
export type ApiRequestSettings = Required<Pick<ApiClientSettings, "headers" | "credentials" | "onUnauthorized">>

/**
 * Returns the request settings for the api client: the stored cookie as the Cookie header, no platform credentials,
 * and a 401 that signs out once while the client still holds a session.
 */
export function toApiRequestSettings({
	getCookie,
	hasSession,
	signOut,
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

	// the stored cookie as the Cookie header, or no header while no cookie is stored
	const toHeaders = async (): Promise<Record<string, string>> => {
		const cookie = await getCookie()
		return cookie ? { cookie } : {}
	}
	return { headers: toHeaders, credentials: "omit", onUnauthorized: signOutOnce }
}
