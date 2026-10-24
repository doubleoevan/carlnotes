// Sign in with Apple through the native sheet on iOS: the nonce, the sheet, and the ID token posted to the api
import { OAUTH_ERROR_TEXT } from "@carlnotes/core/lib/sessionCopy"
import * as AppleAuthentication from "expo-apple-authentication"
import * as Crypto from "expo-crypto"
import { mobileAuthClient } from "./authClient"

// the error code the sheet throws if the visitor cancels it
const APPLE_SHEET_CANCELLED_CODE = "ERR_REQUEST_CANCELED"

/**
 * Opens Apple's sheet and signs the visitor in with its ID token. Returns the line the screen shows if the sign-in did
 * not complete, or null after a sign-in or a sheet the visitor cancelled. The sheet gets the nonce's SHA-256, and the
 * api gets the raw nonce, which it compares by its hash, and the name the first authorization returns.
 */
export async function signInWithAppleSheet(): Promise<string | null> {
	// a fresh nonce, hashed for the sheet
	const nonce = Crypto.randomUUID()
	const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce)

	// the sheet. a sheet that fails throws, and reads as a sign-in that did not open
	try {
		const credential = await AppleAuthentication.signInAsync({
			requestedScopes: [
				AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
				AppleAuthentication.AppleAuthenticationScope.EMAIL,
			],
			nonce: hashedNonce,
		})
		if (!credential.identityToken) {
			return OAUTH_ERROR_TEXT
		}

		// the ID token with the raw nonce, and the sheet's name on the first authorization
		const { error } = await mobileAuthClient.signIn.social({
			provider: "apple",
			idToken: { token: credential.identityToken, nonce, user: toAppleUser(credential.fullName) },
		})
		return error ? OAUTH_ERROR_TEXT : null
	} catch (error) {
		// a cancelled sheet is the visitor's choice and shows no line
		if (isAppleSheetCancelled(error)) {
			return null
		}
		console.error("the apple sheet did not complete", error)
		return OAUTH_ERROR_TEXT
	}
}

// whether the sheet threw because the visitor cancelled it
function isAppleSheetCancelled(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === APPLE_SHEET_CANCELLED_CODE
}

// the name as Apple's web callback posts it, which the provider reads from the ID token's user field
function toAppleUser(
	fullName: AppleAuthentication.AppleAuthenticationFullName | null,
): { name: { firstName?: string; lastName?: string } } | undefined {
	if (!fullName?.givenName && !fullName?.familyName) {
		return undefined
	}
	return { name: { firstName: fullName.givenName ?? undefined, lastName: fullName.familyName ?? undefined } }
}
