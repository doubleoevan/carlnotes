// HMAC-SHA256 signing shared by the app's two hand-signed tokens: the signup-gate cookie in api/auth.ts
// and the unsubscribe link in worker/unsubscribe.ts

/**
 * The value's signature, keyed on the app's auth secret so a tampered token cannot verify. Base64url-encoded.
 */
export async function toSignature(value: string): Promise<string> {
	const secret = Bun.env.BETTER_AUTH_SECRET
	if (!secret) {
		throw new Error("BETTER_AUTH_SECRET must be set to sign a token")
	}

	// import the secret as an HMAC key, sign the value, and url-encode the result
	const encoder = new TextEncoder()
	const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
		"sign",
	])
	const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value))
	return Buffer.from(signature).toString("base64url")
}
