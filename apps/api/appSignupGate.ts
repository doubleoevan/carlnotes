// the app signup gate: the single-use challenge an install attests against, and the proof route that verifies the
// attestation and sets the gate cookie the signup route reads

import { MOBILE_APP_BUNDLE_IDENTIFIER } from "@carlnotes/contracts/mobileApp"
import { type AppSignupProof, appSignupProofPayload } from "@carlnotes/contracts/signupGate"
import { trackVisitorEvent } from "@carlnotes/server/analytics"
import { zValidator } from "@hono/zod-validator"
import { type Context, Hono } from "hono"
import { verifyAppAttestation } from "./appAttest"
import type { AppEnv } from "./currentUser"
import { toPlayIntegrityServiceAccountKey, verifyPlayIntegrityToken } from "./playIntegrity"
import { appSignupChallengeRateLimiter, appSignupGateRateLimiter } from "./rateLimit"
import {
	APP_SIGNUP_CHALLENGE_PURPOSE,
	type GateProofCheck,
	setGateCookie,
	signGateToken,
	signSingleUseToken,
	verifySingleUseToken,
} from "./signupGate"

// the app gate routes, each under the credential paths' limit per address
export const appSignupGateRoute = new Hono<AppEnv>()
	// the challenge an install attests against. a proof consumes it, so a replayed attestation finds it gone
	.post("/signup-gate/app-challenge", appSignupChallengeRateLimiter, async (context) => {
		return context.json({ challenge: await signSingleUseToken(APP_SIGNUP_CHALLENGE_PURPOSE) })
	})
	// the proof, verified for its platform. a pass sets the same gate cookie the web's gate sets
	.post("/signup-gate/app", appSignupGateRateLimiter, zValidator("json", appSignupProofPayload), async (context) => {
		// consume the challenge first, so a rejected proof cannot be sent again
		const proof = context.req.valid("json")
		if (!(await verifySingleUseToken(APP_SIGNUP_CHALLENGE_PURPOSE, proof.challenge))) {
			return rejectProof(context, proof.platform, "challenge")
		}

		// verify the proof, and set the gate cookie that the signup route reads
		const proofCheck = await verifyAppSignupProof(proof, Bun.env)
		if (!proofCheck.ok) {
			return rejectProof(context, proof.platform, proofCheck.reason)
		}
		setGateCookie(context, await signGateToken())
		return context.json({ ok: true })
	})

/**
 * Verifies an app's proof for its platform: App Attest on iOS, Play Integrity on Android, and the development proof
 * that only the dev api accepts.
 */
export async function verifyAppSignupProof(
	proof: AppSignupProof,
	env: Record<string, string | undefined>,
): Promise<GateProofCheck> {
	const isDev = env.DOPPLER_ENVIRONMENT === "dev"

	// the development proof passes in dev alone
	if (proof.platform === "development") {
		return isDev ? { ok: true } : { ok: false, reason: "development proof outside dev" }
	}

	// an Android proof is a Play Integrity token, decoded with the service account. a Google that cannot be reached
	// rejects the proof instead of failing the request
	if (proof.platform === "android") {
		return verifyPlayIntegrityToken({
			integrityToken: proof.integrityToken,
			challenge: proof.challenge,
			packageName: MOBILE_APP_BUNDLE_IDENTIFIER,
			serviceAccountKey: toPlayIntegrityServiceAccountKey(env),
		}).catch((error: unknown) => {
			console.error("play integrity could not be reached", error)
			return { ok: false, reason: "play integrity unavailable" }
		})
	}

	// an iOS proof is an App Attest attestation for the team's app id. without the team id, App Attest is off
	const teamId = env.APPLE_TEAM_ID?.trim()
	if (!teamId) {
		return { ok: false, reason: "app attest is off" }
	}
	return verifyAppAttestation({
		attestation: proof.attestation,
		keyId: proof.keyId,
		challenge: proof.challenge,
		appId: `${teamId}.${MOBILE_APP_BUNDLE_IDENTIFIER}`,
		isDevelopmentAllowed: isDev,
	})
}

// reject a proof with its reason, and report the rejection by platform
function rejectProof(context: Context<AppEnv>, platform: AppSignupProof["platform"], reason: string): Response {
	trackVisitorEvent("signup_gate_rejected", { platform, reason })
	return context.json({ error: `proof rejected: ${reason}` }, 400)
}
