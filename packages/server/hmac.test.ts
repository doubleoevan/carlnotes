// hmac tests: the digest matches the Web Crypto HMAC-SHA256 of the same value and secret, in hex and in base64url,
// and the signature check passes only an exact match
import { expect, test } from "bun:test"
import { isSameSignature, toHmacDigest } from "./hmac"

// a digest is the same bytes Web Crypto signs, so a signature from either side verifies on the other
test("the digest matches the Web Crypto HMAC-SHA256 in hex and in base64url", async () => {
	// sign the value with Web Crypto under the same secret
	const signingKey = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode("shhh"),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	)
	const webCryptoDigest = Buffer.from(await crypto.subtle.sign("HMAC", signingKey, new TextEncoder().encode("body")))

	// both encodings name the same bytes
	expect(toHmacDigest({ value: "body", secret: "shhh", encoding: "hex" })).toBe(webCryptoDigest.toString("hex"))
	expect(toHmacDigest({ value: "body", secret: "shhh", encoding: "base64url" })).toBe(
		webCryptoDigest.toString("base64url"),
	)
})

// a signature passes only if every character matches, and one of another length fails without throwing an error
test("isSameSignature passes an exact match and fails a different or shorter signature", () => {
	expect(isSameSignature({ expectedSignature: "abc123", signature: "abc123" })).toBe(true)
	expect(isSameSignature({ expectedSignature: "abc123", signature: "abc124" })).toBe(false)
	expect(isSameSignature({ expectedSignature: "abc123", signature: "abc" })).toBe(false)
})

// a request's signature with the same character count and more bytes fails instead of throwing an error, which would
// turn a bad signature into a 500
test("isSameSignature fails a signature of the same character count and another byte count", () => {
	expect(isSameSignature({ expectedSignature: "ab", signature: "éé" })).toBe(false)
	expect(isSameSignature({ expectedSignature: "a".repeat(64), signature: "é".repeat(64) })).toBe(false)
})
