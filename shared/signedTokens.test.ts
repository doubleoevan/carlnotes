// toSignature tests: the signature is deterministic for the same secret and value, and changes with either
import { expect, test } from "bun:test"
import { toSignature } from "./signedTokens"

// a fixed secret so the HMAC signature is deterministic when the environment doesn't provide one
Bun.env.BETTER_AUTH_SECRET ??= "signed-tokens-test-secret"

// every signup-gate cookie and unsubscribe link already sent was signed with HMAC-SHA256, base64url-encoded.
// changing either would still be deterministic and secret-sensitive, so only a known answer catches it
test("toSignature holds the wire format every issued token was signed with", async () => {
	const originalSecret = Bun.env.BETTER_AUTH_SECRET
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
	expect(await toSignature("carlnotes")).toBe("KFqjMqQWvALqBJRhbF2ebq3lcexVhsgfe1WduItVTys")
	Bun.env.BETTER_AUTH_SECRET = originalSecret
})

// the same value and secret always sign the same, while a different value or secret signs differently
test("toSignature is deterministic and sensitive to both the value and the secret", async () => {
	// signing the same value twice is deterministic
	expect(await toSignature("payload")).toBe(await toSignature("payload"))

	// a different value signs differently
	expect(await toSignature("payload")).not.toBe(await toSignature("other-payload"))

	// a different secret signs differently for the same value
	const originalSecret = Bun.env.BETTER_AUTH_SECRET
	const signedWithOriginalSecret = await toSignature("payload")
	Bun.env.BETTER_AUTH_SECRET = "a-different-secret"
	expect(await toSignature("payload")).not.toBe(signedWithOriginalSecret)
	Bun.env.BETTER_AUTH_SECRET = originalSecret
})

// signing without the auth secret set fails loudly instead of producing an unkeyed signature
test("toSignature throws when BETTER_AUTH_SECRET is unset", async () => {
	const originalSecret = Bun.env.BETTER_AUTH_SECRET
	Bun.env.BETTER_AUTH_SECRET = ""
	await expect(toSignature("payload")).rejects.toThrow("BETTER_AUTH_SECRET must be set to sign a token")
	Bun.env.BETTER_AUTH_SECRET = originalSecret
})
