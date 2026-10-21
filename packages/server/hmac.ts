// the HMAC-SHA256 digest that signs a value under a secret or under the app's auth secret, and the constant-time check
// of a signature

// a value to sign, the secret that keys the digest, and the encoding the digest is returned in
export type ToHmacDigestOptions = { value: string; secret: string; encoding: "hex" | "base64url" }

// the signature a request should have, and the signature it sent
export type IsSameSignatureOptions = { expectedSignature: string; signature: string }

/**
 * Returns the HMAC-SHA256 digest of a value under a secret, in the given encoding.
 */
export function toHmacDigest({ value, secret, encoding }: ToHmacDigestOptions): string {
	return new Bun.CryptoHasher("sha256", secret).update(value).digest(encoding)
}

// a value to sign under the app's auth secret, what the signature is for, named if the secret is unset, and its
// encoding
export type ToAuthSecretSignatureOptions = { value: string; purpose: string; encoding: "hex" | "base64url" }

/**
 * Returns the HMAC-SHA256 digest of a value under the app's auth secret, so only the app can compute it.
 * Throws an error naming the purpose if the secret is unset.
 */
export function toAuthSecretSignature({ value, purpose, encoding }: ToAuthSecretSignatureOptions): string {
	// read the auth secret, and throw an error naming the purpose if it is unset
	const secret = Bun.env.BETTER_AUTH_SECRET
	if (!secret) {
		throw new Error(`BETTER_AUTH_SECRET must be set to sign ${purpose}`)
	}
	return toHmacDigest({ value, secret, encoding })
}

/**
 * Returns whether a signature matches the expected one, compared in constant time so the reject takes no longer for a
 * closer guess.
 */
export function isSameSignature({ expectedSignature, signature }: IsSameSignatureOptions): boolean {
	// timingSafeEqual throws on buffers of different byte lengths, so the byte lengths are compared first. a character
	// count is not a byte count, since a character outside ascii takes more than one byte
	const expectedSignatureBytes = Buffer.from(expectedSignature)
	const signatureBytes = Buffer.from(signature)
	return (
		expectedSignatureBytes.length === signatureBytes.length &&
		crypto.timingSafeEqual(expectedSignatureBytes, signatureBytes)
	)
}
