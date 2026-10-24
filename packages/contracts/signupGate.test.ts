// the signup gate payloads: the credentials rule and the three proof shapes
import { expect, test } from "bun:test"
import { appSignupProofPayload, MIN_PASSWORD_LENGTH, signupCredentialsPayload } from "./signupGate"

// a password under the minimum and a malformed address both fail the credentials rule
test("the credentials payload holds the password to the minimum length", () => {
	expect(
		signupCredentialsPayload.safeParse({ email: "a@example.com", password: "x".repeat(MIN_PASSWORD_LENGTH) }).success,
	).toBe(true)
	expect(signupCredentialsPayload.safeParse({ email: "a@example.com", password: "short" }).success).toBe(false)
	expect(signupCredentialsPayload.safeParse({ email: "not an address", password: "x".repeat(20) }).success).toBe(false)
})

// each platform's proof names its own fields, and an unknown platform is rejected
test("the proof payload accepts one shape per platform", () => {
	expect(
		appSignupProofPayload.safeParse({ platform: "ios", challenge: "c", keyId: "k", attestation: "a" }).success,
	).toBe(true)
	expect(appSignupProofPayload.safeParse({ platform: "android", challenge: "c", integrityToken: "t" }).success).toBe(
		true,
	)
	expect(appSignupProofPayload.safeParse({ platform: "development", challenge: "c" }).success).toBe(true)
	expect(appSignupProofPayload.safeParse({ platform: "ios", challenge: "c" }).success).toBe(false)
	expect(appSignupProofPayload.safeParse({ platform: "web", challenge: "c" }).success).toBe(false)
})
