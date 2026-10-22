// the Better Auth request hooks and provider profile mappers: the breach check and the canonical address before a
// credential request, the sign-in and app connection reports after one, and the Google and GitHub profiles

import { toCanonicalEmail } from "@carlnotes/contracts/emails"
import { toDeviceProperties } from "@carlnotes/contracts/userAgent"
import { toProviderUsername } from "@carlnotes/contracts/usernames"
import { trackBotEvent, trackEvent } from "@carlnotes/server/analytics"
import { APIError } from "better-auth"
import { createAuthMiddleware } from "better-auth/api"
import { loadOAuthClientName } from "./mcp/oauthClientNames"
import { isBreachedPassword } from "./passwords"

// the better auth endpoint path for password signup, the only path the gate cookie is required on
export const PASSWORD_SIGNUP_PATH = "/sign-up/email"

// the paths that set a password, the only ones the breach check runs on
const PASSWORD_SETTING_PATHS = new Set([PASSWORD_SIGNUP_PATH, "/reset-password", "/change-password", "/set-password"])

// the paths whose body includes an address that better auth looks up a user by or stores
const EMAIL_BODY_PATHS = new Set([PASSWORD_SIGNUP_PATH, "/sign-in/email", "/request-password-reset", "/change-email"])

/**
 * Runs the breach check and the address canonicalization before a credential request.
 */
export const beforeCredentialRequest = createAuthMiddleware(async (context) => {
	await rejectBreachedPassword(context.path, context.body)
	return toCanonicalEmailBody(context.path, context.body)
})

/**
 * Reports a sign-in's method, and an app's connection once it trades its code for a token, after a request.
 */
export const afterAuthRequest = createAuthMiddleware(async (context) => {
	// report a new session by the path that made it: the password form, or the oauth provider in the callback
	const newSession = context.context.newSession
	const loginMethod = toLoginMethod(context.path)
	if (newSession && loginMethod) {
		trackEvent("login_completed", newSession.user.id, {
			entryPoint: "web",
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

// the login method a request path names: email for the password form, the provider for an oauth callback, or null
function toLoginMethod(path: string): string | null {
	if (path === "/sign-in/email") {
		return "email"
	}
	return path.startsWith("/callback/") ? (path.split("/")[2] ?? null) : null
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
