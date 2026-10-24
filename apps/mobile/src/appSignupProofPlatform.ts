// which proof a build sends to the app signup gate. pure logic, with no native module
import type { AppSignupProof } from "@carlnotes/contracts/signupGate"

// which proof a build sends
export type AppSignupProofPlatform = AppSignupProof["platform"]

/**
 * Returns the proof this build sends: the development proof from a development build, which only the dev api
 * accepts, else the platform's attestation, or null on a platform that has none.
 */
export function toAppSignupProofPlatform({
	isDevelopment,
	os,
}: {
	isDevelopment: boolean
	os: string
}): AppSignupProofPlatform | null {
	// a development build never attests
	if (isDevelopment) {
		return "development"
	}

	// a release build attests on the two platforms that can
	if (os === "ios" || os === "android") {
		return os
	}
	return null
}
