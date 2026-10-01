// the app's Better Auth instance: email/password and Google/GitHub sign-in, with sessions read from Redis first
// and kept in Postgres through the Drizzle adapter
import { trackEvent } from "@shared/analytics"
import { appBaseUrl } from "@shared/appUrl"
import { SIGNUP_CTA_COOKIE_NAME, toCtaTag } from "@shared/contracts"
import { toCanonicalEmail } from "@shared/emails"
import { reportError } from "@shared/monitoring"
import { isInAppBrowser, toBrowserPlatform, toPlatform } from "@shared/userAgent"
import { toNormalizedUsername, toProviderUsername } from "@shared/usernames"
import { APIError, betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { createAuthMiddleware } from "better-auth/api"
import { mcp } from "better-auth/plugins"
import { and, eq, like } from "drizzle-orm"
import { db } from "../db"
import { deleteRedisKey, incrementRateLimitWindow, runWithRedis } from "../db/redis"
import * as schema from "../db/schema"
import { renderAuthEmail, renderAuthEmailText } from "../emails/auth-email"
import { isInternalAddress, provisionLiteLLMKey } from "../worker"
import { sendEmail } from "../worker/email"
import { userBudgetCents } from "./authorization"
import { isBreachedPassword } from "./passwords"
import { cacheSession } from "./sessions"
import { saveDefaultUserTeam } from "./team/teams"
import { ipAddressOptions, resolveClientAddress, trustedProxies } from "./trustedProxies"
import { saveDefaultUsername, toAssignedUsername, toFreeUsernames } from "./usernames"

// how long a signup-gate token stays valid
const GATE_TOKEN_LIFETIME_MS = 15 * 60 * 1000

// how long an email-verification link works, which the email that carries it also states
const VERIFICATION_LINK_HOURS = 24

// the matching browser-side cookie lifetime
export const GATE_COOKIE_MAX_AGE_SECONDS = GATE_TOKEN_LIFETIME_MS / 1000

// the cookie name /api/signup-gate writes and the create.before hook reads
export const GATE_COOKIE_NAME = "signup_gate"

// the better auth endpoint path for password signup, the only path the gate cookie is required on
const PASSWORD_SIGNUP_PATH = "/sign-up/email"

// the paths that set a password, the only ones the breach check runs on
const PASSWORD_SETTING_PATHS = new Set([PASSWORD_SIGNUP_PATH, "/reset-password", "/change-password", "/set-password"])

// the paths whose body includes an address that better auth looks up a user by or stores
const EMAIL_BODY_PATHS = new Set([PASSWORD_SIGNUP_PATH, "/sign-in/email", "/request-password-reset", "/change-email"])

// how long a password-reset link stays valid
const RESET_TOKEN_LIFETIME_SECONDS = 60 * 60

// the minimum password length. above Better Auth's default of 8
const MIN_PASSWORD_LENGTH = 12

// how hard the credential endpoints are rate-limited
const CREDENTIAL_RATE_LIMIT_WINDOW_SECONDS = 60
const CREDENTIAL_RATE_MAX = 10

// the signed-in user that the session middleware sets on Hono's request context
export type SessionUser = typeof auth.$Infer.Session.user

/**
 * The Redis storage that Better Auth uses for sessions, verification tokens, and rate limit counts.
 * A failed read is a miss, and a failed count is zero. Better Auth passes each key's time to live in seconds.
 */
const sessionSecondaryStorage = {
	get: (key: string): Promise<string | null> => runWithRedis("session get", (client) => client.get(key)),
	set: async (key: string, value: string, ttlSeconds?: number): Promise<void> => {
		await runWithRedis("session set", (client) =>
			ttlSeconds ? client.set(key, value, "EX", ttlSeconds) : client.set(key, value),
		)
	},
	delete: deleteRedisKey,
	increment: async (key: string, ttlSeconds: number): Promise<number> => {
		// count the hit on the key's rate limit window and return the count, or zero if Redis could not count the hit
		const rateLimitWindowHit = await incrementRateLimitWindow(key, ttlSeconds * 1000)
		return rateLimitWindowHit?.count ?? 0
	},
}

// whether a phone on the same network may sign in against this server. dev only
const isLanDevOriginTrusted = Boolean(Bun.env.LAN_DEV_URL) && Bun.env.DOPPLER_ENVIRONMENT === "dev"

// the private lan ranges, trusted as patterns. isLanDevOriginTrusted turns them on
const LAN_DEV_ORIGINS = ["http://192.168.*.*:*", "http://10.*.*.*:*"]

// the hook that better auth takes, running both of the checks before a credential request
const beforeCredentialRequest = createAuthMiddleware(async (context) => {
	await rejectBreachedPassword(context.path, context.body)
	return toCanonicalEmailBody(context.path, context.body)
})

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

// a provider can return any gmail variant of one mailbox
function toCanonicalProfileEmail(profile: { email?: string | null }): { email?: string } {
	return profile.email ? { email: toCanonicalEmail(profile.email) } : {}
}

// GitHub sends its handle as login, proposed as the signup username. Google sends only a real name, never proposed
function toGithubProfileUser(profile: { email?: string | null; login: string }): {
	email?: string
	username?: string
} {
	const providerUsername = toProviderUsername(profile.login)
	return { ...toCanonicalProfileEmail(profile), ...(providerUsername ? { username: providerUsername } : {}) }
}

// an oauth signup arrives with the provider's photo already on image. a password signup never has one
export function toSignupAvatarSource(image: string | null | undefined): "oauth" | "generated" {
	return image ? "oauth" : "generated"
}

// whether this process has checked TRUSTED_PROXIES against a request. each process checks only one request
let hasCheckedTrustedProxies = false

/**
 * Logs a warning once per process if TRUSTED_PROXIES is unset or misses a hop behind Cloudflare.
 */
export function checkTrustedProxies(request: Request): void {
	// run the check once per process, on a request through Cloudflare if TRUSTED_PROXIES is set
	const isThroughCloudflare = request.headers.has("cf-ray")
	if (hasCheckedTrustedProxies || (trustedProxies.length > 0 && !isThroughCloudflare)) {
		return
	}
	hasCheckedTrustedProxies = true

	// log a warning if TRUSTED_PROXIES is unset or misses a hop in this request's x-forwarded-for header
	const trustedProxiesWarning = toTrustedProxiesWarning({
		forwardedFor: request.headers.get("x-forwarded-for"),
		clientAddress: resolveClientAddress(request),
		trustedProxyCount: trustedProxies.length,
	})
	if (trustedProxiesWarning) {
		console.warn(trustedProxiesWarning)
	}
}

// one request's x-forwarded-for header, the client address it resolved to, and how many proxies are in TRUSTED_PROXIES
type ToTrustedProxiesWarningOptions = {
	forwardedFor: string | null
	clientAddress: string | null
	trustedProxyCount: number
}

/**
 * Returns the warning to log for an x-forwarded-for header, or null if TRUSTED_PROXIES resolves it to a public client.
 */
export function toTrustedProxiesWarning({
	forwardedFor,
	clientAddress,
	trustedProxyCount,
}: ToTrustedProxiesWarningOptions): string | null {
	// the header's comma-separated hops, cleaned of padding and empties
	const hops = (forwardedFor ?? "")
		.split(",")
		.map((hop) => hop.trim())
		.filter(Boolean)

	// if TRUSTED_PROXIES is set, warn unless the header resolved to a public client.
	// no address or an internal one means the platform added a hop that TRUSTED_PROXIES lacks
	if (trustedProxyCount > 0) {
		return clientAddress && !isInternalAddress(clientAddress)
			? null
			: `TRUSTED_PROXIES leaves x-forwarded-for "${hops.join(", ")}" at ${clientAddress ?? "no address"}. ` +
					"Add the hop after Cloudflare's to TRUSTED_PROXIES"
	}

	// if TRUSTED_PROXIES is unset, a missing header means the platform is not forwarding, and there is no address to read
	if (hops.length === 0) {
		return "no x-forwarded-for on the first request, so no client address can be resolved at all"
	}
	// everything after the leading address is a proxy, and those are what TRUSTED_PROXIES names
	return (
		`TRUSTED_PROXIES is unset and x-forwarded-for arrived with ${hops.length} hop(s). ` +
		`Set it to the proxy hop(s) behind the user: ${hops.slice(1).join(", ") || "(none, the header has only the user)"}`
	)
}

// the oauth server plugin, minus its options property. `tsc -b` cannot name that property's type in auth's declaration
const { options: _mcpOptions, ...mcpPlugin } = mcp({
	loginPage: "/login",
	resource: `${appBaseUrl()}/mcp`,
	oidcConfig: { loginPage: "/login", consentPage: "/mcp/consent" },
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
	// better auth derives trustedOrigins from baseURL itself
	baseURL: Bun.env.BETTER_AUTH_URL,
	// these are appended to that derived origin
	trustedOrigins: isLanDevOriginTrusted ? LAN_DEV_ORIGINS : undefined,
	// email and password sign-in. the reset link is short-lived and a reset revokes every session
	emailAndPassword: {
		enabled: true,
		minPasswordLength: MIN_PASSWORD_LENGTH,
		sendResetPassword: async ({ user, url }) => {
			await sendResetPasswordEmail(user.email, url)
		},
		resetPasswordTokenExpiresIn: RESET_TOKEN_LIFETIME_SECONDS,
		revokeSessionsOnPasswordReset: true,
		onPasswordReset: async ({ user }) => {
			await clearResetPasswordTokens(user.id)
		},
	},
	// each provider maps its profile onto the user row, and github's proposes its handle as the username
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
	},
	// account linking requires a verified email on both the incoming oauth side and the local row
	account: { accountLinking: { enabled: true } },
	// reject a breached password wherever one is being set, and canonicalize the address wherever one arrives
	hooks: { before: beforeCredentialRequest },
	// resolve the client address through the trusted proxies
	advanced: { ipAddress: ipAddressOptions },
	// the oauth server for the mcp server. a client registers itself, then the user signs in and consents
	plugins: [mcpPlugin],
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
		},
	},
	// a non-blocking verification email on signup, whose link lives a day instead of the default hour
	emailVerification: {
		sendVerificationEmail: async ({ user, url }) => {
			await sendVerificationEmail(user.email, url)
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
				await sendChangeEmailConfirmationEmail(user.email, newEmail, url)
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
					const avatarSource = toSignupAvatarSource(user.image)
					return {
						data: {
							...user,
							litellmVirtualKey,
							username,
							usernameNormalized: toNormalizedUsername(username),
							avatarSource,
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
					const userAgent = context?.headers?.get("user-agent")
					trackEvent("signup_completed", user.id, {
						plan: "free",
						platform: toPlatform(userAgent),
						browserPlatform: toBrowserPlatform(userAgent ?? ""),
						isInAppBrowser: isInAppBrowser(userAgent ?? ""),
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
				after: (session) => deleteRedisKey(session.token),
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
							await deleteRedisKey(revokedSessionToken)
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

// signs a short-lived token proving turnstile was checked, for the signup-gate cookie
export async function signGateToken(): Promise<string> {
	const expiresAt = Date.now() + GATE_TOKEN_LIFETIME_MS
	const payload = Buffer.from(JSON.stringify({ expiresAt })).toString("base64url")
	return `${payload}.${await toSignature(payload)}`
}

// verifies a turnstile token server-side against cloudflare. required on the password signup path only
export async function verifyTurnstileToken(token: string): Promise<boolean> {
	const secret = Bun.env.TURNSTILE_SECRET_KEY
	if (!secret) {
		throw new Error("TURNSTILE_SECRET_KEY must be set to verify a signup's turnstile token")
	}
	// verify server-side against cloudflare's siteverify endpoint
	const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({ secret, response: token }),
	})
	const verification = (await response.json()) as { success: boolean }
	return verification.success
}

// verifies a signup-gate token's signature and expiry
export async function verifyGateToken(token: string): Promise<boolean> {
	const [payload, signature] = token.split(".")
	if (!payload || !signature || signature !== (await toSignature(payload))) {
		return false
	}
	// signature checks out. decode the payload and enforce its expiry
	const { expiresAt } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { expiresAt: number }
	return Date.now() < expiresAt
}

// delete every outstanding reset-password link of a user from Postgres and from Redis
async function clearResetPasswordTokens(userId: string): Promise<void> {
	// delete the user's reset-password rows and return each row's identifier
	const deletedVerifications = await db
		.delete(schema.verifications)
		.where(and(like(schema.verifications.identifier, "reset-password:%"), eq(schema.verifications.value, userId)))
		.returning({ identifier: schema.verifications.identifier })

	// delete each row's Redis copy, which Better Auth keys by the row's identifier
	await Promise.all(deletedVerifications.map(({ identifier }) => deleteRedisKey(`verification:${identifier}`)))
}

// sends the reset-password link
async function sendResetPasswordEmail(email: string, url: string): Promise<void> {
	const emailProps = {
		heading: "Reset your password",
		lead: "Carl can let you back in. Pick a new password with the link below.",
		buttonLabel: "Reset your password",
		url,
		linkNote: "The link works once and expires in an hour.",
		appUrl: appBaseUrl(),
	}
	await sendEmail({
		to: email,
		subject: "Reset your password",
		emailContent: await renderAuthEmail(emailProps),
		plainTextContent: await renderAuthEmailText(emailProps),
		emailKind: "password-reset",
	})
}

// sends the link that authorizes a change of address to the current address instead of the new one
async function sendChangeEmailConfirmationEmail(currentEmail: string, newEmail: string, url: string): Promise<void> {
	const emailProps = {
		heading: "Confirm your new email",
		lead: `Someone asked to move this account to ${newEmail}. Confirm it and Carl will send notes to the new address.`,
		buttonLabel: "Confirm the change",
		url,
		linkNote: "Nothing changes until you confirm.",
		appUrl: appBaseUrl(),
	}
	await sendEmail({
		to: currentEmail,
		subject: "Confirm your new email",
		emailContent: await renderAuthEmail(emailProps),
		plainTextContent: await renderAuthEmailText(emailProps),
		emailKind: "email-change",
	})
}

// sends the signup email-verification link. a delivery failure is logged but not fatal
async function sendVerificationEmail(email: string, url: string): Promise<void> {
	const emailProps = {
		heading: "Confirm your email",
		lead: `Carl is ready to start reading for you. Confirm this address so he knows where to send what he finds. The link works for ${VERIFICATION_LINK_HOURS} hours.`,
		buttonLabel: "Confirm your email",
		url,
		appUrl: appBaseUrl(),
	}
	await sendEmail({
		to: email,
		subject: "Confirm your email",
		emailContent: await renderAuthEmail(emailProps),
		plainTextContent: await renderAuthEmailText(emailProps),
		emailKind: "verification",
	})
}

// the value's signature, keyed on the app's auth secret. HMAC-SHA256, base64url-encoded
async function toSignature(value: string): Promise<string> {
	const secret = Bun.env.BETTER_AUTH_SECRET
	if (!secret) {
		throw new Error("BETTER_AUTH_SECRET must be set to sign the signup-gate cookie")
	}
	// import the app secret as a signing key
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	)
	// sign and encode for a cookie-safe, url-safe string
	const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))
	return Buffer.from(signature).toString("base64url")
}
