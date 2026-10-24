// the Better Auth request hooks and provider profile mappers: the breach check and the canonical address before a
// credential request, the sign-in and app connection reports after one, where a request came from, and the Google and
// GitHub profiles

import type { AnalyticsEntryPoint } from "@carlnotes/contracts/analyticsEvents"
import { toCanonicalEmail } from "@carlnotes/contracts/emails"
import { MOBILE_APP_SCHEME_ORIGIN } from "@carlnotes/contracts/mobileApp"
import { toDeviceProperties } from "@carlnotes/contracts/userAgent"
import { toProviderUsername } from "@carlnotes/contracts/usernames"
import { trackBotEvent, trackEvent } from "@carlnotes/server/analytics"
import { APIError } from "better-auth"
import { createAuthMiddleware } from "better-auth/api"
import { APPLE_ID_ORIGIN } from "./appleProvider"
import { loadOAuthClientName } from "./mcp/oauthClientNames"
import { isBreachedPassword } from "./passwords"

// the better auth endpoint path for password signup, the only path the gate cookie is required on
export const PASSWORD_SIGNUP_PATH = "/sign-up/email"

// the paths that set a password, the only ones the breach check runs on
const PASSWORD_SETTING_PATHS = new Set([PASSWORD_SIGNUP_PATH, "/reset-password", "/change-password", "/set-password"])

// the paths whose body includes an address that better auth looks up a user by or stores
const EMAIL_BODY_PATHS = new Set([PASSWORD_SIGNUP_PATH, "/sign-in/email", "/request-password-reset", "/change-email"])

// the path the Expo plugin's authorization proxy serves, and the oauth hosts it may send a browser to
const EXPO_AUTHORIZATION_PROXY_PATH = "/expo-authorization-proxy"
const OAUTH_AUTHORIZATION_ORIGINS = new Set(["https://accounts.google.com", "https://github.com", APPLE_ID_ORIGIN])

// the one path that may name the app's scheme as its redirect, and the fields Better Auth reads a redirect from
const SOCIAL_SIGN_IN_PATH = "/sign-in/social"
const REDIRECT_FIELDS = ["callbackURL", "redirectTo", "errorCallbackURL", "newUserCallbackURL"] as const

/**
 * Runs the proxy and redirect checks, the breach check, and the address canonicalization before a credential request.
 */
export const beforeCredentialRequest = createAuthMiddleware(async (context) => {
	rejectUnknownAuthorizationProxy({ path: context.path, query: context.query, headers: context.headers })
	rejectSchemeRedirectOutsideSocialSignIn(context.path, context.body)
	rejectSchemeRedirectOutsideSocialSignIn(context.path, context.query)
	await rejectBreachedPassword(context.path, context.body)
	return toCanonicalEmailBody(context.path, context.body)
})

// what the authorization proxy check reads from a request
type AuthorizationProxyRequest = {
	path: string
	query: Record<string, unknown> | undefined
	headers: Headers | undefined
}

/**
 * Rejects an authorization proxy request whose url is not a provider's sign-in page, or that a signed-in browser sends.
 * The proxy sets the oauth state cookie from its url, which only the app's own browser sign-in may do.
 */
export function rejectUnknownAuthorizationProxy({ path, query, headers }: AuthorizationProxyRequest): void {
	if (path !== EXPO_AUTHORIZATION_PROXY_PATH) {
		return
	}

	// the url must be a provider's sign-in page
	const authorizationUrl = typeof query?.authorizationURL === "string" ? toUrl(query.authorizationURL) : null
	if (!authorizationUrl || !OAUTH_AUTHORIZATION_ORIGINS.has(authorizationUrl.origin)) {
		throw new APIError("FORBIDDEN", { message: "the authorization url is not a provider's sign-in page" })
	}

	// a browser that holds a session is not the app's sign-in browser
	if (headers?.get("cookie")?.includes("session_token")) {
		throw new APIError("FORBIDDEN", { message: "a signed-in browser cannot start a proxied sign-in" })
	}
}

/**
 * Rejects a redirect to the app's scheme on any path but the social sign-in, whose callback the app opens itself. Any
 * installed app can claim a scheme, so a reset link or a verification must never open one. The fields are a request's
 * body or its query, which a verification link's callback comes in.
 */
export function rejectSchemeRedirectOutsideSocialSignIn(
	path: string,
	fields: Record<string, unknown> | undefined,
): void {
	if (path === SOCIAL_SIGN_IN_PATH || !fields) {
		return
	}

	// any redirect field that names the scheme is rejected
	for (const redirectField of REDIRECT_FIELDS) {
		const redirectUrl = fields[redirectField]
		if (typeof redirectUrl === "string" && redirectUrl.toLowerCase().startsWith(MOBILE_APP_SCHEME_ORIGIN)) {
			throw new APIError("FORBIDDEN", { message: `${redirectField} may not open the app from ${path}` })
		}
	}
}

// a url parsed, or null if the text is not one
function toUrl(urlText: string): URL | null {
	try {
		return new URL(urlText)
	} catch {
		return null
	}
}

/**
 * Reports a sign-in's method, and an app's connection once it trades its code for a token, after a request.
 */
export const afterAuthRequest = createAuthMiddleware(async (context) => {
	// report a new session by the path that made it: the password form, the oauth provider in the callback, or the
	// provider whose ID token the app posted
	const newSession = context.context.newSession
	const loginMethod = toLoginMethod(context.path, context.body)
	if (newSession && loginMethod) {
		trackEvent("login_completed", newSession.user.id, {
			entryPoint: toEntryPoint(context.headers, context.body),
			plan: (newSession.user as { plan?: string }).plan ?? "free",
			...toDeviceProperties(context.headers?.get("user-agent")),
			method: loginMethod,
		})
	}

	// report an app's authorization once it trades its code for a token. a refresh reports nothing
	const requestBody = context.body instanceof FormData ? Object.fromEntries(context.body.entries()) : context.body
	const clientId = typeof requestBody?.client_id === "string" ? requestBody.client_id : null
	if (context.path !== "/oauth2/token" || requestBody?.grant_type !== "authorization_code" || !clientId) {
		return
	}
	// name the app by its registration. an unregistered client gets no token, and an unnamed one has no name to report
	const clientName = await loadOAuthClientName(clientId)
	if (!clientName) {
		return
	}
	// report the connection by the app's registered name
	trackBotEvent("mcp_connected", clientName, { entryPoint: "mcp", clientName })
})

/**
 * Returns the login method a request names: email for the password form, the provider for an oauth callback or for an
 * ID token the app posted, or null for any other request.
 */
export function toLoginMethod(path: string, body: Record<string, unknown> | undefined): string | null {
	// the password form
	if (path === "/sign-in/email") {
		return "email"
	}

	// the provider whose ID token the app posted. a browser's social sign-in reports from its callback instead
	if (path === "/sign-in/social" && body?.idToken !== undefined) {
		return typeof body.provider === "string" ? body.provider : null
	}

	// the provider in an oauth callback
	return path.startsWith("/callback/") ? (path.split("/")[2] ?? null) : null
}

/**
 * Returns where a request came from: the mobile app if it sent the Expo origin header or an ID token, which the Expo
 * client sends without the header, else the web.
 */
export function toEntryPoint(
	headers: Headers | undefined,
	body: Record<string, unknown> | undefined,
): AnalyticsEntryPoint {
	return headers?.has("expo-origin") || body?.idToken !== undefined ? "mobile" : "web"
}

// reject a breached password
async function rejectBreachedPassword(path: string, body: Record<string, unknown> | undefined): Promise<void> {
	const password = body?.newPassword ?? body?.password
	if (!PASSWORD_SETTING_PATHS.has(path) || typeof password !== "string") {
		return
	}
	if (await isBreachedPassword(password)) {
		throw new APIError("BAD_REQUEST", {
			message: "That password has appeared in a data breach. Pick one you haven't used elsewhere.",
		})
	}
}

// the request body with its email address canonicalized
function toCanonicalEmailBody(
	path: string,
	body: Record<string, unknown> | undefined,
): { context: { body: Record<string, unknown> } } | undefined {
	if (!EMAIL_BODY_PATHS.has(path) || !body) {
		return undefined
	}
	// sign-up and sign-in name this field "email", while a change of address names the field "newEmail"
	const emailField = typeof body.newEmail === "string" ? "newEmail" : "email"
	const email = body[emailField]
	if (typeof email !== "string") {
		return undefined
	}
	return { context: { body: { ...body, [emailField]: toCanonicalEmail(email) } } }
}

/**
 * Returns a provider profile's address in its canonical form.
 */
export function toCanonicalProfileEmail(profile: { email?: string | null }): { email?: string } {
	return profile.email ? { email: toCanonicalEmail(profile.email) } : {}
}

/**
 * Returns a GitHub profile's canonical address and its handle as the proposed signup username.
 */
export function toGithubProfileUser(profile: { email?: string | null; login: string }): {
	email?: string
	username?: string
} {
	const providerUsername = toProviderUsername(profile.login)
	return { ...toCanonicalProfileEmail(profile), ...(providerUsername ? { username: providerUsername } : {}) }
}
