// the app signup gate from the app's side: the attestation per platform, and the gate call that sets the cookie the
// sign-up request then sends
import { fetchAppSignupChallenge, passAppSignupGate } from "@carlnotes/client/authClient"
import type { AppSignupProof } from "@carlnotes/contracts/signupGate"
import * as AppIntegrity from "@expo/app-integrity"
import { Platform } from "react-native"
import { type AppSignupProofPlatform, toAppSignupProofPlatform } from "./appSignupProofPlatform"

// the Google Cloud project number the Play Integrity provider is prepared with. public, inlined by Metro
const PLAY_CLOUD_PROJECT_NUMBER = process.env.EXPO_PUBLIC_PLAY_CLOUD_PROJECT_NUMBER ?? ""

/**
 * Proves this install to the signup gate, which sets the gate cookie the sign-up request sends. Returns false if the
 * install could not attest or the gate rejected it.
 */
export async function verifyInstallForSignup(): Promise<boolean> {
	// the proof this build sends
	const platform = toAppSignupProofPlatform({ isDevelopment: __DEV__, os: Platform.OS })
	if (!platform) {
		return false
	}

	// attest against a fresh challenge, and pass the proof to the gate. a module that cannot attest throws
	try {
		const challenge = await fetchAppSignupChallenge()
		const gate = await passAppSignupGate(await toAppSignupProof(platform, challenge))
		if ("error" in gate) {
			console.error("the signup gate rejected this install", gate.error)
			return false
		}
		return true
	} catch (error) {
		console.error("this install could not attest for the signup gate", error)
		return false
	}
}

// the proof for the platform: a fresh App Attest key attested against the challenge, or a Play Integrity token with
// the challenge as its request hash
async function toAppSignupProof(platform: AppSignupProofPlatform, challenge: string): Promise<AppSignupProof> {
	// the development proof names the challenge alone
	if (platform === "development") {
		return { platform, challenge }
	}

	// a fresh App Attest key, attested against the challenge. the module hashes the challenge as the client data
	if (platform === "ios") {
		const keyId = await AppIntegrity.generateKeyAsync()
		const attestation = await AppIntegrity.attestKeyAsync(keyId, challenge)
		return { platform, challenge, keyId, attestation }
	}

	// a Play Integrity token with the challenge as its request hash, which Google includes verbatim
	await AppIntegrity.prepareIntegrityTokenProviderAsync(PLAY_CLOUD_PROJECT_NUMBER)
	const integrityToken = await AppIntegrity.requestIntegrityCheckAsync(challenge)
	return { platform, challenge, integrityToken }
}
