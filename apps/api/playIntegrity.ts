// Play Integrity verification for the app signup gate. the api decodes an Android install's token through Google's api
// with a service account, and checks the verdict against the package and the challenge

import { importPKCS8, SignJWT } from "jose"
import type { GateProofCheck } from "./signupGate"

// the scope the service account token asks for, and the token endpoint used if the key file names none
const PLAY_INTEGRITY_SCOPE = "https://www.googleapis.com/auth/playintegrity"
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token"

// Google's decode endpoint for one package
const PLAY_INTEGRITY_URL = "https://playintegrity.googleapis.com/v1"

// how long each call to Google may take, how long a signed assertion lives, and how early a cached token is replaced
const GOOGLE_TIMEOUT_MS = 5000
const ASSERTION_LIFETIME_SECONDS = 60 * 60
const ACCESS_TOKEN_REPLACE_MARGIN_MS = 60 * 1000

// how old a token may be. the app asks for it right before the gate
const TOKEN_MAX_AGE_MS = 5 * 60 * 1000

// the shape of an integrity token, a JWE of five base64url parts
const INTEGRITY_TOKEN_PATTERN = /^[\w-]+(\.[\w-]*){4}$/

// the verdicts a genuine install reads as
const PLAY_RECOGNIZED = "PLAY_RECOGNIZED"
const MEETS_DEVICE_INTEGRITY = "MEETS_DEVICE_INTEGRITY"

// the parts of the service account key that sign the access token request
export type PlayIntegrityServiceAccountKey = { clientEmail: string; privateKey: string; tokenUri: string }

// what one verification takes. now is the time the token's age is measured from
export interface VerifyPlayIntegrityTokenOptions {
	integrityToken: string
	challenge: string
	packageName: string
	serviceAccountKey: PlayIntegrityServiceAccountKey | null
	now?: Date
}

// the verdict fields the check reads
interface PlayIntegrityVerdict {
	requestDetails?: { requestPackageName?: string; requestHash?: string; timestampMillis?: string }
	appIntegrity?: { appRecognitionVerdict?: string }
	deviceIntegrity?: { deviceRecognitionVerdict?: string[] }
}

// the access token Google issued, kept until shortly before it expires
let cachedAccessToken: { accessToken: string; expiresAt: number } | undefined

/**
 * Returns the service account key from the environment, or null if it is unset or not a service account key.
 */
export function toPlayIntegrityServiceAccountKey(
	env: Record<string, string | undefined>,
): PlayIntegrityServiceAccountKey | null {
	// the key is the JSON file Google downloads, pasted whole
	const keyJson = env.PLAY_INTEGRITY_SERVICE_ACCOUNT_KEY?.trim()
	if (!keyJson) {
		return null
	}

	// a value that is not that file leaves Play Integrity off
	let keyFields: { client_email?: unknown; private_key?: unknown; token_uri?: unknown }
	try {
		keyFields = JSON.parse(keyJson)
	} catch {
		return null
	}

	// the file names the account and its key
	if (typeof keyFields.client_email !== "string" || typeof keyFields.private_key !== "string") {
		return null
	}

	// a key pasted on one line has literal \n sequences. restore its line breaks
	return {
		clientEmail: keyFields.client_email,
		privateKey: keyFields.private_key.replaceAll("\\n", "\n").trim(),
		tokenUri: typeof keyFields.token_uri === "string" ? keyFields.token_uri : DEFAULT_TOKEN_URI,
	}
}

/**
 * Decodes an Android install's integrity token through Google and checks its verdict for the package and challenge.
 */
export async function verifyPlayIntegrityToken({
	integrityToken,
	challenge,
	packageName,
	serviceAccountKey,
	now = new Date(),
}: VerifyPlayIntegrityTokenOptions): Promise<GateProofCheck> {
	// without the key there is nothing to decode with
	if (!serviceAccountKey) {
		return { ok: false, reason: "play integrity is off" }
	}

	// a token is a JWE of five parts. anything else never reaches Google, whose decodes are counted against a daily quota
	if (!INTEGRITY_TOKEN_PATTERN.test(integrityToken)) {
		return { ok: false, reason: "token" }
	}

	// decode the token through Google
	const accessToken = await loadAccessToken(serviceAccountKey, now)
	const decodeResponse = await fetch(`${PLAY_INTEGRITY_URL}/${encodeURIComponent(packageName)}:decodeIntegrityToken`, {
		method: "POST",
		headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
		body: JSON.stringify({ integrityToken }),
		signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
	})

	// a decode Google rejects is logged by its status, with the start of its reason. a rejected bearer drops the cached
	// token, and the next verification asks for a new one
	if (!decodeResponse.ok) {
		const responseText = await decodeResponse.text()
		console.error(`play integrity decode failed with status ${decodeResponse.status}: ${responseText.slice(0, 200)}`)
		if (decodeResponse.status === 401 || decodeResponse.status === 403) {
			clearPlayIntegrityAccessToken()
		}
		return { ok: false, reason: "decode" }
	}

	// the verdict Google decoded
	const { tokenPayloadExternal: verdict = {} } = (await decodeResponse.json()) as {
		tokenPayloadExternal?: PlayIntegrityVerdict
	}

	// the token was asked for by this package, for this challenge, and just now
	if (verdict.requestDetails?.requestPackageName !== packageName) {
		return { ok: false, reason: "package" }
	}
	if (verdict.requestDetails.requestHash !== challenge) {
		return { ok: false, reason: "challenge" }
	}

	// the app asked for the token right before the gate. an old token is a replay, and a missing time reads as old
	const tokenTimeMs = Number(verdict.requestDetails.timestampMillis)
	if (!Number.isFinite(tokenTimeMs) || Math.abs(now.getTime() - tokenTimeMs) > TOKEN_MAX_AGE_MS) {
		return { ok: false, reason: "stale" }
	}

	// a genuine install is one Play installed, on a device that meets device integrity
	if (verdict.appIntegrity?.appRecognitionVerdict !== PLAY_RECOGNIZED) {
		return { ok: false, reason: "app" }
	}
	if (!verdict.deviceIntegrity?.deviceRecognitionVerdict?.includes(MEETS_DEVICE_INTEGRITY)) {
		return { ok: false, reason: "device" }
	}
	return { ok: true }
}

/**
 * Drops the cached access token, so the next verification asks Google for a new one.
 */
export function clearPlayIntegrityAccessToken(): void {
	cachedAccessToken = undefined
}

// the token request in flight, which concurrent verifications on an empty cache share
let pendingAccessToken: Promise<string> | undefined

// the access token for Google's api, from the cache, from the request in flight, or from a newly signed assertion
function loadAccessToken(serviceAccountKey: PlayIntegrityServiceAccountKey, now: Date): Promise<string> {
	// the cached token, while it has more than the margin left
	if (cachedAccessToken && cachedAccessToken.expiresAt - ACCESS_TOKEN_REPLACE_MARGIN_MS > now.getTime()) {
		return Promise.resolve(cachedAccessToken.accessToken)
	}

	// one request at a time. the next empty cache starts a new one
	pendingAccessToken ??= fetchAccessToken(serviceAccountKey, now).finally(() => {
		pendingAccessToken = undefined
	})
	return pendingAccessToken
}

// a newly signed assertion traded for an access token, cached until shortly before it expires
async function fetchAccessToken(serviceAccountKey: PlayIntegrityServiceAccountKey, now: Date): Promise<string> {
	// the assertion's issue time, in seconds
	const issuedAtSeconds = Math.floor(now.getTime() / 1000)

	// sign the assertion that names the service account, the scope, and the token endpoint
	const assertion = await new SignJWT({ scope: PLAY_INTEGRITY_SCOPE })
		.setProtectedHeader({ alg: "RS256" })
		.setIssuer(serviceAccountKey.clientEmail)
		.setAudience(serviceAccountKey.tokenUri)
		.setIssuedAt(issuedAtSeconds)
		.setExpirationTime(issuedAtSeconds + ASSERTION_LIFETIME_SECONDS)
		.sign(await importPKCS8(serviceAccountKey.privateKey, "RS256"))

	// trade the assertion for an access token
	const tokenResponse = await fetch(serviceAccountKey.tokenUri, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
		signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
	})

	// a token request Google rejects fails the verification
	if (!tokenResponse.ok) {
		throw new Error(`the play integrity access token request failed with status ${tokenResponse.status}`)
	}

	// cache the token until shortly before it expires
	const { access_token: accessToken, expires_in: expiresInSeconds } = (await tokenResponse.json()) as {
		access_token: string
		expires_in: number
	}
	cachedAccessToken = { accessToken, expiresAt: now.getTime() + expiresInSeconds * 1000 }
	return accessToken
}
