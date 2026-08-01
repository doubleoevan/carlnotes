// the app's Better Auth instance: email/password and Google/GitHub sign-in, sessions in Neon via the Drizzle adapter
import { toPlatform, trackEvent } from "@shared/analytics"
import { SIGNUP_CTA_COOKIE_NAME, toCtaTag } from "@shared/contracts"
import { APIError, betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "../db"
import * as schema from "../db/schema"
import { sendEmail } from "../worker/email"
import { effectiveBudgetCents } from "./authorization"
import { provisionLiteLLMKey } from "./litellm"

// how long a signup-gate token stays valid
const GATE_TOKEN_LIFETIME_MS = 15 * 60 * 1000

// the matching browser-side cookie lifetime
export const GATE_COOKIE_MAX_AGE_SECONDS = GATE_TOKEN_LIFETIME_MS / 1000

// the cookie name /api/signup-gate writes and the create.before hook reads
export const GATE_COOKIE_NAME = "signup_gate"

// the better auth endpoint path for password signup, the only path the gate cookie is required on
const PASSWORD_SIGNUP_PATH = "/sign-up/email"

// the signed-in user Hono's session that middleware sets on the request context
export type SessionUser = typeof auth.$Infer.Session.user

export const auth = betterAuth({
	database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
	// better auth derives trustedOrigins from baseURL itself, so BETTER_AUTH_URL alone is enough
	baseURL: Bun.env.BETTER_AUTH_URL,
	emailAndPassword: { enabled: true },
	socialProviders: {
		google: { clientId: Bun.env.GOOGLE_CLIENT_ID ?? "", clientSecret: Bun.env.GOOGLE_CLIENT_SECRET ?? "" },
		github: { clientId: Bun.env.GITHUB_CLIENT_ID ?? "", clientSecret: Bun.env.GITHUB_CLIENT_SECRET ?? "" },
	},
	// implicit linking keeps its safe default: a verified email on both the incoming oauth side and the local row
	account: { accountLinking: { enabled: true } },
	// a non-blocking verification email on signup, so a password account can later link to an oauth one
	emailVerification: {
		sendVerificationEmail: async ({ user, url }) => {
			await sendVerificationEmail(user.email, url)
		},
		sendOnSignUp: true,
	},
	// the litellm virtual key stays server-only. role and plan ride on the session so the ui can render the
	// admin link and the account page. all three are app-managed columns, never client input
	user: {
		additionalFields: {
			litellmVirtualKey: { type: "string", required: false, input: false, returned: false },
			role: { type: "string", required: false, input: false, returned: true },
			plan: { type: "string", required: false, input: false, returned: true },
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
					return { data: { ...user, litellmVirtualKey } }
				},
				// track the signup funnel's terminal event
				after: async (user, context) => {
					const ctaTag = toCtaTag(context?.getCookie(SIGNUP_CTA_COOKIE_NAME) ?? null)
					const platform = toPlatform(context?.headers?.get("user-agent"))
					trackEvent("signup_completed", user.id, { plan: "free", platform, ...(ctaTag ? { cta: ctaTag } : {}) })
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
	const result = (await response.json()) as { success: boolean }
	return result.success
}

// verifies a signup-gate token's signature and expiry
async function verifyGateToken(token: string): Promise<boolean> {
	const [payload, signature] = token.split(".")
	if (!payload || !signature || signature !== (await toSignature(payload))) {
		return false
	}
	// signature checks out. decode the payload and enforce its expiry
	const { expiresAt } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { expiresAt: number }
	return Date.now() < expiresAt
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
