// the Sign in with Apple provider. this module reads the Doppler values and signs the client secret with the .p8 key

import { MOBILE_APP_BUNDLE_IDENTIFIER } from "@carlnotes/contracts/mobileApp"
import { db, schema } from "@carlnotes/db"
import { reportError } from "@carlnotes/server/monitoring"
import type { AppleOptions } from "better-auth/social-providers"
import { and, eq } from "drizzle-orm"
import { importPKCS8, SignJWT } from "jose"
import { APPLE_ID_ORIGIN, toCanonicalProfileEmail } from "./authHooks"

// how long a client secret stays valid. Apple rejects a client secret that lives longer than 15,777,000 seconds
export const APPLE_CLIENT_SECRET_LIFETIME_SECONDS = 30 * 24 * 60 * 60

// Better Auth's id for the Apple provider. an Apple accounts row stores this id as its provider id
export const APPLE_PROVIDER_ID = "apple"

// Apple's endpoint that revokes a user's tokens, and how long the account close waits for that endpoint
const APPLE_REVOKE_URL = `${APPLE_ID_ORIGIN}/auth/revoke`
const APPLE_REVOKE_TIMEOUT_MS = 5000

// how often a running api signs a new client secret. the current secret still has three weeks left then
const APPLE_CLIENT_SECRET_REPLACE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

// the four Doppler values that sign Apple's client secret
const APPLE_VALUE_NAMES = ["APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"] as const

// the provider options that leave Apple off
const DISABLED_APPLE_PROVIDER_OPTIONS = { clientId: "", enabled: false }

// the values that sign a client secret. clientId is the Services ID
export interface AppleProviderValues {
	clientId: string
	teamId: string
	keyId: string
	privateKey: string
}

// the options for Better Auth's apple provider. enabled is false if Apple is off
export type AppleProviderOptions = AppleOptions & { enabled?: boolean }

/**
 * Returns the Apple provider's options with a newly signed client secret, or options that leave Apple off.
 */
export async function toAppleProviderOptions(env: Record<string, string | undefined>): Promise<AppleProviderOptions> {
	// without all four values, Apple stays off
	const appleProviderValues = toAppleProviderValues(env)
	if (!appleProviderValues) {
		return DISABLED_APPLE_PROVIDER_OPTIONS
	}

	// sign the first client secret. a key that will not sign leaves Apple off instead of stopping the api
	let clientSecret: string
	try {
		clientSecret = await toAppleClientSecret(appleProviderValues)
	} catch (error) {
		console.error("could not sign the apple client secret, so apple sign-in is off", error)
		reportError(error, "auth")
		return DISABLED_APPLE_PROVIDER_OPTIONS
	}

	// Apple returns to the dev tunnel in dev only. other environments ignore the setting
	const isDev = env.DOPPLER_ENVIRONMENT === "dev"
	const devRedirectUrl = isDev && env.APPLE_DEV_REDIRECT_URL ? env.APPLE_DEV_REDIRECT_URL : undefined

	// the ID token audience is the iOS app's bundle identifier. only native sign-in checks that audience
	const appleProviderOptions: AppleProviderOptions = {
		clientId: appleProviderValues.clientId,
		clientSecret,
		appBundleIdentifier: MOBILE_APP_BUNDLE_IDENTIFIER,
		redirectURI: devRedirectUrl,
		mapProfileToUser: toAppleProfileUser,
	}

	// sign a new client secret every week. Better Auth reads the secret from these options on every token request
	setInterval(() => {
		void replaceAppleClientSecret(appleProviderOptions, appleProviderValues)
	}, APPLE_CLIENT_SECRET_REPLACE_INTERVAL_MS).unref()
	return appleProviderOptions
}

/**
 * Returns an Apple profile's canonical address, or the stored address of the user who holds the Apple account.
 */
export async function toAppleProfileUser(profile: { sub: string; email?: string | null }): Promise<{ email?: string }> {
	// an ID token with an email maps like Google's
	if (profile.email) {
		return toCanonicalProfileEmail(profile)
	}

	// an ID token without an email belongs to a returning user. Better Auth stops a sign-in that has no email.
	// use the email of the user who holds the Apple account
	const [appleAccountUser] = await db
		.select({ email: schema.users.email })
		.from(schema.accounts)
		.innerJoin(schema.users, eq(schema.users.id, schema.accounts.userId))
		.where(and(eq(schema.accounts.providerId, APPLE_PROVIDER_ID), eq(schema.accounts.accountId, profile.sub)))
		.limit(1)
	return appleAccountUser ? { email: appleAccountUser.email } : {}
}

/**
 * Returns the four Apple values from the environment, or null if any of them is unset.
 */
export function toAppleProviderValues(env: Record<string, string | undefined>): AppleProviderValues | null {
	// any unset value leaves Apple off
	const isEveryValueSet = APPLE_VALUE_NAMES.every((valueName) => Boolean(env[valueName]?.trim()))
	if (!isEveryValueSet) {
		return null
	}

	// trim the spaces around each value. a key pasted on one line has literal \n sequences. restore its line breaks
	return {
		clientId: env.APPLE_CLIENT_ID?.trim() ?? "",
		teamId: env.APPLE_TEAM_ID?.trim() ?? "",
		keyId: env.APPLE_KEY_ID?.trim() ?? "",
		privateKey: (env.APPLE_PRIVATE_KEY ?? "").replaceAll("\\n", "\n").trim(),
	}
}

/**
 * Signs Apple's client secret, an ES256 JWT that names the team, the Services ID, and the key.
 */
export async function toAppleClientSecret(
	appleProviderValues: AppleProviderValues,
	issuedAt: Date = new Date(),
): Promise<string> {
	// the signing key, from the .p8 file's PKCS#8 text
	const signingKey = await importPKCS8(appleProviderValues.privateKey, "ES256")

	// the claims that Apple checks. the expiry is one client secret lifetime after the issue time
	const issuedAtSeconds = Math.floor(issuedAt.getTime() / 1000)
	const appleClaims = {
		iss: appleProviderValues.teamId,
		sub: appleProviderValues.clientId,
		aud: APPLE_ID_ORIGIN,
		iat: issuedAtSeconds,
		exp: issuedAtSeconds + APPLE_CLIENT_SECRET_LIFETIME_SECONDS,
	}

	// sign the claims with the key id in the header
	return new SignJWT(appleClaims).setProtectedHeader({ alg: "ES256", kid: appleProviderValues.keyId }).sign(signingKey)
}

/**
 * Signs a new client secret into the provider options, and keeps the current secret if signing fails.
 */
export async function replaceAppleClientSecret(
	appleProviderOptions: AppleProviderOptions,
	appleProviderValues: AppleProviderValues,
): Promise<void> {
	try {
		appleProviderOptions.clientSecret = await toAppleClientSecret(appleProviderValues)
	} catch (error) {
		console.error("could not sign a new apple client secret, so the current one stays", error)
		reportError(error, "auth")
	}
}

/**
 * Revokes the Sign in with Apple refresh tokens that a closing account holds, and reports a revoke that fails.
 */
export async function revokeAppleTokens(
	appleProviderOptions: AppleProviderOptions | undefined,
	userId: string,
): Promise<void> {
	// without a registered Apple provider there is no client secret to revoke with
	const { clientSecret } = appleProviderOptions ?? {}
	if (!appleProviderOptions || appleProviderOptions.enabled === false || !clientSecret) {
		return
	}

	// the refresh tokens of the user's Apple accounts. Apple's token endpoint issued each refresh token.
	// a native client can store an access token unchecked. the close never sends an access token
	const appleAccountRows = await db
		.select({ refreshToken: schema.accounts.refreshToken })
		.from(schema.accounts)
		.where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.providerId, APPLE_PROVIDER_ID)))
	const refreshTokens = appleAccountRows.flatMap((appleAccountRow) =>
		appleAccountRow.refreshToken ? [appleAccountRow.refreshToken] : [],
	)

	// revoke every refresh token at once. a slow Apple then holds the close for one timeout at most
	const clientId = String(appleProviderOptions.clientId)
	await Promise.all(
		refreshTokens.map((refreshToken) =>
			revokeAppleRefreshToken({ clientId, clientSecret, refreshToken }).catch((error: unknown) => {
				console.error(`could not revoke the apple token of user ${userId}`, error)
				reportError(error, "auth", { userId })
			}),
		),
	)
}

// the values that one revoke request sends
interface RevokeAppleRefreshTokenOptions {
	clientId: string
	clientSecret: string
	refreshToken: string
}

// post one refresh token to Apple's revoke endpoint. throw an error with Apple's reason if Apple rejects the token
async function revokeAppleRefreshToken({
	clientId,
	clientSecret,
	refreshToken,
}: RevokeAppleRefreshTokenOptions): Promise<void> {
	const revokeFields = {
		client_id: clientId,
		client_secret: clientSecret,
		token: refreshToken,
		token_type_hint: "refresh_token",
	}
	const response = await fetch(APPLE_REVOKE_URL, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams(revokeFields),
		signal: AbortSignal.timeout(APPLE_REVOKE_TIMEOUT_MS),
	})

	// Apple accepts a revoke with a 200. a rejection's body names the reason, such as invalid_client
	const responseText = await response.text()
	if (!response.ok) {
		throw new Error(`apple rejected the token revoke with status ${response.status}: ${responseText.slice(0, 200)}`)
	}
}
