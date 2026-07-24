// the app's Better Auth instance: email/password and Google/GitHub sign-in, sessions in Neon via the Drizzle adapter
import { APIError, betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "../db"
import * as schema from "../db/schema"

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

// the free tier's monthly litellm budget, provisioned at signup and reset every 30 days
// TODO: source from PLANS.free.llmBudgetUsdMonthly and bump the key via /key/update on upgrade, once the plans file merges
const FREE_TIER_MONTHLY_BUDGET_USD = 10

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
	// the litellm virtual key, server-only and never exposed to the client
	user: {
		additionalFields: {
			litellmVirtualKey: { type: "string", required: false, input: false, returned: false },
		},
	},
	// provision the key for every new user; the password path also requires a passing turnstile check
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

					// keyed on email, not id. the oauth signup path never has a final user id at this point
					const litellmVirtualKey = await provisionLiteLLMKey(user.email)
					return { data: { ...user, litellmVirtualKey } }
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

// provisions a litellm virtual key with a spend budget for a new user. worker/models.ts bills scans to it
async function provisionLiteLLMKey(email: string): Promise<string> {
	const baseURL = Bun.env.LITELLM_BASE_URL
	const masterKey = Bun.env.LITELLM_MASTER_KEY
	if (!baseURL || !masterKey) {
		throw new Error("LITELLM_BASE_URL and LITELLM_MASTER_KEY must be set to provision a user's virtual key")
	}
	// ask the proxy to mint a budgeted litellm key
	const response = await fetch(`${baseURL}/key/generate`, {
		method: "POST",
		headers: { Authorization: `Bearer ${masterKey}`, "Content-Type": "application/json" },
		body: JSON.stringify({
			user_id: email,
			key_alias: `user:${email}`,
			max_budget: FREE_TIER_MONTHLY_BUDGET_USD,
			budget_duration: "30d",
		}),
	})
	// surface a specific failure rather than an opaque parse error downstream
	if (!response.ok) {
		throw new Error(`litellm key/generate failed: ${response.status} ${await response.text()}`)
	}
	const { key } = (await response.json()) as { key: string }
	return key
}

// sends the signup email-verification link via resend's api. never throws: a delivery failure is logged, not fatal
async function sendVerificationEmail(email: string, url: string): Promise<void> {
	const apiKey = Bun.env.RESEND_API_KEY
	const from = Bun.env.RESEND_FROM_EMAIL
	if (!apiKey || !from) {
		console.error("RESEND_API_KEY and RESEND_FROM_EMAIL must be set to send the signup verification email")
		return
	}
	// resend's plain send-email endpoint
	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
		body: JSON.stringify({ from, to: email, subject: "Confirm your email", text: `Confirm your email: ${url}` }),
	})
	// log rather than throw
	if (!response.ok) {
		console.error(`resend verification email failed for ${email}: ${response.status} ${await response.text()}`)
	}
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
