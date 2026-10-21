// signup gate tests: a signed token passes once and its replay is rejected, a tampered token is rejected before Redis
// is read, and a token passes on its signature and expiry alone while Redis cannot be reached
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { restoreRedisClient, stubRedisClient, stubUnreachableRedisClient } from "@carlnotes/db/redisClientStub"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { signGateToken, verifyGateToken } from "./signupGate"

// the signing secret the tokens use, set before each test
const restoreEnvSettings = saveEnvSettings(["BETTER_AUTH_SECRET"])
beforeEach(() => {
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
})

// put the secret, the Redis client, and the spies back
afterEach(() => {
	restoreEnvSettings()
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
