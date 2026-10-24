// the signup gate: a short-lived token that passes once. the web's gate signs it after the turnstile check, and the
// app's gate signs its challenge the same way

import { GATE_COOKIE_NAME } from "@carlnotes/contracts/signupGate"
import { deleteRedisKeys, saveRedisJson } from "@carlnotes/db/redis"
import { isSameSignature, toAuthSecretSignature } from "@carlnotes/server/hmac"
import type { Context } from "hono"
import { setCookie } from "hono/cookie"
import type { AppEnv } from "./currentUser"

// how long a single-use token stays valid, as long as Turnstile's own token lives
const SINGLE_USE_TOKEN_LIFETIME_MS = 5 * 60 * 1000

// the matching browser-side cookie lifetime
const GATE_COOKIE_MAX_AGE_SECONDS = SINGLE_USE_TOKEN_LIFETIME_MS / 1000

// what a token is for: the purpose its signature is keyed on, and the Redis key prefix its nonce is recorded under
export type SingleUsePurpose = { signaturePurpose: string; redisKeyPrefix: string }

// the gate cookie a signup consumes, and the challenge an app's attestation answers
export const GATE_TOKEN_PURPOSE: SingleUsePurpose = {
	signaturePurpose: "the signup-gate cookie",
	redisKeyPrefix: "signup-gate",
}
export const APP_SIGNUP_CHALLENGE_PURPOSE: SingleUsePurpose = {
	signaturePurpose: "the app signup challenge",
	redisKeyPrefix: "app-signup-challenge",
}

// what a check of an install's proof returns: a pass, or the reason the proof was rejected
export type GateProofCheck = { ok: true } | { ok: false; reason: string }

// what a token's signed payload includes: when it expires, and the nonce that one use consumes
type SingleUsePayload = { expiresAt: number; nonce: string }

/**
 * Signs a short-lived single-use token for a purpose, and records its nonce until it expires.
 */
export async function signSingleUseToken(purpose: SingleUsePurpose): Promise<string> {
	// sign the expiry and a fresh nonce, then record the nonce until the token expires
	const singleUsePayload: SingleUsePayload = {
		expiresAt: Date.now() + SINGLE_USE_TOKEN_LIFETIME_MS,
		nonce: crypto.randomUUID(),
	}
	const payload = Buffer.from(JSON.stringify(singleUsePayload)).toString("base64url")
	await saveRedisJson({
		key: toNonceKey(purpose, singleUsePayload.nonce),
		value: true,
		ttlMs: SINGLE_USE_TOKEN_LIFETIME_MS,
	})
	return `${payload}.${toSignature(purpose, payload)}`
}

/**
 * Verifies a single-use token's signature and expiry for its purpose and consumes its nonce, passing on the signature
 * and expiry alone while Redis is down.
 */
export async function verifySingleUseToken(purpose: SingleUsePurpose, token: string): Promise<boolean> {
	// split the token into its payload and signature
	const [payload, signature] = token.split(".")
	if (!payload || !signature) {
		return false
	}

	// reject a token whose signature does not match, compared in constant time
	if (!isSameSignature({ expectedSignature: toSignature(purpose, payload), signature })) {
		return false
	}

	// signature checks out. decode the payload and enforce its expiry, then consume the nonce
	const { expiresAt, nonce } = JSON.parse(Buffer.from(payload, "base64url").toString()) as Partial<SingleUsePayload>
	if (typeof expiresAt !== "number" || Date.now() >= expiresAt || typeof nonce !== "string") {
		return false
	}
	return consumeNonce(purpose, nonce)
}

/**
 * Signs a gate token proving a signup's check passed, which one signup consumes.
 */
export function signGateToken(): Promise<string> {
	return signSingleUseToken(GATE_TOKEN_PURPOSE)
}

/**
 * Verifies a gate token and consumes it.
 */
export function verifyGateToken(token: string): Promise<boolean> {
	return verifySingleUseToken(GATE_TOKEN_PURPOSE, token)
}

/**
 * Sets the gate cookie that the signup route reads, which the web's gate and the app's gate both set.
 */
export function setGateCookie(context: Context<AppEnv>, gateToken: string): void {
	setCookie(context, GATE_COOKIE_NAME, gateToken, {
		httpOnly: true,
		sameSite: "Lax",
		maxAge: GATE_COOKIE_MAX_AGE_SECONDS,
		path: "/",
	})
}

/**
 * Verifies a turnstile token server-side against cloudflare. Required on the web's password signup path only.
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

// delete the nonce, which succeeds once. a nonce already consumed rejects the token, and an unreachable Redis passes it
async function consumeNonce(purpose: SingleUsePurpose, nonce: string): Promise<boolean> {
	const deletedKeyCount = await deleteRedisKeys(toNonceKey(purpose, nonce))
	return deletedKeyCount === null || deletedKeyCount === 1
}

// the Redis key that records an unconsumed nonce
function toNonceKey(purpose: SingleUsePurpose, nonce: string): string {
	return `${purpose.redisKeyPrefix}:${nonce}`
}

// the value's signature, keyed on the app's auth secret, over the purpose and the value. a token signed for one purpose
// never verifies for another. HMAC-SHA256, base64url-encoded for a cookie-safe, url-safe string
function toSignature(purpose: SingleUsePurpose, value: string): string {
	return toAuthSecretSignature({
		value: `${purpose.signaturePurpose}\n${value}`,
		purpose: purpose.signaturePurpose,
		encoding: "base64url",
	})
}
