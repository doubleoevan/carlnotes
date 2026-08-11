// the app's Better Auth instance: email/password and Google/GitHub sign-in, sessions in Neon via the Drizzle adapter
import { trackEvent } from "@shared/analytics"
import { SIGNUP_CTA_COOKIE_NAME, toCtaTag } from "@shared/contracts"
import { isInAppBrowser, toBrowserPlatform, toPlatform } from "@shared/userAgent"
import { toNormalizedUsername } from "@shared/usernames"
import { APIError, betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { hashPassword } from "better-auth/crypto"
import { and, eq, like } from "drizzle-orm"
import { db } from "../db"
import * as schema from "../db/schema"
import { sendEmail } from "../worker/email"
import { effectiveBudgetCents } from "./authorization"
import { provisionLiteLLMKey } from "./litellm"
import { isBreachedPassword } from "./passwords"
import { toAssignedUsername } from "./usernames"

// how long a signup-gate token stays valid
const GATE_TOKEN_LIFETIME_MS = 15 * 60 * 1000

// the matching browser-side cookie lifetime
export const GATE_COOKIE_MAX_AGE_SECONDS = GATE_TOKEN_LIFETIME_MS / 1000

// the cookie name /api/signup-gate writes and the create.before hook reads
export const GATE_COOKIE_NAME = "signup_gate"

// the better auth endpoint path for password signup, the only path the gate cookie is required on
const PASSWORD_SIGNUP_PATH = "/sign-up/email"

// how long a password-reset link stays valid. it is a bearer token sitting in an inbox, so the window is short
const RESET_TOKEN_LIFETIME_SECONDS = 60 * 60

// the password floor. above Better Auth's default of 8
const MIN_PASSWORD_LENGTH = 12

// how hard the credential endpoints are rate-limited. ten guesses a second.
const CREDENTIAL_RATE_WINDOW_SECONDS = 60
const CREDENTIAL_RATE_MAX = 10

// the signed-in user that the session middleware sets on Hono's request context
export type SessionUser = typeof auth.$Infer.Session.user

// whether a phone on the same network may sign in against this server, which is a dev-only convenience
const isLanDevOriginTrusted = Boolean(Bun.env.LAN_DEV_URL) && Bun.env.DOPPLER_ENVIRONMENT === "dev"

export const auth = betterAuth({
	database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
	// better auth derives trustedOrigins from baseURL itself, so BETTER_AUTH_URL alone is enough
	baseURL: Bun.env.BETTER_AUTH_URL,
	// these are appended to that derived origin, so only the lan address belongs here
	trustedOrigins: isLanDevOriginTrusted ? [Bun.env.LAN_DEV_URL ?? ""] : undefined,
	// the reset link is a bearer token in someone's inbox, so it is short-lived.
	// completing a password reset ends every session that existed before it.
	emailAndPassword: {
		enabled: true,
		minPasswordLength: MIN_PASSWORD_LENGTH,
		// check if the password was breached
		password: {
			hash: async (password) => {
				if (await isBreachedPassword(password)) {
					throw new APIError("BAD_REQUEST", {
						message: "That password has appeared in a data breach. Pick one you haven't used elsewhere.",
					})
				}
				return hashPassword(password)
			},
		},
		sendResetPassword: async ({ user, url }) => {
			await sendResetPasswordEmail(user.email, url)
		},
		resetPasswordTokenExpiresIn: RESET_TOKEN_LIFETIME_SECONDS,
		revokeSessionsOnPasswordReset: true,
		onPasswordReset: async ({ user }) => {
			await clearResetPasswordTokens(user.id)
		},
	},
	socialProviders: {
		google: { clientId: Bun.env.GOOGLE_CLIENT_ID ?? "", clientSecret: Bun.env.GOOGLE_CLIENT_SECRET ?? "" },
		github: { clientId: Bun.env.GITHUB_CLIENT_ID ?? "", clientSecret: Bun.env.GITHUB_CLIENT_SECRET ?? "" },
	},
	// implicit linking keeps its safe default: a verified email on both the incoming oauth side and the local row
	account: { accountLinking: { enabled: true } },
	// rate limiting for credential endpoints
	rateLimit: {
		enabled: true,
		// the paths where a request is a login attempt or sends mail
		// everything else keeps the default rate-limit ceiling
		customRules: {
			"/sign-in/email": { window: CREDENTIAL_RATE_WINDOW_SECONDS, max: CREDENTIAL_RATE_MAX },
			"/sign-up/email": { window: CREDENTIAL_RATE_WINDOW_SECONDS, max: CREDENTIAL_RATE_MAX },
			"/request-password-reset": { window: CREDENTIAL_RATE_WINDOW_SECONDS, max: CREDENTIAL_RATE_MAX },
			"/reset-password": { window: CREDENTIAL_RATE_WINDOW_SECONDS, max: CREDENTIAL_RATE_MAX },
			"/change-password": { window: CREDENTIAL_RATE_WINDOW_SECONDS, max: CREDENTIAL_RATE_MAX },
		},
	},
	// a non-blocking verification email on signup, so a password account can later link to an oauth one
	emailVerification: {
		sendVerificationEmail: async ({ user, url }) => {
			await sendVerificationEmail(user.email, url)
		},
		sendOnSignUp: true,
	},
	// the litellm virtual key stays server-only. role and plan are included in the session
	// so the ui can render the admin link and the account page
	user: {
		additionalFields: {
			litellmVirtualKey: { type: "string", required: false, input: false, returned: false },
			role: { type: "string", required: false, input: false, returned: true },
			plan: { type: "string", required: false, input: false, returned: true },
			// the username and avatar source are included, so the header can display the user's own avatar without making a request.
			// required narrows the session type to string. the empty default only passes create-time validation, which runs
			// before the create hook writes the real name
			username: { type: "string", required: true, defaultValue: "", input: false, returned: true },
			// include the generated username with the signup
			usernameNormalized: { type: "string", required: false, input: false, returned: false },
			avatarSource: { type: "string", required: false, input: false, returned: true },
			avatarKey: { type: "string", required: false, input: false, returned: true },
		},
	},
	// provision the key for every new user. the password path also requires a passing turnstile check
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

					// mint a litellm key for the new user, budgeted at the free plan they start on
					const litellmVirtualKey = await provisionLiteLLMKey(
						user.email,
						effectiveBudgetCents({ isAdmin: false, plan: "free", budgetOverrideCents: null }),
					)

					// generate a username during signup
					const username = await toAssignedUsername()
					return {
						data: { ...user, litellmVirtualKey, username, usernameNormalized: toNormalizedUsername(username) },
					}
				},
				// track the signup funnel's terminal event
				after: async (user, context) => {
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
// exported so the reset password request can use the same verification
export async function verifyGateToken(token: string): Promise<boolean> {
	const [payload, signature] = token.split(".")
	if (!payload || !signature || signature !== (await toSignature(payload))) {
		return false
	}
	// signature checks out. decode the payload and enforce its expiry
	const { expiresAt } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { expiresAt: number }
	return Date.now() < expiresAt
}

// clears all outstanding password reset tokens on password reset
async function clearResetPasswordTokens(userId: string): Promise<void> {
	await db
		.delete(schema.verifications)
		.where(and(like(schema.verifications.identifier, "reset-password:%"), eq(schema.verifications.value, userId)))
}

// sends the reset-password link. one sentence and a url.
async function sendResetPasswordEmail(email: string, url: string): Promise<void> {
	await sendEmail({
		to: email,
		subject: "Reset your password",
		emailContent: `Reset your password: <a href="${url}">${url}</a>. The link works once and expires in an hour. Ignore this email if you didn't ask for it.`,
		emailKind: "password-reset",
	})
}

// sends the signup email-verification link. a delivery failure is logged, not fatal
async function sendVerificationEmail(email: string, url: string): Promise<void> {
	// the verification link as minimal HTML
	await sendEmail({
		to: email,
		subject: "Confirm your email",
		emailContent: `Confirm your email: <a href="${url}">${url}</a>`,
		emailKind: "verification",
	})
}

// the value's signature, keyed on the app's auth secret so a tampered token can't verify. HMAC-SHA256, base64url-encoded
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
