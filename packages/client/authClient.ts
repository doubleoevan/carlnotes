// the Better Auth client, configured once by the app that runs it, and the two signup-gate calls

import type { auth } from "@carlnotes/api/auth"
import type { AppSignupProof } from "@carlnotes/contracts/signupGate"
import type { BetterAuthClientPlugin } from "better-auth/client"
import { inferAdditionalFields } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import { apiClient, toApiUrl } from "./apiClient"

// the types-only server import adds the role, plan, username, and avatar columns to the session user's type
const additionalFieldsPlugin = inferAdditionalFields<typeof auth>()

// the client as the shared code sees it, typed by the api's auth alone
export type AuthClient = ReturnType<typeof createAuthClient<{ plugins: [typeof additionalFieldsPlugin] }>>

// the client an app configures, typed with the api's auth and the app's own plugins
type AppAuthClient<Plugins extends BetterAuthClientPlugin[]> = ReturnType<
	typeof createAuthClient<{ baseURL: string; plugins: [typeof additionalFieldsPlugin, ...Plugins] }>
>

// the client an app configured, or the browser's own client once something used it
let configuredAuthClient: AuthClient | undefined

/**
 * Configures the auth client with the app's base url and the plugins its platform needs, and returns it typed with
 * those plugins. Throws an error if the client was already used, so an app configures it before the first screen.
 */
export function configureAuthClient<Plugins extends BetterAuthClientPlugin[]>({
	baseURL,
	plugins,
	headers,
}: {
	baseURL: string
	plugins: Plugins
	headers?: Record<string, string>
}): AppAuthClient<Plugins> {
	if (configuredAuthClient) {
		throw new Error("the auth client is already in use. configure it before the first screen renders")
	}

	// the api's fields first, then the app's plugins. the shared code reads the client by the api's fields alone
	const appPlugins = [additionalFieldsPlugin, ...plugins] as [typeof additionalFieldsPlugin, ...Plugins]
	const appAuthClient: AppAuthClient<Plugins> = createAuthClient({
		baseURL,
		plugins: appPlugins,
		fetchOptions: { headers },
	})
	configuredAuthClient = appAuthClient as unknown as AuthClient
	return appAuthClient
}

/**
 * Returns the configured auth client, or the browser's own client, which sends its requests to the page's origin.
 */
export function authClient(): AuthClient {
	configuredAuthClient ??= createAuthClient({ plugins: [additionalFieldsPlugin] })
	return configuredAuthClient
}

/**
 * Drops the client, so a test file can configure one of its own. Only tests call this.
 */
export function resetAuthClient(): void {
	configuredAuthClient = undefined
}

// verifies the turnstile token, then sets the short-lived gate cookie that the signup route reads
export async function passSignupGate(turnstileToken: string): Promise<{ ok: true } | { error: string }> {
	const response = await apiClient().api["signup-gate"].$post({ json: { turnstileToken } })
	return response.ok ? { ok: true } : ((await response.json()) as { error: string })
}

// asks the app gate for its single-use challenge
export async function fetchAppSignupChallenge(): Promise<string> {
	const response = await apiClient().api["signup-gate"]["app-challenge"].$post()
	if (!response.ok) {
		throw new Error(`app signup challenge failed: ${response.status}`)
	}
	return ((await response.json()) as { challenge: string }).challenge
}

// verifies an app's attestation, then sets the same gate cookie. the call goes through the auth client's own fetch,
// whose cookie jar keeps the cookie for the signup request
export async function passAppSignupGate(proof: AppSignupProof): Promise<{ ok: true } | { error: string }> {
	const { error } = await authClient().$fetch<{ ok: true }>(toApiUrl("/api/signup-gate/app"), {
		method: "POST",
		body: proof,
	})
	return error ? { error: error.message ?? "proof rejected" } : { ok: true }
}
