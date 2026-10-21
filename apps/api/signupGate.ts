// the signup gate: the turnstile check that a password signup passes, signed into a short-lived cookie token that one
// signup consumes

import { deleteRedisKeys, saveRedisJson } from "@carlnotes/db/redis"
import { isSameSignature, toAuthSecretSignature } from "@carlnotes/server/hmac"

// how long a signup-gate token stays valid, as long as Turnstile's own token lives
const GATE_TOKEN_LIFETIME_MS = 5 * 60 * 1000

// the matching browser-side cookie lifetime
export const GATE_COOKIE_MAX_AGE_SECONDS = GATE_TOKEN_LIFETIME_MS / 1000

// the cookie name /api/signup-gate writes and the create.before hook reads
export const GATE_COOKIE_NAME = "signup_gate"

// what a token's signed payload includes: when it expires, and the nonce that one signup consumes
type GatePayload = { expiresAt: number; nonce: string }

/**
 * Signs a short-lived signup-gate token proving turnstile was checked, and records its nonce until it expires.
 */
export async function signGateToken(): Promise<string> {
	// sign the expiry and a fresh nonce, then record the nonce until the token expires
	const gatePayload: GatePayload = { expiresAt: Date.now() + GATE_TOKEN_LIFETIME_MS, nonce: crypto.randomUUID() }
	const payload = Buffer.from(JSON.stringify(gatePayload)).toString("base64url")
	await saveRedisJson({ key: toGateNonceKey(gatePayload.nonce), value: true, ttlMs: GATE_TOKEN_LIFETIME_MS })
	return `${payload}.${toSignature(payload)}`
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
 * Verifies a signup-gate token's signature and expiry and consumes its nonce, passing on the signature and expiry alone while Redis is down.
 */
export async function verifyGateToken(token: string): Promise<boolean> {
	// split the token into its payload and signature
	const [payload, signature] = token.split(".")
	if (!payload || !signature) {
		return false
	}

	// reject a token whose signature does not match, compared in constant time
	if (!isSameSignature({ expectedSignature: toSignature(payload), signature })) {
		return false
	}

	// signature checks out. decode the payload and enforce its expiry, then consume the nonce
	const { expiresAt, nonce } = JSON.parse(Buffer.from(payload, "base64url").toString()) as Partial<GatePayload>
	if (typeof expiresAt !== "number" || Date.now() >= expiresAt || typeof nonce !== "string") {
		return false
	}
	return consumeGateNonce(nonce)
}

// delete the nonce, which succeeds once. a nonce already consumed rejects the token, and an unreachable Redis passes it
async function consumeGateNonce(nonce: string): Promise<boolean> {
	const deletedKeyCount = await deleteRedisKeys(toGateNonceKey(nonce))
	return deletedKeyCount === null || deletedKeyCount === 1
}

// the Redis key that records an unconsumed nonce
function toGateNonceKey(nonce: string): string {
	return `signup-gate:${nonce}`
}

// the value's signature, keyed on the app's auth secret. HMAC-SHA256, base64url-encoded for a cookie-safe, url-safe
// string
function toSignature(value: string): string {
	return toAuthSecretSignature({ value, purpose: "the signup-gate cookie", encoding: "base64url" })
}
