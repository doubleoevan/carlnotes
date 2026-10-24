// the signup gate as both clients see it: the gate cookie's name, the password rule, and the app gate's challenge and
// proof shapes

import { z } from "zod"

// the cookie the two gate routes write and the signup route reads
export const GATE_COOKIE_NAME = "signup_gate"

// the minimum password length. above Better Auth's default of 8
export const MIN_PASSWORD_LENGTH = 12

// the email and password a signup form sends
export const signupCredentialsPayload = z.object({
	email: z.email(),
	password: z.string().min(MIN_PASSWORD_LENGTH),
})

// the single-use challenge the app gate issues, a signed token the proof names
const appSignupChallenge = z.string().min(1).max(512)

// the proof an app sends with its challenge: an App Attest attestation, a Play Integrity token, or the development
// proof that only the dev api accepts
export const appSignupProofPayload = z.discriminatedUnion("platform", [
	z.object({
		platform: z.literal("ios"),
		challenge: appSignupChallenge,
		keyId: z.string().min(1).max(128),
		attestation: z.string().min(1).max(32_768),
	}),
	z.object({
		platform: z.literal("android"),
		challenge: appSignupChallenge,
		integrityToken: z.string().min(1).max(32_768),
	}),
	z.object({ platform: z.literal("development"), challenge: appSignupChallenge }),
])
export type AppSignupProof = z.infer<typeof appSignupProofPayload>
