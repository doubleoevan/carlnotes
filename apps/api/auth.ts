// the app's Better Auth instance: email/password and Google, GitHub, and Apple sign-in, with sessions read from Redis
// first and kept in Postgres through the Drizzle adapter

import { cimd } from "@better-auth/cimd"
import { fetchClientMetadataResource } from "@better-auth/cimd/node"
import { expo } from "@better-auth/expo"
import { mcp } from "@better-auth/mcp"
import { toClientTelemetry } from "@carlnotes/contracts/clientTelemetry"
import { MOBILE_APP_SCHEME_ORIGIN } from "@carlnotes/contracts/mobileApp"
import { SIGNUP_CTA_COOKIE_NAME, toCtaTag } from "@carlnotes/contracts/signupCta"
import { GATE_COOKIE_NAME, MIN_PASSWORD_LENGTH } from "@carlnotes/contracts/signupGate"
import { TERMS_VERSION } from "@carlnotes/contracts/terms"
import { toNormalizedUsername, toProviderUsername } from "@carlnotes/contracts/usernames"
import { db, schema } from "@carlnotes/db"
import { deleteRedisKeys, runWithRedis } from "@carlnotes/db/redis"
import { incrementRateLimitWindow } from "@carlnotes/db/redisRateLimits"
import { provisionLiteLLMKey } from "@carlnotes/models/litellmProxy"
import { trackEvent } from "@carlnotes/server/analytics"
import { appUrl } from "@carlnotes/server/appUrl"
import { reportError } from "@carlnotes/server/monitoring"
import { APIError, betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { jwt } from "better-auth/plugins"
import { eq } from "drizzle-orm"
import { APPLE_PROVIDER_ID, type AppleProviderOptions, toAppleProviderOptions } from "./appleProvider"
import {
	clearResetPasswordTokens,
	sendChangeEmailConfirmationEmail,
	sendResetPasswordEmail,
	sendVerificationEmail,
	VERIFICATION_LINK_HOURS,
} from "./authEmails"
import {
	APPLE_ID_ORIGIN,
	afterAuthRequest,
	beforeCredentialRequest,
	PASSWORD_SIGNUP_PATH,
	toCanonicalProfileEmail,
	toEntryPoint,
	toGithubProfileUser,
} from "./authHooks"
import { userBudgetCents } from "./authorization"
import { cacheSession } from "./sessions"
import { verifyGateToken } from "./signupGate"
import { saveDefaultUserTeam } from "./team/teams"
import { ipAddressOptions } from "./trustedProxies"
import { saveDefaultUsername, toAssignedUsername, toFreeUsernames } from "./usernames"

// how long a password-reset link stays valid
const RESET_TOKEN_LIFETIME_SECONDS = 60 * 60

// how hard the credential endpoints are rate-limited
const CREDENTIAL_RATE_LIMIT_WINDOW_SECONDS = 60
const CREDENTIAL_RATE_MAX = 10

// how many mcp clients one address may register in an hour. a hosted ai app registers its users' clients from a few
// shared addresses
const MCP_REGISTER_RATE_LIMIT_WINDOW_SECONDS = 3600
const MCP_REGISTER_RATE_MAX = 600

// the signed-in user that the session middleware sets on Hono's request context
export type SessionUser = typeof auth.$Infer.Session.user

/**
 * Sends an auth email without holding the request, and logs and reports a send that throws.
 */
export function sendAuthEmailInBackground(emailKind: string, emailSendPromise: Promise<void>): void {
	emailSendPromise.catch((error: unknown) => {
		console.error(`the ${emailKind} email could not be sent`, error)
		reportError(error, "email", { emailKind })
	})
}

/**
 * The Redis storage that Better Auth uses for sessions, verification tokens, and rate limit counts.
 * A failed read is a miss.  Better Auth passes each key's time to live in seconds.
 */
const sessionSecondaryStorage = {
	get: (key: string): Promise<string | null> => runWithRedis("session get", (client) => client.get(key)),
	// read a single-use value and delete it in one step, so two requests never both read it
	getAndDelete: (key: string): Promise<string | null> =>
		runWithRedis("session get and delete", (client) => client.getdel(key)),
	set: async (key: string, value: string, ttlSeconds?: number): Promise<void> => {
		await runWithRedis("session set", (client) =>
			ttlSeconds ? client.set(key, value, "EX", ttlSeconds) : client.set(key, value),
		)
	},
	delete: async (key: string): Promise<void> => {
		await deleteRedisKeys(key)
	},
	// count the hit on the key's rate limit window and return the count
	increment: async (key: string, ttlSeconds: number): Promise<number> =>
		(await incrementRateLimitWindow(key, ttlSeconds * 1000)).count,
}

// the private lan ranges, trusted as patterns in dev with LAN_DEV_URL set, so a phone on the same network may sign in
const LAN_DEV_ORIGINS = ["http://192.168.*.*:*", "http://10.*.*.*:*"]

// the Expo dev server's scheme, which a development client may report as its origin. dev only
const EXPO_DEV_ORIGIN = "exp://"

// the path that Apple posts its sign-in callback to
const APPLE_CALLBACK_PATH = "/api/auth/callback/apple"

/**
 * Returns the origins trusted beyond the app's own: the mobile app's scheme, the development origins in dev, and
 * Apple's origin for Apple's posted callback alone.
 */
export function toTrustedOrigins(request?: Request): string[] {
	// the mobile app's scheme. the host-less pattern trusts every url of the scheme, the sign-in callbacks included
	const trustedOrigins = [MOBILE_APP_SCHEME_ORIGIN]

	// the development origins, in dev only: the Expo dev server's scheme, and the lan with LAN_DEV_URL set
	if (Bun.env.DOPPLER_ENVIRONMENT === "dev") {
		trustedOrigins.push(EXPO_DEV_ORIGIN)
		if (Bun.env.LAN_DEV_URL) {
			trustedOrigins.push(...LAN_DEV_ORIGINS)
		}
	}

	// Apple's origin, for its callback alone. Better Auth checks redirect urls against the list that it gets with no
	// request. a redirect to Apple is never allowed
	const isAppleCallback = request !== undefined && new URL(request.url).pathname === APPLE_CALLBACK_PATH
	return isAppleCallback ? [APPLE_ID_ORIGIN, ...trustedOrigins] : trustedOrigins
}

// the MCP server's url, which every MCP access token is bound to
export const MCP_RESOURCE_URL = `${appUrl()}/mcp`

// the oauth server for the MCP server. a client registers itself, by dynamic registration or a client metadata
// document, then the user signs in and consents. infer makes a client that returns to a loopback or app address native
const mcpPlugin = mcp({
	loginPage: "/login",
	consentPage: "/mcp/consent",
	resource: MCP_RESOURCE_URL,
	allowDynamicClientRegistration: true,
	allowUnauthenticatedClientRegistration: true,
	clientRegistrationDefaultApplicationType: "infer",
})

export const auth = betterAuth({
	database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
	// a session is read from Redis first and kept in Postgres, so an unreachable Redis never signs anyone out.
	// Better Auth's rate limit counts live in Redis alone
	secondaryStorage: sessionSecondaryStorage,
	session: { storeSessionInDatabase: true },
	// a verification value is read from Redis first and kept in Postgres,
	// so an unreachable Redis never breaks a sign-in, a password reset, or a verification link
	verification: { storeInDatabase: true },
	// better auth derives trustedOrigins from baseURL itself. the local fallback is for tests, where the mcp plugin still
	// needs a base url to name its token issuer
	baseURL: appUrl(),
	// these are appended to that derived origin
	trustedOrigins: toTrustedOrigins,
	// email and password sign-in. the reset link is short-lived and a reset revokes every session
	emailAndPassword: {
		enabled: true,
		minPasswordLength: MIN_PASSWORD_LENGTH,
		sendResetPassword: async ({ user, url }) => {
			sendAuthEmailInBackground("reset-password", sendResetPasswordEmail(user.email, url))
		},
		resetPasswordTokenExpiresIn: RESET_TOKEN_LIFETIME_SECONDS,
		revokeSessionsOnPasswordReset: true,
		onPasswordReset: async ({ user }) => {
			await clearResetPasswordTokens(user.id)
		},
	},
	// each provider maps its profile onto the user row, and github's proposes its handle as the username.
	// Apple signs its client secret when Better Auth starts. Apple stays off without its values
	socialProviders: {
		google: {
			clientId: Bun.env.GOOGLE_CLIENT_ID ?? "",
			clientSecret: Bun.env.GOOGLE_CLIENT_SECRET ?? "",
			mapProfileToUser: toCanonicalProfileEmail,
		},
		github: {
			clientId: Bun.env.GITHUB_CLIENT_ID ?? "",
			clientSecret: Bun.env.GITHUB_CLIENT_SECRET ?? "",
			mapProfileToUser: toGithubProfileUser,
		},
		apple: () => toAppleProviderOptions(Bun.env),
	},
	// account linking requires a verified email on both the incoming oauth side and the local row
	account: { accountLinking: { enabled: true } },
	// reject a breached password wherever one is being set, and canonicalize the address wherever one arrives.
	// after a request, report a sign-in and an app's code-for-token exchange
	hooks: { before: beforeCredentialRequest, after: afterAuthRequest },
	// resolve the client address through the trusted proxies
	advanced: { ipAddress: ipAddressOptions },
	// the mobile app's plugin first, which reads a request's expo-origin header as its origin ahead of every other
	// check. then the oauth server for the MCP server, the jwt plugin that signs its access tokens, and client metadata
	// documents as the second way a client registers. the jwt plugin's model is named jwk, so the plural names the jwks
	// table
	plugins: [
		expo(),
		jwt({ schema: { jwks: { modelName: "jwk" } } }),
		mcpPlugin,
		cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
	],
	// rate limiting for credential endpoints
	rateLimit: {
		enabled: true,
		// the paths where a request is a login attempt or sends mail. everything else keeps the default rate limit
		customRules: {
			"/sign-in/email": { window: CREDENTIAL_RATE_LIMIT_WINDOW_SECONDS, max: CREDENTIAL_RATE_MAX },
			"/sign-up/email": { window: CREDENTIAL_RATE_LIMIT_WINDOW_SECONDS, max: CREDENTIAL_RATE_MAX },
			"/request-password-reset": { window: CREDENTIAL_RATE_LIMIT_WINDOW_SECONDS, max: CREDENTIAL_RATE_MAX },
			"/reset-password": { window: CREDENTIAL_RATE_LIMIT_WINDOW_SECONDS, max: CREDENTIAL_RATE_MAX },
			"/change-password": { window: CREDENTIAL_RATE_LIMIT_WINDOW_SECONDS, max: CREDENTIAL_RATE_MAX },
			// an mcp client registers with no credential, and each registration writes a row
			"/oauth2/register": { window: MCP_REGISTER_RATE_LIMIT_WINDOW_SECONDS, max: MCP_REGISTER_RATE_MAX },
		},
	},
	// a non-blocking verification email on signup, whose link lives a day instead of the default hour
	emailVerification: {
		sendVerificationEmail: async ({ user, url }) => {
			sendAuthEmailInBackground("verification", sendVerificationEmail(user.email, url))
		},
		sendOnSignUp: true,
		expiresIn: VERIFICATION_LINK_HOURS * 60 * 60,
	},
	// the litellm virtual key stays server-only. role and plan are included in the session
	user: {
		// changing an address takes two links
		changeEmail: {
			enabled: true,
			sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
				sendAuthEmailInBackground("change-email", sendChangeEmailConfirmationEmail(user.email, newEmail, url))
			},
		},
		additionalFields: {
			litellmVirtualKey: { type: "string", required: false, input: false, returned: false },
			role: { type: "string", required: false, input: false, returned: true },
			plan: { type: "string", required: false, input: false, returned: true },
			// return the username and avatar source with the session
			username: { type: "string", required: true, defaultValue: "", input: false, returned: true },
			// the normalized username for the unique index
			usernameNormalized: { type: "string", required: false, input: false, returned: false },
			avatarSource: { type: "string", required: false, input: false, returned: true },
			avatarKey: { type: "string", required: false, input: false, returned: true },
			// the access requirements to send an invite to this user
			inviteAccess: { type: "string", required: false, input: false, returned: true },
			// whether a Scan's new Findings and a chat mention push to the user's phones, null until the first grant
			isTopicPushEnabled: { type: "boolean", required: false, input: false, returned: true },
			isChatMentionPushEnabled: { type: "boolean", required: false, input: false, returned: true },
			// the Terms version the user accepted and when
			termsAcceptedVersion: { type: "string", required: false, input: false, returned: true },
			termsAcceptedAt: { type: "date", required: false, input: false, returned: true },
		},
	},
	// try to create a LiteLLM key for every new user. the password path also requires a passing turnstile check
	databaseHooks: {
		user: {
			create: {
				before: async (user, context) => {
					if (context?.path === PASSWORD_SIGNUP_PATH) {
						// fail closed. no cookie or an expired one means turnstile was never actually checked
						const gateToken = context.getCookie(GATE_COOKIE_NAME) ?? null
						const isGateVerified = gateToken ? await verifyGateToken(gateToken) : false
						if (!isGateVerified) {
							throw new APIError("BAD_REQUEST", { message: "missing or expired turnstile check" })
						}
					}

					// create a LiteLLM key for the new user, budgeted at the free plan that the user starts on.
					// if the LiteLLM proxy fails or times out, the user has no key. the user's first model call creates the key
					const litellmVirtualKey = await provisionLiteLLMKey(
						user.email,
						userBudgetCents({ isAdmin: false, plan: "free", budgetOverrideCents: null }),
					).catch((error: unknown) => {
						console.error("could not create a litellm key at signup", error)
						reportError(error, "billing", { signupPath: context?.path ?? "unknown" })
						return undefined
					})

					// the provider's own handle is kept when it is well-formed and nobody holds it. GitHub's
					// mapper proposes it on the user, and everything else falls back to a generated name
					const providerUsername = toProviderUsername((user as { username?: unknown }).username)
					const isProviderUsernameFree =
						providerUsername !== null && (await toFreeUsernames([providerUsername])).length > 0
					const username = isProviderUsernameFree && providerUsername ? providerUsername : await toAssignedUsername()

					// every sign-up path accepts the published Terms by continuing, recorded by the server's own version
					return {
						data: {
							...user,
							litellmVirtualKey,
							username,
							usernameNormalized: toNormalizedUsername(username),
							termsAcceptedVersion: TERMS_VERSION,
							termsAcceptedAt: new Date(),
						},
					}
				},
				// track the signup funnel's final event
				after: async (user, context) => {
					// the unique index on the normalized username reserves the name
					const { username } = user as { username?: string }
					const settledUsername = await saveDefaultUsername(user.id, username ?? (await toAssignedUsername()))

					// the team named after them, made once the username is settled. a failure here must not fail the signup
					if (settledUsername) {
						await saveDefaultUserTeam(user.id, settledUsername).catch((error) => {
							console.error(`could not create the signup team for user ${user.id}`, error)
							reportError(error, "chat", { userId: user.id })
						})
					}
					// the signup funnel's final event, tagged with what converted and from where
					const ctaTag = toCtaTag(context?.getCookie(SIGNUP_CTA_COOKIE_NAME) ?? null)
					trackEvent("signup_completed", user.id, {
						plan: "free",
						...toClientTelemetry((name) => context?.headers?.get(name)),
						entryPoint: toEntryPoint(context?.headers, context?.body),
						...(ctaTag ? { cta: ctaTag } : {}),
					})
				},
			},
		},
		session: {
			create: {
				// a session is created by a sign-in, so its time is the user's last login.
				// a failed write must not fail the sign-in, so it is logged and left
				after: async (session) => {
					await db
						.update(schema.users)
						.set({ lastLoginAt: new Date() })
						.where(eq(schema.users.id, session.userId))
						.catch((error) => {
							console.error(`could not save the login time for user ${session.userId}`, error)
						})
				},
			},
			delete: {
				// delete the Redis copy of each session that Better Auth deletes from Postgres,
				// including a session that the user's active-sessions list missed
				after: async (session) => {
					await deleteRedisKeys(session.token)
				},
			},
			update: {
				// store a refreshed session in Redis if Redis holds no copy.
				// a session that Redis lost or never held is stored at its next daily refresh
				after: async (session, context) => {
					// a refresh that matched no Postgres row passes no session, and Better Auth already extended the Redis copy.
					// delete the Redis copy that the request's cookie names
					if (!session) {
						const revokedSessionToken = await context?.getSignedCookie(
							context.context.authCookies.sessionToken.name,
							context.context.secret,
						)
						if (revokedSessionToken) {
							await deleteRedisKeys(revokedSessionToken)
						}
						return
					}

					// a failed write must not fail the request
					await cacheSession(session).catch((error) => {
						console.error(`could not cache the session for user ${session.userId}`, error)
					})
				},
			},
		},
	},
})

/**
 * Returns the options of the Apple provider that Better Auth registered, or undefined if Apple is off.
 */
export async function loadAppleProviderOptions(): Promise<AppleProviderOptions | undefined> {
	const authContext = await auth.$context
	const appleProvider = authContext.socialProviders.find((socialProvider) => socialProvider.id === APPLE_PROVIDER_ID)
	return appleProvider?.options as AppleProviderOptions | undefined
}
