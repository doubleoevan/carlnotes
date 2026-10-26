// the auth client the app configures once, at module load: the api base url, and the Expo plugin that keeps the
// session cookie in secure storage and sends it on every auth request
import { expoClient } from "@better-auth/expo/client"
import { configureAuthClient } from "@carlnotes/client/authClient"
import { MOBILE_APP_SCHEME } from "@carlnotes/contracts/mobileApp"
import { GATE_COOKIE_NAME } from "@carlnotes/contracts/signupGate"
import Constants from "expo-constants"
import * as SecureStore from "expo-secure-store"
import { toApiBaseUrl } from "./apiBaseUrl"
import { retireSession } from "./sessionExit"

// the cookies secure storage keeps: Better Auth's own, and the gate cookie the app gate sets for the sign-up request
const COOKIE_PREFIXES = ["better-auth", GATE_COOKIE_NAME]

// the api base url, chosen once for the auth client and the api client alike
export const apiBaseUrl = toApiBaseUrl({ isDevelopment: __DEV__, hostUri: Constants.expoConfig?.hostUri })

// the app's own handle on the client, with the Expo plugin's getCookie. the shared code reads it through authClient()
export const mobileAuthClient = configureAuthClient({
	baseURL: apiBaseUrl,
	plugins: [
		expoClient({
			scheme: MOBILE_APP_SCHEME,
			storagePrefix: "carlnotes",
			storage: SecureStore,
			cookiePrefix: COOKIE_PREFIXES,
		}),
	],
})

/**
 * Returns whether the client holds a session right now, from the store useSession reads.
 */
export function hasSession(): boolean {
	const sessionState = mobileAuthClient.$store.atoms.session?.get() as { data: unknown } | undefined
	return Boolean(sessionState?.data)
}

/**
 * Retires the current session before a revoked account's sign-out request.
 */
export async function retireCurrentSession(): Promise<void> {
	const sessionState = mobileAuthClient.$store.atoms.session?.get() as
		| { data: { session: { id: string } } | null }
		| undefined
	if (sessionState?.data) {
		await retireSession(sessionState.data.session.id)
	}
}
