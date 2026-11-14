// signup gate tests: a signed token passes once and its replay is rejected, a tampered token is rejected before Redis
// is read, a token passes on its signature and expiry alone while Redis cannot be reached, and a turnstile check that
// times out reads as a failed check
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { restoreRedisClient, stubRedisClient, stubUnreachableRedisClient } from "@carlnotes/db/redisClientStub"
import { quietErrorReports } from "@carlnotes/server/monitoringTestFixtures"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { apiRoute } from "./api"
import {
	APP_SIGNUP_CHALLENGE_PURPOSE,
	signGateToken,
	signSingleUseToken,
	verifyGateToken,
	verifySingleUseToken,
	verifyTurnstileToken,
} from "./signupGate"
import { signInAs, toJsonRequest } from "./testSession"

// the real fetch and the real time limit, which the turnstile tests replace
const realFetch = globalThis.fetch
const realAbortSignalTimeout = AbortSignal.timeout.bind(AbortSignal)

// the signing secret the tokens use and a turnstile secret, set before each test
const restoreEnvSettings = saveEnvSettings(["BETTER_AUTH_SECRET", "TURNSTILE_SECRET_KEY"])
beforeEach(() => {
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
	Bun.env.TURNSTILE_SECRET_KEY = "test-turnstile-secret"
})

// put the secrets, the fetch, the Redis client, and the spies back
afterEach(() => {
	restoreEnvSettings()
	globalThis.fetch = realFetch
	restoreRedisClient()
	mock.restore()
})

// a token is consumed by the signup it passes, so the same cookie cannot create a second account
test("a signed token passes once and its replay is rejected", async () => {
	// the nonce is recorded when the token is signed
	const storedValueByKey = stubRedisClient()
	const token = await signGateToken()
	expect([...storedValueByKey.keys()].some((key) => key.startsWith("signup-gate:"))).toBe(true)

	// the first check consumes the nonce, and the second finds it gone
	expect(await verifyGateToken(token)).toBe(true)
	expect(await verifyGateToken(token)).toBe(false)
	expect([...storedValueByKey.keys()].some((key) => key.startsWith("signup-gate:"))).toBe(false)
})

// a token whose payload or signature was changed fails the signature check, and its nonce is never read
test("a tampered token is rejected before its nonce is read", async () => {
	const storedValueByKey = stubRedisClient()
	const [payload, signature] = (await signGateToken()).split(".")

	// a changed payload, a changed signature, and a token with no signature
	const alteredPayload = Buffer.from(JSON.stringify({ expiresAt: Date.now() + 60_000, nonce: "forged" })).toString(
		"base64url",
	)
	expect(await verifyGateToken(`${alteredPayload}.${signature}`)).toBe(false)
	expect(await verifyGateToken(`${payload}.${signature?.slice(1)}x`)).toBe(false)
	expect(await verifyGateToken(payload ?? "")).toBe(false)
	expect([...storedValueByKey.keys()].some((key) => key.startsWith("signup-gate:"))).toBe(true)
})

// a token is signed for one purpose. the app's challenge never passes as a gate cookie, and a gate cookie never passes
// as a challenge
test("a token verifies for its own purpose alone", async () => {
	const storedValueByKey = stubRedisClient()
	const challenge = await signSingleUseToken(APP_SIGNUP_CHALLENGE_PURPOSE)
	const gateToken = await signGateToken()
	expect([...storedValueByKey.keys()].some((key) => key.startsWith("app-signup-challenge:"))).toBe(true)

	// each token fails the other purpose's signature, and passes its own
	expect(await verifyGateToken(challenge)).toBe(false)
	expect(await verifySingleUseToken(APP_SIGNUP_CHALLENGE_PURPOSE, gateToken)).toBe(false)
	expect(await verifySingleUseToken(APP_SIGNUP_CHALLENGE_PURPOSE, challenge)).toBe(true)
	expect(await verifyGateToken(gateToken)).toBe(true)
})

// the purpose is in the signature itself. a free challenge never passes as a gate cookie while Redis is down and the
// nonce is not checked
test("a challenge never passes as a gate cookie while Redis cannot be reached", async () => {
	stubUnreachableRedisClient()
	spyOn(console, "error").mockImplementation(() => {})
	const challenge = await signSingleUseToken(APP_SIGNUP_CHALLENGE_PURPOSE)
	expect(await verifyGateToken(challenge)).toBe(false)
})

// a Redis outage keeps signups working on the signed expiry alone
test("a token passes on its signature and expiry alone while Redis cannot be reached", async () => {
	// a Redis client that never connects, so the nonce is neither recorded nor consumed
	stubUnreachableRedisClient()
	spyOn(console, "error").mockImplementation(() => {})

	// the token passes, and passes again
	const token = await signGateToken()
	expect(await verifyGateToken(token)).toBe(true)
	expect(await verifyGateToken(token)).toBe(true)
})

// a cloudflare that never responds, and a time limit that passes after a millisecond. returns the spy on the time limit
function stubUnansweredTurnstileCheck(): ReturnType<typeof spyOn<typeof AbortSignal, "timeout">> {
	// only the request's own time limit ends the check
	globalThis.fetch = ((_url: RequestInfo | URL, init?: RequestInit) =>
		new Promise<Response>((_resolve, reject) => {
			init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))
		})) as typeof fetch
	return spyOn(AbortSignal, "timeout").mockImplementation(() => realAbortSignalTimeout(1))
}

// a check that cloudflare leaves unanswered is abandoned at five seconds, reported, and read as a failed check
test("a turnstile check that times out reads as a failed check", async () => {
	const reportErrorSpy = quietErrorReports()
	const abortSignalTimeoutSpy = stubUnansweredTurnstileCheck()
	expect(await verifyTurnstileToken("token")).toBe(false)
	expect(abortSignalTimeoutSpy).toHaveBeenCalledWith(5000)
	expect(reportErrorSpy).toHaveBeenCalledWith(expect.any(Error), "auth", { check: "turnstile" })
})

// any other failure of the check is still thrown
test("a turnstile check that fails without timing out throws its failure", async () => {
	globalThis.fetch = (async () => {
		throw new Error("connection reset")
	}) as unknown as typeof fetch
	await expect(verifyTurnstileToken("token")).rejects.toThrow("connection reset")
})

// the gate responds to a timed-out check as it does to an invalid token, and sets no gate cookie for a signup to pass
test("the signup gate rejects a timed-out check as it rejects an invalid token", async () => {
	quietErrorReports()
	stubRedisClient()
	signInAs(null)

	// a token that cloudflare rejects
	globalThis.fetch = (async () => Response.json({ success: false })) as unknown as typeof fetch
	const invalidTokenResponse = await apiRoute.request("/api/signup-gate", toJsonRequest({ turnstileToken: "token" }))

	// a check that cloudflare never responds to
	stubUnansweredTurnstileCheck()
	const timedOutResponse = await apiRoute.request("/api/signup-gate", toJsonRequest({ turnstileToken: "token" }))
	expect(timedOutResponse.status).toBe(400)
	expect(timedOutResponse.status).toBe(invalidTokenResponse.status)
	expect(await timedOutResponse.json()).toEqual(await invalidTokenResponse.json())
	expect(timedOutResponse.headers.get("set-cookie")).toBeNull()
})
