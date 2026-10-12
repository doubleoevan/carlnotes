// the HMAC-SHA256 digest that signs a value under a secret, and the constant-time check of a signature

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

/**
 * Returns whether a signature matches the expected one, compared in constant time so the reject takes no longer for a
 * closer guess.
 */
export function isSameSignature({ expectedSignature, signature }: IsSameSignatureOptions): boolean {
	// timingSafeEqual throws on a pair of different lengths, so the lengths are compared first
	return (
		expectedSignature.length === signature.length &&
		crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature))
	)
}
