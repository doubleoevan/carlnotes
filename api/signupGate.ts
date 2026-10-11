// the signup gate: the turnstile check that a password signup passes, signed into a short-lived cookie token

// how long a signup-gate token stays valid
const GATE_TOKEN_LIFETIME_MS = 15 * 60 * 1000

// the matching browser-side cookie lifetime
export const GATE_COOKIE_MAX_AGE_SECONDS = GATE_TOKEN_LIFETIME_MS / 1000

// the cookie name /api/signup-gate writes and the create.before hook reads
export const GATE_COOKIE_NAME = "signup_gate"

/**
 * Signs a short-lived token proving turnstile was checked, for the signup-gate cookie.
 */
export async function signGateToken(): Promise<string> {
	const expiresAt = Date.now() + GATE_TOKEN_LIFETIME_MS
	const payload = Buffer.from(JSON.stringify({ expiresAt })).toString("base64url")
	return `${payload}.${await toSignature(payload)}`
}

/**
 * Verifies a turnstile token server-side against cloudflare. Required on the password signup path only.
 */
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

/**
 * Verifies a signup-gate token's signature and expiry.
 */
export async function verifyGateToken(token: string): Promise<boolean> {
	// split the token into its payload and signature
	const [payload, signature] = token.split(".")
	if (!payload || !signature) {
		return false
	}

	// the compare is constant time, so a wrong signature leaks nothing by how long it takes to reject.
	// the lengths are checked first because timingSafeEqual throws on a mismatched pair
	const expectedSignature = await toSignature(payload)
	const isSignatureValid =
		expectedSignature.length === signature.length &&
		crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature))
	if (!isSignatureValid) {
		return false
	}

	// signature checks out. decode the payload and enforce its expiry
	const { expiresAt } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { expiresAt: number }
	return Date.now() < expiresAt
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
