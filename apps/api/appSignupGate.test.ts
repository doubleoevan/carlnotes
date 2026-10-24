// app signup gate tests: the challenge, the proof per platform, the development proof in dev alone, the replayed and
// missing proofs, and the gate cookie a passing proof sets
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { GATE_COOKIE_NAME } from "@carlnotes/contracts/signupGate"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import * as analytics from "@carlnotes/server/analytics"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { apiRoute } from "./api"
import * as appAttest from "./appAttest"
import { verifyAppSignupProof } from "./appSignupGate"
import * as playIntegrity from "./playIntegrity"
import { APP_SIGNUP_GATE_RATE_LIMIT } from "./rateLimit"
import { verifyGateToken } from "./signupGate"
import { signInAs, toJsonRequest } from "./testSession"

// the signing secret, the environment, and the Apple team id, set per test
const restoreEnvSettings = saveEnvSettings(["BETTER_AUTH_SECRET", "DOPPLER_ENVIRONMENT", "APPLE_TEAM_ID"])
beforeEach(() => {
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
	Bun.env.DOPPLER_ENVIRONMENT = "dev"
	stubRedisClient()
	signInAs(null)
})

// put the settings, the Redis client, and the spies back
afterEach(() => {
	restoreEnvSettings()
	restoreRedisClient()
	mock.restore()
})

// ask the gate for a challenge
async function fetchChallenge(): Promise<string> {
	const response = await apiRoute.request("/api/signup-gate/app-challenge", { method: "POST" })
	expect(response.status).toBe(200)
	return ((await response.json()) as { challenge: string }).challenge
}

// send a proof to the gate
async function postProof(proof: Record<string, unknown>): Promise<Response> {
	return await apiRoute.request("/api/signup-gate/app", toJsonRequest(proof))
}

// the gate cookie's token from a response, or null if the response set none
function toGateCookieToken(response: Response): string | null {
	const setCookie = response.headers.get("set-cookie") ?? ""
	const gateCookie = setCookie.split(";")[0] ?? ""
	return gateCookie.startsWith(`${GATE_COOKIE_NAME}=`) ? gateCookie.slice(GATE_COOKIE_NAME.length + 1) : null
}

// the development proof passes the dev api, and the cookie it sets passes a signup's gate check
test("the development proof sets a gate cookie that a signup then passes in dev", async () => {
	const response = await postProof({ platform: "development", challenge: await fetchChallenge() })
	expect(response.status).toBe(200)

	// the cookie is the signup gate's own token
	const gateToken = toGateCookieToken(response)
	expect(gateToken).not.toBeNull()
	expect(await verifyGateToken(gateToken ?? "")).toBe(true)
})

// a production api rejects the development proof and reports the rejection
test("the development proof is rejected outside dev", async () => {
	const trackVisitorEventSpy = spyOn(analytics, "trackVisitorEvent").mockImplementation(() => {})
	const challenge = await fetchChallenge()
	Bun.env.DOPPLER_ENVIRONMENT = "prd"

	// the proof is rejected with no cookie, and the rejection names the platform and reason
	const response = await postProof({ platform: "development", challenge })
	expect(response.status).toBe(400)
	expect(toGateCookieToken(response)).toBeNull()
	expect(trackVisitorEventSpy).toHaveBeenCalledWith("signup_gate_rejected", {
		platform: "development",
		reason: "development proof outside dev",
	})
})

// a challenge passes once. the second proof with it finds the challenge consumed
test("a replayed challenge is rejected", async () => {
	const challenge = await fetchChallenge()
	expect((await postProof({ platform: "development", challenge })).status).toBe(200)
	const replayResponse = await postProof({ platform: "development", challenge })
	expect(replayResponse.status).toBe(400)
	expect(await replayResponse.text()).toContain("challenge")
})

// a forged challenge never reaches a verifier
test("a forged challenge is rejected", async () => {
	const verifyAppAttestationSpy = spyOn(appAttest, "verifyAppAttestation")
	const response = await postProof({ platform: "ios", challenge: "forged", keyId: "k", attestation: "a" })
	expect(response.status).toBe(400)
	expect(verifyAppAttestationSpy).not.toHaveBeenCalled()
})

// a proof with no platform, and a request with no body, are rejected by the payload
test("a missing proof is rejected", async () => {
	expect((await postProof({ challenge: "c" })).status).toBe(400)
	expect((await apiRoute.request("/api/signup-gate/app", { method: "POST" })).status).toBe(400)
})

// a verified attestation sets the cookie, and the verifier gets the team's app id
test("a verified App Attest attestation passes the gate", async () => {
	Bun.env.APPLE_TEAM_ID = "TEAM123"
	const verifyAppAttestationSpy = spyOn(appAttest, "verifyAppAttestation").mockResolvedValue({ ok: true })
	const challenge = await fetchChallenge()

	// the proof passes, and the verifier was asked for the app id in the development environment too
	const response = await postProof({ platform: "ios", challenge, keyId: "key-1", attestation: "attestation-1" })
	expect(response.status).toBe(200)
	expect(toGateCookieToken(response)).not.toBeNull()
	expect(verifyAppAttestationSpy).toHaveBeenCalledWith({
		attestation: "attestation-1",
		keyId: "key-1",
		challenge,
		appId: "TEAM123.com.carlnotes.app",
		isDevelopmentAllowed: true,
	})
})

// a rejected attestation sets no cookie
test("a rejected App Attest attestation is rejected with its reason", async () => {
	Bun.env.APPLE_TEAM_ID = "TEAM123"
	spyOn(appAttest, "verifyAppAttestation").mockResolvedValue({ ok: false, reason: "nonce" })
	const response = await postProof({
		platform: "ios",
		challenge: await fetchChallenge(),
		keyId: "key-1",
		attestation: "attestation-1",
	})
	expect(response.status).toBe(400)
	expect(await response.text()).toContain("nonce")
	expect(toGateCookieToken(response)).toBeNull()
})

// a Play Integrity verdict passes or fails the gate as the verifier says, with the package and the challenge
test("a Play Integrity token is verified for the package and the challenge", async () => {
	const verifyPlayIntegrityTokenSpy = spyOn(playIntegrity, "verifyPlayIntegrityToken").mockResolvedValue({
		ok: false,
		reason: "device",
	})
	const challenge = await fetchChallenge()

	// the verdict's rejection is the gate's rejection
	const response = await postProof({ platform: "android", challenge, integrityToken: "token-1" })
	expect(response.status).toBe(400)
	expect(await response.text()).toContain("device")
	expect(verifyPlayIntegrityTokenSpy).toHaveBeenCalledWith({
		integrityToken: "token-1",
		challenge,
		packageName: "com.carlnotes.app",
		serviceAccountKey: null,
	})
})

// a Google that cannot be reached rejects the proof, with the reason logged, instead of failing the request
test("a Play Integrity decode that throws rejects the proof", async () => {
	spyOn(playIntegrity, "verifyPlayIntegrityToken").mockRejectedValue(new Error("offline"))
	spyOn(console, "error").mockImplementation(() => {})
	const response = await postProof({ platform: "android", challenge: await fetchChallenge(), integrityToken: "t" })
	expect(response.status).toBe(400)
	expect(await response.text()).toContain("play integrity unavailable")
})

// each gate route has the credential paths' limit per address, so a loop stops at ten a minute
test("the eleventh gate request in a minute is rate limited", async () => {
	for (let i = 0; i < APP_SIGNUP_GATE_RATE_LIMIT; i++) {
		await fetchChallenge()
	}
	const response = await apiRoute.request("/api/signup-gate/app-challenge", { method: "POST" })
	expect(response.status).toBe(429)
})

// without the team id, an iOS proof is rejected before any parsing, and the api runs on
test("an iOS proof is rejected while App Attest is off", async () => {
	delete Bun.env.APPLE_TEAM_ID
	const proofCheck = await verifyAppSignupProof(
		{ platform: "ios", challenge: "c", keyId: "k", attestation: "a" },
		{ DOPPLER_ENVIRONMENT: "prd" },
	)
	expect(proofCheck).toEqual({ ok: false, reason: "app attest is off" })
})
